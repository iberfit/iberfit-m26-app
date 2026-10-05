import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createExecution,
} from '../src/m26/workflows/session-execution.js';
import {
  createSessionController,
  dispatchSessionAction,
  manualSessionSyncOutcome,
} from '../src/m26/workflows/session-controller.js';
import {renderSessionSyncBanner} from '../src/m26/workflows/session-ui.js';
import {
  TRAINING_SERVICE_NOT_ACTIVE,
  sessionCommandFailureOutcome,
  sessionCommandFailureReason,
  sessionRejectedSyncOutcome,
} from '../src/m26/workflows/session-sync-recovery-ui.js';
import {reconcileExecutionSyncResult} from '../src/m26/workflows/session-recovery.js';

const session={
  id:'session-service-guard',
  clientId:'client-service-guard',
  title:'Sesión',
  blocks:[{
    id:'block-1',
    type:'exercise',
    exerciseId:'exercise-1',
    sets:1,
    reps:'10',
    restSeconds:60,
    targetRpe:7,
  }],
};

function rejectedResult(operationId='op-service-guard'){
  return {
    ok:false,
    kind:'rejected',
    command:{operationId},
    response:{reason:TRAINING_SERVICE_NOT_ACTIVE},
  };
}

test('service rejection reason is recovered from command, operation and execution shapes',()=>{
  assert.equal(sessionCommandFailureReason(rejectedResult()),TRAINING_SERVICE_NOT_ACTIVE);
  assert.equal(sessionCommandFailureReason({operation:{errorCode:TRAINING_SERVICE_NOT_ACTIVE}}),TRAINING_SERVICE_NOT_ACTIVE);
  assert.equal(sessionCommandFailureReason({lastSyncError:TRAINING_SERVICE_NOT_ACTIVE}),TRAINING_SERVICE_NOT_ACTIVE);
});

test('Coach and Client get role-specific truthful start rejection copy',()=>{
  const error={result:rejectedResult()};
  const coach=sessionCommandFailureOutcome(error,{role:'coach',action:'start'});
  const client=sessionCommandFailureOutcome(error,{role:'client',action:'start'});

  assert.equal(coach.status,'error');
  assert.equal(client.status,'error');
  assert.match(coach.message,/servicio de entrenamiento no está activo/u);
  assert.match(coach.message,/sesión no se inició/u);
  assert.match(client.message,/ya no está disponible para iniciar/u);
  assert.match(client.message,/No se ha perdido ningún dato/u);
  assert.doesNotMatch(client.message,/servicio del cliente/u);
});

test('online start rejection never starts or dirties the local recovery execution',async()=>{
  const execution=createExecution({
    session,
    clientId:session.clientId,
    executionId:'execution-service-online',
  });
  const commandBus={
    async execute(command){
      return rejectedResult(command.operationId||'op-service-online');
    },
  };

  const dispatched=dispatchSessionAction({
    action:'start',
    execution,
    session,
    commandBus,
    appointmentId:'appointment-service-online',
    sessionRevision:0,
    online:true,
    actor:{role:'coach',userId:'coach-1'},
  });

  await assert.rejects(dispatched.value,/M26_COMMAND_REJECTED/u);
  assert.equal(execution.status,'ready');
  assert.equal(execution.startedAt,null);
  assert.equal(execution.syncStatus,'clean');
  assert.equal(execution.lastSyncError,null);
});

test('controller start surfaces Coach service rejection without creating local recovery dirt',async()=>{
  const execution=createExecution({
    session,
    clientId:session.clientId,
    executionId:'execution-service-controller',
  });
  const actionState={status:'idle',message:'',attempt:0};
  const errors=[];
  let telemetryStarts=0;
  let persists=0;
  let renders=0;
  const commandBus={
    async execute(command){
      return rejectedResult(command.operationId||'op-controller-start');
    },
  };
  const root={
    ownerDocument:{activeElement:null},
    addEventListener(){},
    removeEventListener(){},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    dispatchEvent(){},
  };
  const context={
    execution,
    session,
    actor:{role:'coach',userId:'coach-1'},
    commandBus,
    appointmentId:'appointment-service-controller',
    sessionRevision:0,
    actionState,
    recoveryCoordinator:{
      async persist(){persists+=1;},
      async settle(){},
    },
  };
  const controller=createSessionController({
    root,
    getContext:()=>context,
    render:()=>{renders+=1;},
    onError:(error)=>errors.push(error),
    liveTelemetryController:{
      async start(){telemetryStarts+=1;},
      async pause(){},
      async resume(){},
      async stop(){},
    },
    lifecycleTarget:{addEventListener(){},removeEventListener(){}},
    visibilityTarget:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
    clockTarget:{setInterval(){return 1;},clearInterval(){}},
  });

  controller.mount();
  const started=await controller.start();

  assert.equal(started,false);
  assert.equal(execution.status,'ready');
  assert.equal(execution.syncStatus,'clean');
  assert.equal(execution.lastSyncError,null);
  assert.equal(telemetryStarts,0);
  assert.equal(persists,0);
  assert.ok(renders>=1);
  assert.equal(errors.length,1);
  assert.equal(actionState.status,'error');
  assert.match(actionState.message,/servicio de entrenamiento no está activo/u);
  assert.match(actionState.message,/sesión no se inició/u);
  controller.destroy();
});

test('offline rejection reconciliation keeps local progress and exposes service-aware recovery',()=>{
  const execution=createExecution({
    session,
    clientId:session.clientId,
    executionId:'execution-service-offline',
  });
  execution.status='active';
  execution.startedAt='2026-10-05T10:00:00.000Z';
  execution.syncStatus='pending';
  execution.pendingOperationIds=['op-offline-start'];
  execution.results['exercise-1:1']={
    exerciseId:'exercise-1',
    setNumber:1,
    reps:10,
    seconds:null,
    load:'40 kg',
    rpe:8,
    rir:2,
    notes:'',
    completedAt:'2026-10-05T10:02:00.000Z',
  };

  const reconciliation=reconcileExecutionSyncResult(execution,{
    results:[rejectedResult('op-offline-start')],
  });

  assert.equal(reconciliation.rejected,1);
  assert.equal(execution.status,'active');
  assert.equal(execution.syncStatus,'rejected');
  assert.equal(execution.lastSyncError,TRAINING_SERVICE_NOT_ACTIVE);
  assert.equal(execution.results['exercise-1:1'].reps,10);

  const coach=sessionRejectedSyncOutcome(execution,{role:'coach'});
  const client=sessionRejectedSyncOutcome(execution,{role:'client'});
  assert.match(coach.message,/progreso local se conserva/u);
  assert.match(coach.message,/revisa el servicio del cliente/u);
  assert.match(client.message,/progreso de este dispositivo se conserva/u);
});

test('manual sync and rendered banner share the same service-aware recovery semantics',()=>{
  const execution={
    syncStatus:'rejected',
    lastSyncError:TRAINING_SERVICE_NOT_ACTIVE,
  };

  const coachOutcome=manualSessionSyncOutcome(execution,{online:true},null,{role:'coach'});
  const clientOutcome=manualSessionSyncOutcome(execution,{online:true},null,{role:'client'});
  const coachBanner=renderSessionSyncBanner(execution,{role:'coach'});
  const clientBanner=renderSessionSyncBanner(execution,{role:'client'});

  assert.equal(coachOutcome.status,'error');
  assert.equal(clientOutcome.status,'error');
  assert.match(coachBanner,/servicio de entrenamiento no está activo/u);
  assert.match(clientBanner,/Esta sesión ya no puede sincronizarse/u);
  assert.doesNotMatch(clientBanner,/servicio del cliente/u);
});

test('unrelated rejection semantics remain generic and are not mislabeled as service state',()=>{
  const execution={syncStatus:'rejected',lastSyncError:'REVISION_POLICY_REJECTED'};
  assert.equal(sessionRejectedSyncOutcome(execution,{role:'coach'}),null);
  assert.match(
    manualSessionSyncOutcome(execution,{online:true},null,{role:'coach'}).message,
    /último cambio no pudo confirmarse/u,
  );
});
