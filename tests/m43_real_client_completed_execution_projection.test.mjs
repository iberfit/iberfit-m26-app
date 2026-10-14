import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCanonicalTrainingCollections} from '../src/m26/domain/canonical-training-collections.js';
import {projectCollectionsForRole,assertClientProjectionSafe} from '../src/m26/security/role-projection.js';
import {renderCompletedSessionHistory} from '../src/m26/rc39/completed-session-history.js';
import {stateFromBootstrap} from '../src/m26/production-state.js';
import {createProductionState} from '../src/m26/production-state.js';

const CLIENT='11111111-1111-4111-8111-111111111111';
const FOREIGN='22222222-2222-4222-8222-222222222222';
const USER='33333333-3333-4333-8333-333333333333';
const SESSION='44444444-4444-4444-8444-444444444444';
const EXECUTION='55555555-5555-4555-8555-555555555555';
const FOREIGN_EXEC='66666666-6666-4666-8666-666666666666';
const baseSession={id:SESSION,clientId:CLIENT,status:'completada',revision:4,
  title:'IBERFIT QA M43 · multideporte',deliveryModality:'guiada_en_app',
  deliveryOwnership:'client_autonomous',clientVisibilityLevel:'full',
  visibleToClient:true,blocks:[{id:'block-a',name:'Carrera continua',sets:1}]};
const execution={id:EXECUTION,clientId:CLIENT,sessionId:SESSION,status:'completada',
  revision:2,completedAt:'2026-10-14T10:00:00Z',
  feedback:{sessionRpe:7,coachPrivateNote:'DO_NOT_EXPOSE'},
  results:{set1:{reps:8,rpe:7},set2:{distanceKm:5,paceMinPerKm:'06:15'}},
  privateNotes:'DO_NOT_EXPOSE'};
function envelope(entityType,entityId,clientId,body,revision=1){
  return {entityType,entityId,clientId,status:body.status,
    revision,body:{...body,id:entityId,clientId,revision}};
}
const client={role:'client',clientId:CLIENT,id:USER};

test('M43 rehydrates domain ACK executions to canonical sessionExecutions without legacy mirrors',()=>{
  const raw={sessions:[],trainingCycles:[],sessionExecutions:[],m26Entities:[
    envelope('session',SESSION,CLIENT,baseSession,4),
    envelope('session_execution',EXECUTION,CLIENT,execution,2),
  ]};
  const merged=reconcileCanonicalTrainingCollections(raw);
  assert.equal(merged.sessions.length,1);
  assert.equal(merged.sessionExecutions.length,1);
  assert.equal(merged.sessionExecutions[0].id,EXECUTION);
  assert.equal(merged.sessionExecutions[0].status,'completada');
  const safe=projectCollectionsForRole(merged,client,['sessions','sessionExecutions']);
  assertClientProjectionSafe(safe,client);
  assert.equal(safe.sessionExecutions.length,1);
  assert.equal(safe.sessionExecutions[0].clientId,CLIENT);
  assert.equal(safe.sessionExecutions[0].results.length,2);
  assert.equal(safe.sessionExecutions[0].feedback.sessionRpe,7);
  assert.ok(!JSON.stringify(safe).includes('DO_NOT_EXPOSE'));
  const history=renderCompletedSessionHistory({
    executions:safe.sessionExecutions.map(entry=>({statusRaw:entry.status,body:entry})),
    rc39:{sessionProjections:[{id:SESSION,title:baseSession.title}]},
  });
  assert.match(history,/IBERFIT QA M43 · multideporte/);
  assert.match(history,/2 registros/);
  assert.match(history,/Esfuerzo percibido 7\/10/);
});

test('M43 ignores wrong-owner execution body and cannot expose another client history',()=>{
  const raw={sessionExecutions:[],m26Entities:[
    envelope('session_execution',EXECUTION,CLIENT,execution,2),
    envelope('session_execution',FOREIGN_EXEC,FOREIGN,
      {...execution,id:FOREIGN_EXEC,clientId:FOREIGN},1),
    {...envelope('session_execution','77777777-7777-4777-8777-777777777777',CLIENT,
      execution,2),body:{...execution,id:EXECUTION,clientId:FOREIGN}},
  ]};
  const reconciled=reconcileCanonicalTrainingCollections(raw);
  assert.equal(reconciled.sessionExecutions.length,2);
  const projected=projectCollectionsForRole(reconciled,client,['sessionExecutions']);
  assertClientProjectionSafe(projected,client);
  assert.equal(projected.sessionExecutions.length,1);
  assert.equal(projected.sessionExecutions[0].id,EXECUTION);
});

test('M43 duplicate execution IDs resolve to latest revision without losing legacy data',()=>{
  const merged=reconcileCanonicalTrainingCollections({
    sessionExecutions:[{id:EXECUTION,clientId:CLIENT,revision:1,status:'en_curso'}],
    m26Entities:[envelope('session_execution',EXECUTION,CLIENT,execution,2)],
  });
  assert.equal(merged.sessionExecutions.length,1);
  assert.equal(merged.sessionExecutions[0].status,'completada');
  assert.equal(merged.sessionExecutions[0].revision,2);
});

test('M43 actual bootstrap state restores completed Client executions through role projection',()=>{
  const snapshot={
    user:{id:USER,role:'client',clientId:CLIENT},
    canary:{active:true},
    data:{
      clients:[{id:CLIENT,name:'Synthetic QA Client',trainingServiceStatus:'active'}],
      m26Entities:[envelope('session',SESSION,CLIENT,baseSession,4),
        envelope('session_execution',EXECUTION,CLIENT,execution,2)],
      sessionExecutions:[],
    },
  };
  const state=stateFromBootstrap(snapshot,createProductionState());
  assert.equal(state.collections.sessionExecutions.length,1);
  assert.equal(state.collections.sessionExecutions[0].status,'completada');
  assert.equal(state.collections.sessionExecutions[0].results.length,2);
  assert.ok(!JSON.stringify(state.collections.sessionExecutions).includes('DO_NOT_EXPOSE'));
});
