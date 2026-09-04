import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildAdherenceWindows} from '../src/m26/engagement/progress-continuity.js';
import {buildCoachFollowUpPlan,deriveAdherenceAlerts} from '../src/m26/engagement/adherence-engine.js';
import {buildClientHomeSnapshot} from '../src/m26/ui/progress-continuity.js';

const clientId='client-progress-continuity';
const now=new Date('2026-09-04T12:00:00Z');

function state(){
  return {
    collections:{
      appointments:[
        {id:'a1',clientId,startAt:'2026-09-03T10:00:00Z',status:'completed'},
        {id:'a2',clientId,startAt:'2026-09-02T10:00:00Z',status:'confirmed'},
        {id:'a3',clientId,startAt:'2026-08-20T10:00:00Z',status:'completed'},
        {id:'a4',clientId,startAt:'2026-08-15T10:00:00Z',status:'confirmed'},
        {id:'a5',clientId,startAt:'2026-07-10T10:00:00Z',status:'completed'},
        {id:'a6',clientId,startAt:'2026-06-20T10:00:00Z',status:'completed'},
        {id:'a-next',clientId,startAt:'2026-09-05T14:00:00Z',status:'confirmed',title:'Entrenamiento de fuerza',modality:'presencial',location:'Las Condes'},
      ],
      sessionExecutions:[
        {id:'e1',clientId,appointmentId:'a1',completedAt:'2026-09-03T11:00:00Z',status:'completed',syncStatus:'clean',feedback:{sessionRpe:7,pain:true,painNotes:'Molestia informada'},results:[{exerciseId:'x',reps:10,loadKg:10,rpe:7}]},
        {id:'e2',clientId,appointmentId:'a3',completedAt:'2026-08-20T11:00:00Z',status:'completed',syncStatus:'clean',feedback:{sessionRpe:6,pain:false},results:[{exerciseId:'x',reps:10,loadKg:11,rpe:6}]},
        {id:'e3',clientId,appointmentId:'a5',completedAt:'2026-07-10T11:00:00Z',status:'completed',syncStatus:'clean',feedback:{sessionRpe:7,pain:false},results:[{exerciseId:'x',reps:10,loadKg:12,rpe:7}]},
        {id:'e4',clientId,appointmentId:'a6',completedAt:'2026-06-20T11:00:00Z',status:'completed',syncStatus:'clean',feedback:{sessionRpe:7,pain:false},results:[{exerciseId:'x',reps:10,loadKg:13,rpe:7}]},
        {id:'e-pending',clientId,appointmentId:'a2',completedAt:'2026-09-02T11:00:00Z',status:'completed',syncStatus:'pending',feedback:{sessionRpe:8,pain:false},results:[{exerciseId:'x',reps:10,loadKg:20,rpe:8}]},
      ],
      iriAssessments:[],
      checkins:[
        {id:'c1',clientId,createdAt:'2026-09-04T08:00:00Z',energy:7,sleep:8,stress:3,pain:2},
      ],
      wearableDailySummaries:[],
      trainingCycles:[],
    },
    pendingOperations:[{operationId:'op-pending',type:'EJECUCION_COMPLETAR',entityType:'session_execution',entityId:'e-pending',clientId,status:'pending'}],
    conflicts:[],
    rejectedOperations:[],
  };
}

test('constancia reutiliza el progreso confirmado en ventanas 7 28 y 90 sin convertir ausencias en cero',()=>{
  const windows=buildAdherenceWindows(state(),clientId,{now});
  assert.deepEqual(windows.map((item)=>item.days),[7,28,90]);
  assert.deepEqual(windows.map((item)=>item.plannedSessions),[2,4,6]);
  assert.deepEqual(windows.map((item)=>item.completedSessions),[1,2,4]);
  assert.deepEqual(windows.map((item)=>item.adherence),[0.5,0.5,0.667]);
  assert.equal(windows[0].unconfirmedExecutions,1);

  const empty=buildAdherenceWindows({collections:{appointments:[],sessionExecutions:[],iriAssessments:[],checkins:[],wearableDailySummaries:[]}},clientId,{now});
  assert.ok(empty.every((item)=>item.adherence===null));
  assert.ok(empty.every((item)=>item.hasPlan===false));
});

test('inicio cliente resume próxima cita, constancia y bienestar sin inventar datos',()=>{
  const snapshot=buildClientHomeSnapshot(state(),clientId,{now});
  assert.equal(snapshot.nextAppointment.id,'a-next');
  assert.equal(snapshot.nextAppointment.title,'Entrenamiento de fuerza');
  assert.equal(snapshot.nextAppointment.modalityLabel,'Presencial');
  assert.equal(snapshot.constancy.days,28);
  assert.equal(snapshot.constancy.adherence,0.5);
  assert.equal(snapshot.constancy.unconfirmedExecutions,1);
  assert.deepEqual(snapshot.wellbeing,{energy:7,sleep:8,stress:3,pain:2,fatigue:null,motivation:null});
  assert.equal(snapshot.attention.level,'warning');
  assert.match(snapshot.attention.title,/Molestia informada/i);
  assert.match(snapshot.attention.copy,/no cambia tu plan automáticamente/i);

  const emptyState={collections:{appointments:[],sessionExecutions:[],iriAssessments:[],checkins:[],wearableDailySummaries:[],trainingCycles:[]},pendingOperations:[],conflicts:[],rejectedOperations:[]};
  const empty=buildClientHomeSnapshot(emptyState,clientId,{now});
  assert.equal(empty.nextAppointment,null);
  assert.equal(empty.constancy.adherence,null);
  assert.equal(empty.constancy.hasPlan,false);
  assert.equal(empty.wellbeing,null);
  assert.notEqual(empty.attention.title,'Dolor elevado informado');
});

test('feedback con molestia solo genera seguimiento cuando la sesión está confirmada',()=>{
  const confirmed=deriveAdherenceAlerts(state(),clientId,{now});
  const signal=confirmed.find((item)=>item.id==='post-session-discomfort');
  assert.ok(signal);
  assert.equal(signal.severity,'warning');
  assert.equal(signal.source,'feedback_sesion');
  assert.match(signal.detail,/no un diagnóstico/i);

  const pendingOnly=structuredClone(state());
  pendingOnly.collections.sessionExecutions.find((item)=>item.id==='e1').feedback.pain=false;
  pendingOnly.collections.sessionExecutions.find((item)=>item.id==='e-pending').feedback.pain=true;
  const alerts=deriveAdherenceAlerts(pendingOnly,clientId,{now});
  assert.ok(!alerts.some((item)=>item.id==='post-session-discomfort'));
});

test('la señal post-sesión exige decisión del Entrenador y nunca prescribe automáticamente',()=>{
  const signal=deriveAdherenceAlerts(state(),clientId,{now}).find((item)=>item.id==='post-session-discomfort');
  const plan=buildCoachFollowUpPlan([signal]);
  assert.equal(plan.signalId,'post-session-discomfort');
  assert.equal(plan.primaryArea,'progreso');
  assert.equal(plan.primaryLabel,'Abrir Cliente 360');
  assert.equal(plan.requiresCoachDecision,true);
  assert.equal(plan.autoPrescription,false);
  assert.equal(plan.autoMessage,false);
});

test('la capa premium de continuidad es idempotente, española y no introduce observers ni privilegios',async()=>{
  const [ui,shell]=await Promise.all([
    readFile(new URL('../src/m26/ui/progress-continuity.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8'),
  ]);
  assert.match(ui,/Constancia de entrenamiento en 7, 28 y 90 días/);
  assert.match(ui,/Cierre post-sesión/);
  assert.match(ui,/Ver Cliente 360/);
  assert.match(ui,/Tu día IBERFIT/);
  assert.match(ui,/Próximo entrenamiento/);
  assert.match(ui,/Constancia · 28 días/);
  assert.match(ui,/Cómo estás/);
  assert.match(ui,/Solo datos confirmados/);
  assert.match(ui,/data-m27-client-home/);
  assert.match(ui,/no cambia el plan automáticamente/i);
  assert.match(ui,/data-m27-constancia/);
  assert.match(ui,/data-m27-session-continuity/);
  assert.doesNotMatch(ui,/MutationObserver/);
  assert.doesNotMatch(ui,/service[_-]?role/i);
  assert.doesNotMatch(ui,/innerHTML/);
  assert.match(shell,/enhanceProgressContinuity/);
  assert.match(shell,/enhanceCliente360\(\{root,viewModel,state\}\);\s*enhanceProgressContinuity/);
});
