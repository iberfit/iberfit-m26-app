import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildSessionReadinessSnapshot} from '../src/m26/ui/session-readiness.js';

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
        {id:'e1',clientId,appointmentId:'a1',completedAt:'2026-09-03T11:00:00Z',status:'completed',syncStatus:'clean',feedback:{pain:false},results:[{exerciseId:'x',reps:10,loadKg:10,rpe:7}]},
        {id:'e2',clientId,appointmentId:'a3',completedAt:'2026-08-20T11:00:00Z',status:'completed',syncStatus:'clean',feedback:{pain:false},results:[{exerciseId:'x',reps:10,loadKg:11,rpe:6}]},
        {id:'e-pending',clientId,appointmentId:'a2',completedAt:'2026-09-02T11:00:00Z',status:'completed',syncStatus:'pending',feedback:{pain:true},results:[{exerciseId:'x',reps:10,loadKg:20,rpe:9}]},
      ],
      checkins:[
        {id:'c1',clientId,createdAt:'2026-09-04T08:00:00Z',energy:7,sleep:8,stress:3,pain:2},
      ],
      iriAssessments:[],
      wearableDailySummaries:[],
      trainingCycles:[],
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
  assert.match(ui,/data-session-live-state=\\"ready\\"/);
  assert.doesNotMatch(ui,/MutationObserver/);
  assert.doesNotMatch(ui,/service[_-]?role/i);
  assert.doesNotMatch(ui,/innerHTML/);
  assert.match(shell,/enhanceSessionReadiness/);
  assert.match(shell,/enhanceProgressContinuity\(\{root,viewModel,state\}\);\s*enhanceSessionReadiness/);
});
