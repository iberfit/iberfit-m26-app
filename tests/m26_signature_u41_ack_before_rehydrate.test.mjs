import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandBus,createMemoryOperationRepository} from '../src/m26/command-bus.js';
import {createExecution,startExecution,buildProgressExecutionCommand} from '../src/m26/workflows/session-execution.js';
import {dispatchSessionAction} from '../src/m26/workflows/session-controller.js';

function deferred(){
 let resolve,reject;
 const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
 return {promise,resolve,reject};
}
const actor={role:'client',id:'qa-synthetic-client',clientId:'client-ack-race'};
const session={id:'session-ack-race',clientId:actor.clientId,blocks:[{
 id:'block-ack',type:'exercise',exerciseId:'exercise-ack',sets:2,reps:'8',restSeconds:45,
 targetRpe:7,targetRir:2,
}]};
function executionFixture(){
 const execution=createExecution({session,clientId:actor.clientId,executionId:'execution-ack-race'});
 startExecution(execution,{actor});
 execution.revision=3;
 return execution;
}
function progressAction(execution,bus){
 return dispatchSessionAction({session,execution,actor,
   action:'complete-set',payload:{reps:'8',load:'20 kg',rpe:8,rir:2,restSeconds:45},
   commandBus:bus,online:true});
}
function busWithResponse(reply,{rehydrate=async()=>{}}={}){
 const calls=[],repository=createMemoryOperationRepository();
 const bus=createCommandBus({
   repository,
   getToken:async()=> 'test-only-token',
   getRole:()=> 'client',
   rehydrate,
   transport:{preflight:async()=>({kind:'ack'}),
     execute:async(_token,command)=>{calls.push(command);return reply(command);}},
 });
 return {bus,calls,repository};
}
test('U41 server ACK 4 updates active execution from 3 before full bootstrap refresh completes',async()=>{
 const refreshEntered=deferred(),releaseRefresh=deferred();
 const f=busWithResponse(()=>({kind:'ack',remoteRevision:4}),{
   rehydrate:async()=>{refreshEntered.resolve();await releaseRefresh.promise;},
 });
 const execution=executionFixture();
 const result=progressAction(execution,f.bus);
 assert.equal(result.kind,'command');
 await refreshEntered.promise;
 assert.equal(execution.revision,4,'remote confirmation must be reflected before heavy rehydrate');
 assert.equal(buildProgressExecutionCommand(execution).baseRevision,4,
   'second set must never reuse stale revision 3');
 assert.equal(f.calls[0].baseRevision,3);
 releaseRefresh.resolve();
 const ack=await result.value;
 assert.equal(ack.ok,true);
 assert.equal(ack.response.remoteRevision,4);
 assert.equal(execution.revision,4);
});
test('U41 conflict HTTP 200 does not advance revision or retry the mutation',async()=>{
 const f=busWithResponse(()=>({kind:'conflict',reason:'REVISION_MISMATCH',remoteRevision:4}));
 const execution=executionFixture();
 const action=progressAction(execution,f.bus);
 await assert.rejects(action.value,/M26_COMMAND_CONFLICT/);
 assert.equal(execution.revision,3);
 assert.equal(f.calls.length,1);
 assert.equal((await f.repository.list())[0]?.status,'conflict');
});
test('U41 cannot advance a different Client/execution or malformed acknowledgement',async()=>{
 for(const bad of [null,'invalid',-1,3]){
  const f=busWithResponse(()=>({kind:'ack',remoteRevision:bad}));
  const execution=executionFixture();
  const action=progressAction(execution,f.bus);
  const r=await action.value;
  assert.equal(r.ok,true);
  assert.equal(execution.revision,3,'no invented or nonmonotonic revision');
 }
});
test('U41 ACK hook cannot convert confirmed server success into a queued retry',async()=>{
 let calls=0;
 const f=busWithResponse(()=>{calls++;return {kind:'ack',remoteRevision:4};});
 const execution=executionFixture();
 const command=buildProgressExecutionCommand(execution,3);
 command.operationId='synthetic-early-ack';
 const r=await f.bus.execute(command,{onAck:()=>{throw new Error('LOCAL_HOOK_FAILED');}});
 assert.equal(r.kind,'ack');
 assert.equal(r.ok,true);
 assert.equal(calls,1);
 assert.equal((await f.repository.list()).length,0);
});
