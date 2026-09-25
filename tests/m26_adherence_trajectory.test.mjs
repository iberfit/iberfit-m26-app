import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAdherenceTrajectoryFromSummaries,
  deriveAdherenceAlerts,
  buildCoachFollowUpPlan,
} from '../src/m26/engagement/adherence-engine.js';
import {__longitudinalUiInternals} from '../src/m26/data-experience/longitudinal-ui.js';

const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const now=new Date('2026-09-25T12:00:00Z');

function summary(days,adherence,plannedSessions,completedSessions){
  return Object.freeze({
    clientId,
    days,
    adherence,
    plannedSessions,
    completedSessions,
    dataQuality:plannedSessions>=3?'media':'limitada',
  });
}

test('trayectoria 7/28/90 distingue caída, recuperación y continuidad sostenida sin prescribir',()=>{
  const slipping=deriveAdherenceTrajectoryFromSummaries({
    d7:summary(7,0,1,0),
    d28:summary(28,0.75,4,3),
    d90:summary(90,0.8,10,8),
  });
  assert.equal(slipping.status,'slipping');
  assert.equal(slipping.delta7Vs28,-0.75);
  assert.equal(slipping.evidence,'high');
  assert.equal(slipping.semantics.overlappingWindows,true);
  assert.equal(slipping.semantics.automaticPrescription,false);
  assert.match(slipping.coachAction,/antes de modificar carga o planificación/u);

  const recovering=deriveAdherenceTrajectoryFromSummaries({
    d7:summary(7,1,1,1),
    d28:summary(28,0.5,4,2),
    d90:summary(90,0.5,8,4),
  });
  assert.equal(recovering.status,'recovering');
  assert.match(recovering.clientMessage,/recuperaste continuidad/u);

  const sustained=deriveAdherenceTrajectoryFromSummaries({
    d7:summary(7,0.5,2,1),
    d28:summary(28,0.5,4,2),
    d90:summary(90,0.5,8,4),
  });
  assert.equal(sustained.status,'sustained-low');
  assert.match(sustained.clientMessage,/no compensar sesiones/u);
});

test('trayectoria evita interpretar ruido cuando faltan sesiones suficientes',()=>{
  const trajectory=deriveAdherenceTrajectoryFromSummaries({
    d7:summary(7,null,0,0),
    d28:summary(28,0.5,2,1),
    d90:summary(90,0.5,4,2),
  });
  assert.equal(trajectory.status,'insufficient');
  assert.equal(trajectory.evidence,'limited');
  assert.equal(trajectory.delta7Vs28,null);
  assert.match(trajectory.clientMessage,/faltan sesiones planificadas y confirmadas/u);
});

test('caída reciente genera alerta accionable de Coach sin sustituir su decisión',()=>{
  const state={
    collections:{
      appointments:[
        {id:'a-old-1',clientId,startAt:'2026-08-30T10:00:00Z',status:'completed'},
        {id:'a-old-2',clientId,startAt:'2026-09-06T10:00:00Z',status:'completed'},
        {id:'a-old-3',clientId,startAt:'2026-09-13T10:00:00Z',status:'completed'},
        {id:'a-recent',clientId,startAt:'2026-09-22T10:00:00Z',status:'confirmed'},
      ],
      sessionExecutions:[],
      checkins:[],
      trainingCycles:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };

  const alerts=deriveAdherenceAlerts(state,clientId,{now});
  const slipping=alerts.find((item)=>item.id==='adherence-slipping');
  assert.ok(slipping);
  assert.equal(slipping.severity,'warning');
  assert.match(slipping.detail,/7 días 0% · 28 días 75%/u);
  assert.match(slipping.detail,/ventanas se solapan/u);

  const plan=buildCoachFollowUpPlan(alerts);
  assert.equal(plan.signalId,'adherence-slipping');
  assert.equal(plan.actionTitle,'Recuperar continuidad');
  assert.equal(plan.requiresCoachDecision,true);
  assert.equal(plan.autoPrescription,false);
  assert.equal(plan.autoMessage,false);
});

test('UI presenta 7/28/90 como una trayectoria compacta distinta para Cliente y Coach',()=>{
  const aggregate={
    adherence:{
      d7:1,
      d28:0.5,
      d90:0.5,
      baseline28:0.4,
      change28VsPrevious28:0.1,
    },
    progress:{
      d7:summary(7,1,1,1),
      d28:summary(28,0.5,4,2),
      d90:summary(90,0.5,8,4),
    },
  };

  const client=__longitudinalUiInternals.adherencePanel(aggregate,'client');
  assert.match(client,/data-adherence-trajectory="recovering"/u);
  assert.match(client,/7 días/u);
  assert.match(client,/28 días/u);
  assert.match(client,/90 días/u);
  assert.match(client,/Recuperando continuidad/u);
  assert.match(client,/Mantener el siguiente entrenamiento previsto/u);
  assert.doesNotMatch(client,/m26-data-kpis/u);
  assert.doesNotMatch(client,/AI insight/iu);

  const coach=__longitudinalUiInternals.adherencePanel(aggregate,'coach');
  assert.match(coach,/Siguiente decisión:/u);
  assert.match(coach,/Baseline 28 días previos: 40 % · cambio \+10 pp/u);
  assert.match(coach,/ventanas solapadas/u);
  assert.match(coach,/no explican su causa ni modifican el plan automáticamente/u);
  assert.doesNotMatch(coach,/m26-data-kpis/u);
});
