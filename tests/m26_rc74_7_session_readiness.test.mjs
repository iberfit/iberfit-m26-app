import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  buildCoachSessionReadinessContext,
  buildSessionReadinessSnapshot,
} from '../src/m26/ui/session-readiness.js';

const clientId='client-session-readiness';
const now=new Date('2026-09-04T12:00:00Z');

function baseState(){
  return {
    collections:{
      appointments:[
        {id:'a1',clientId,startAt:'2026-09-03T10:00:00Z',status:'completed'},
        {id:'a2',clientId,startAt:'2026-09-02T10:00:00Z',status:'confirmed'},
        {id:'a3',clientId,startAt:'2026-08-20T10:00:00Z',status:'completed'},
        {id:'a4',clientId,startAt:'2026-08-15T10:00:00Z',status:'confirmed'},
      ],
      sessionExecutions:[
        {id:'e1',clientId,appointmentId:'a1',completedAt:'2026-09-03T11:00:00Z',status:'completed',syncStatus:'clean',feedback:{sessionRpe:7,comment:'Técnica estable y tolerancia adecuada.',pain:false},results:[{exerciseId:'x',reps:10,loadKg:10,rpe:7}]},
        {id:'e2',clientId,appointmentId:'a3',completedAt:'2026-08-20T11:00:00Z',status:'completed',syncStatus:'clean',feedback:{pain:false},results:[{exerciseId:'x',reps:10,loadKg:11,rpe:6}]},
        {id:'e-pending',clientId,appointmentId:'a2',completedAt:'2026-09-02T11:00:00Z',status:'completed',syncStatus:'pending',feedback:{sessionRpe:10,comment:'NO USAR: ejecución todavía no confirmada.',pain:true,painNotes:'NO USAR'},results:[{exerciseId:'x',reps:10,loadKg:20,rpe:9}]},
      ],
      checkins:[
        {id:'c1',clientId,createdAt:'2026-09-04T08:00:00Z',energy:7,sleep:8,stress:3,pain:2},
      ],
      iriAssessments:[],
      wearableDailySummaries:[],
      trainingCycles:[],
      m26Entities:[{
        entityType:'action_outcome',
        entityId:'decision-open-1',
        clientId,
        status:'abierto',
        revision:1,
        body:{
          id:'decision-open-1',
          clientId,
          visibleToClient:false,
          signalSummary:'RPE alto con recuperación limitada en la última semana.',
          signalSource:'session',
          decisionSummary:'Revisar densidad antes de progresar.',
          interventionType:'load_adjustment',
          interventionSummary:'Mantener carga y aumentar descanso.',
          expectedOutcome:'RPE más estable con técnica mantenida.',
          reviewAt:'2026-09-03',
          createdAt:'2026-09-01T12:00:00Z',
          updatedAt:'2026-09-01T12:00:00Z',
        },
      }],
    },
    pendingOperations:[{operationId:'op1',type:'EJECUCION_COMPLETAR',entityId:'e-pending',clientId,status:'pending'}],
    conflicts:[],
    rejectedOperations:[],
  };
}

test('preparación de sesión usa exclusivamente progreso confirmado',()=>{
  const snapshot=buildSessionReadinessSnapshot(baseState(),clientId,{now});
  assert.equal(snapshot.constancy.days,28);
  assert.equal(snapshot.constancy.plannedSessions,4);
  assert.equal(snapshot.constancy.completedSessions,2);
  assert.equal(snapshot.constancy.adherence,0.5);
  assert.equal(snapshot.constancy.unconfirmedExecutions,1);
  assert.equal(snapshot.lastExecutionRpe,7);
  assert.deepEqual(snapshot.latestCheckin,{energy:7,sleep:8,stress:3,pain:2,fatigue:null,motivation:null});
  assert.notEqual(snapshot.attention.title,'Molestia informada tras la última sesión');
});

test('preparación de sesión muestra una señal confirmada sin convertirla en prescripción',()=>{
  const state=baseState();
  state.collections.sessionExecutions[0].feedback.pain=true;
  const snapshot=buildSessionReadinessSnapshot(state,clientId,{now});
  assert.equal(snapshot.attention.level,'warning');
  assert.match(snapshot.attention.title,/Molestia informada/i);
  assert.match(snapshot.attention.detail,/no un diagnóstico/i);
});

test('contexto profesional previo usa cierre confirmado y decisiones privadas sin contaminarse con ejecución pendiente',()=>{
  const context=buildCoachSessionReadinessContext(baseState(),clientId,{now});
  assert.ok(context);
  assert.equal(context.feedback.hasExecution,true);
  assert.equal(context.feedback.sessionRpe,7);
  assert.equal(context.feedback.comment,'Técnica estable y tolerancia adecuada.');
  assert.equal(context.feedback.pain,false);
  assert.doesNotMatch(context.feedback.comment,/NO USAR/);
  assert.equal(context.decisions.openCount,1);
  assert.equal(context.decisions.overdueCount,1);
  assert.match(context.decisions.topSignal,/RPE alto con recuperación limitada/);
});

test('contexto profesional no inventa feedback ni decisiones cuando no existen',()=>{
  const state=baseState();
  state.collections.sessionExecutions=[];
  state.collections.m26Entities=[];
  state.pendingOperations=[];
  const context=buildCoachSessionReadinessContext(state,clientId,{now});
  assert.ok(context);
  assert.equal(context.feedback.hasExecution,false);
  assert.equal(context.feedback.sessionRpe,null);
  assert.equal(context.feedback.comment,null);
  assert.equal(context.decisions.openCount,0);
  assert.equal(context.decisions.topSignal,null);
});

test('contexto profesional mantiene RPE ausente como ausente y nunca lo convierte en cero',()=>{
  const state=baseState();
  state.collections.sessionExecutions=[{
    id:'e-no-rpe',
    clientId,
    appointmentId:'a1',
    completedAt:'2026-09-03T11:00:00Z',
    status:'completed',
    syncStatus:'clean',
    feedback:{pain:false,comment:'Cierre sin RPE informado.'},
    results:[{exerciseId:'x',reps:10,loadKg:10}],
  }];
  state.collections.m26Entities=[];
  state.pendingOperations=[];
  const context=buildCoachSessionReadinessContext(state,clientId,{now});
  assert.equal(context.feedback.hasExecution,true);
  assert.equal(context.feedback.sessionRpe,null);
  assert.equal(context.feedback.comment,'Cierre sin RPE informado.');
});

test('capa previa es idempotente, mobile-first y no introduce automatización clínica',async()=>{
  const [ui,shell]=await Promise.all([
    readFile(new URL('../src/m26/ui/session-readiness.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8'),
  ]);
  assert.match(ui,/Antes de empezar/);
  assert.match(ui,/Contexto de la sesión/);
  assert.match(ui,/no cambia automáticamente cargas, series ni ejercicios/i);
  assert.match(ui,/Cualquier ajuste del plan sigue dependiendo de tu Entrenador/i);
  assert.match(ui,/data-m27-session-readiness/);
  assert.match(ui,/data-m27-coach-session-readiness/);
  assert.match(ui,/Último cierre confirmado/);
  assert.match(ui,/Decisiones del Coach/);
  assert.doesNotMatch(ui,/Sin dolor registrado/);
  assert.match(ui,/const coachContext=role==='coach'[\s\S]*buildCoachSessionReadinessContext/);
  assert.match(ui,/if\(role==='coach'\)[\s\S]*buildCoachReadinessBrief/);
  assert.match(ui,/buildNextSessionPreparation/);
  assert.match(ui,/data-session-live-state=["']ready["']/);
  assert.doesNotMatch(ui,/MutationObserver/);
  assert.doesNotMatch(ui,/service[_-]?role/i);
  assert.doesNotMatch(ui,/innerHTML/);
  assert.match(shell,/enhanceSessionReadiness/);
  assert.match(shell,/enhanceProgressContinuity\(\{root,viewModel,state\}\);\s*enhanceSessionReadiness/);
});
