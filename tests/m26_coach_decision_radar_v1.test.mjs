import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeProgressSummary,
  deriveAdherenceAlerts,
} from '../src/m26/engagement/index.js';
import {
  deriveCoachCockpit,
} from '../src/m26/experience/coach-cockpit.js';

const NOW=new Date('2026-09-28T12:00:00.000Z');

function coachState(){
  return {
    identity:{role:'coach'},
    collections:{
      appointments:[
        {id:'a1',clientId:'c1',status:'completed',scheduledAt:'2026-09-04T10:00:00Z'},
        {id:'a2',clientId:'c1',status:'completed',scheduledAt:'2026-09-11T10:00:00Z'},
        {id:'a3',clientId:'c1',status:'completed',scheduledAt:'2026-09-18T10:00:00Z'},
        {id:'a4',clientId:'c1',status:'completed',scheduledAt:'2026-09-25T10:00:00Z'},
      ],
      sessions:[{
        id:'s1',
        clientId:'c1',
        blocks:[
          {exerciseId:'exercise-1',exerciseName:'Ejercicio 1'},
          {exerciseId:'exercise-2',exerciseName:'Ejercicio 2'},
          {exerciseId:'exercise-3',exerciseName:'Ejercicio 3'},
          {exerciseId:'exercise-4',exerciseName:'Ejercicio 4'},
        ],
      }],
      sessionExecutions:[
        {id:'e1',clientId:'c1',sessionId:'s1',appointmentId:'a1',status:'completed',syncStatus:'clean',completedAt:'2026-09-04T11:00:00Z',results:{x:{exerciseId:'exercise-1',reps:8,loadKg:100,rpe:7}}},
        {id:'e2',clientId:'c1',sessionId:'s1',appointmentId:'a2',status:'completed',syncStatus:'clean',completedAt:'2026-09-11T11:00:00Z',results:{x:{exerciseId:'exercise-2',reps:8,loadKg:100,rpe:7}}},
        {id:'e3',clientId:'c1',sessionId:'s1',appointmentId:'a3',status:'completed',syncStatus:'clean',completedAt:'2026-09-18T11:00:00Z',results:{x:{exerciseId:'exercise-3',reps:8,loadKg:50,rpe:7}}},
        {id:'e4',clientId:'c1',sessionId:'s1',appointmentId:'a4',status:'completed',syncStatus:'clean',completedAt:'2026-09-25T11:00:00Z',results:{x:{exerciseId:'exercise-4',reps:8,loadKg:50,rpe:7}}},
      ],
      iriAssessments:[],
      checkins:[],
      wearableDailySummaries:[],
      trainingCycles:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };
}

function cockpitClient(){
  return {
    id:'c1',
    name:'Isabella',
    modality:'Híbrida',
    experience:{
      stage:'active',
      stageLabel:'Seguimiento activo',
      priority:5,
    },
    nextAction:{
      key:'review',
      label:'Revisar seguimiento',
      area:'expediente',
      reason:'Revisar la evolución reciente.',
    },
  };
}

test('Coach Home convierte una caída de volumen comparable en señal explicable de revisión',()=>{
  const alerts=deriveAdherenceAlerts(coachState(),'c1',{now:NOW});
  const signal=alerts.find((item)=>item.id==='progress-volume-review');

  assert.ok(signal,'debe existir una señal de volumen para Coach Home');
  assert.equal(signal.severity,'warning');
  assert.equal(signal.decision.type,'plan-execution-review');
  assert.equal(signal.decision.period,'28d');
  assert.equal(signal.decision.requiresHumanDecision,true);
  assert.equal(signal.decision.automaticPrescription,false);
  assert.equal(signal.decision.recommendedActions[0].area,'progreso');
  assert.match(signal.detail,/Cambio reciente -50%/u);
  assert.doesNotMatch(signal.action,/modificar automáticamente/u);
});

test('Decision Radar no filtra señales internas al Cliente',()=>{
  const state=coachState();
  state.identity.role='client';
  const alerts=deriveAdherenceAlerts(state,'c1',{now:NOW});

  assert.equal(
    alerts.some((item)=>String(item?.id||'').startsWith('progress-')),
    false
  );
});

test('Decision Radar no duplica Progress Hub fuera de Coach Home cuando ya existe resumen',()=>{
  const state=coachState();
  const summary=computeProgressSummary(state,'c1',{now:NOW,days:28});
  const alerts=deriveAdherenceAlerts(state,'c1',{now:NOW,summary});

  assert.equal(
    alerts.some((item)=>item.id==='progress-volume-review'),
    false
  );
});

test('una señal crítica existente conserva prioridad y evita ruido longitudinal secundario',()=>{
  const state=coachState();
  state.collections.checkins.push({
    id:'check-pain',
    clientId:'c1',
    createdAt:'2026-09-27T08:00:00Z',
    pain:8,
    sleep:7,
    energy:7,
    stress:3,
  });
  const alerts=deriveAdherenceAlerts(state,'c1',{now:NOW});

  assert.equal(alerts[0].id,'pain-high');
  assert.equal(alerts[0].severity,'critical');
  assert.equal(
    alerts.some((item)=>item.id==='progress-volume-review'),
    false
  );
});

test('IRI permanece como línea de base y nunca fabrica una señal de progreso del Radar',()=>{
  const state={
    identity:{role:'coach'},
    collections:{
      appointments:[],
      sessions:[],
      sessionExecutions:[],
      iriAssessments:[{
        id:'iri-only',
        clientId:'c1',
        assessmentDate:'2026-09-27T10:00:00Z',
        stepFinalHr:150,
        stepOneMinuteHr:115,
        bodyComposition:{weightKg:70},
        strengthPatterns:{squat:1},
      }],
      checkins:[],
      wearableDailySummaries:[],
      trainingCycles:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };

  const alerts=deriveAdherenceAlerts(state,'c1',{now:NOW});
  assert.equal(
    alerts.some((item)=>String(item?.id||'').startsWith('progress-')),
    false
  );
  assert.equal(
    alerts.some((item)=>String(item?.source||'').includes('iri')),
    false
  );
});

test('Cockpit expone contrato de decisión sin score y enlaza solo a una ruta real existente',()=>{
  const alerts=deriveAdherenceAlerts(coachState(),'c1',{now:NOW});
  const cockpit=deriveCoachCockpit([{
    client:cockpitClient(),
    alerts,
  }]);
  const item=cockpit.items[0];

  assert.equal(item.clientId,'c1');
  assert.equal(item.decisionType,'plan-execution-review');
  assert.equal(item.operationalPriority.id,'review');
  assert.equal(item.operationalPriority.label,'Revisar');
  assert.equal(item.nextAction.area,'progreso');
  assert.equal(item.recommendedActions[0].area,'progreso');
  assert.ok(item.evidence.some((value)=>/Cambio reciente -50%/u.test(value)));
  assert.equal(item.requiresHumanDecision,true);
  assert.equal(item.automaticPrescription,false);
  assert.equal(Object.hasOwn(item,'score'),false);
  assert.equal(Object.hasOwn(item,'overallScore'),false);
});
