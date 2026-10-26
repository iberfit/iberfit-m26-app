import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCommandBus,createMemoryOperationRepository} from '../src/m26/command-bus.js';
import {createExecution,startExecution,buildProgressExecutionCommand} from '../src/m26/workflows/session-execution.js';
import {dispatchSessionAction,settlePriorExecutionWrites,sameLiveExecutionOwner,sessionExitAfterFinishConfirmed} from '../src/m26/workflows/session-controller.js';

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
function busWithResponse(reply,{rehydrate=async()=>{},onPostAckRefreshError=()=>{}}={}){
 const calls=[],repository=createMemoryOperationRepository();
 const bus=createCommandBus({
   repository,
   getToken:async()=> 'test-only-token',
   getRole:()=> 'client',
   rehydrate,onPostAckRefreshError,
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

test('U41/U42 finalization uses the last exact server ACK even when UI hydration regresses local CAS',async()=>{
  const f=busWithResponse((command)=>({kind:'ack',remoteRevision:command.type==='EJECUCION_COMPLETAR'?7:6}));
  const execution=executionFixture();
  execution.revision=5;
  const active=progressAction(execution,f.bus);
  assert.equal((await active.value).ok,true);
  assert.equal(execution.revision,6);
  // Mimic an outdated recovered/rehydrated object for this same execution.
  const recovered=structuredClone(execution);
  recovered.revision=5;
  recovered.status='awaiting_feedback';
  const done=dispatchSessionAction({session,execution:recovered,actor,
    action:'finish',payload:{sessionRpe:7,comment:'QA checked feedback',pain:false},
    commandBus:f.bus,online:true});
  assert.equal((await done.value).ok,true);
  assert.equal(f.calls.at(-1).type,'EJECUCION_COMPLETAR');
  assert.equal(f.calls.at(-1).baseRevision,6,'never close with an obsolete CAS 5');
  assert.equal(recovered.revision,7);
  assert.equal(f.calls.filter(x=>x.type==='EJECUCION_COMPLETAR').length,1);
});
test('U41/U42 ACK CAS is never shared with another Client, execution, command bus or rejected write',async()=>{
  const f=busWithResponse((command)=>command.type==='EJECUCION_COMPLETAR'
    ?{kind:'ack',remoteRevision:7}:{kind:'ack',remoteRevision:6});
  const active=executionFixture();active.revision=5;
  assert.equal((await progressAction(active,f.bus).value).ok,true);
  for(const context of [
    {...active,id:'other-execution',revision:5},
    {...active,clientId:'other-client',revision:5},
  ]){
    context.status='awaiting_feedback';
    const attempt=dispatchSessionAction({session,execution:context,actor,action:'finish',
      payload:{sessionRpe:7,comment:'Scope test'},commandBus:f.bus,online:true});
    await attempt.value;
    assert.equal(f.calls.at(-1).baseRevision,5,'foreign scope must not borrow the original ACK');
  }
  const secondBus=busWithResponse(()=>({kind:'ack',remoteRevision:6}));
  const detached={...active,revision:5,status:'awaiting_feedback'};
  await dispatchSessionAction({session,execution:detached,actor,action:'finish',
    payload:{sessionRpe:7,comment:'Different bus'},commandBus:secondBus.bus,online:true}).value;
  assert.equal(secondBus.calls.at(-1).baseRevision,5);
  const rejected=busWithResponse(()=>({kind:'conflict',remoteRevision:99,reason:'REVISION_MISMATCH'}));
  const conflicted=executionFixture();conflicted.revision=5;
  await assert.rejects(progressAction(conflicted,rejected.bus).value,/M26_COMMAND_CONFLICT/);
  assert.equal(conflicted.revision,5,'remote conflict revision is never an authoritative local ACK');
});
test('U41/U42 pending progress write completes before a subsequent finalization may use its revision',async()=>{
  const wait=deferred(),entered=deferred();
  const f=busWithResponse(async(command)=>{
    if(command.type==='EJECUCION_GUARDAR_PROGRESO'){
      entered.resolve();await wait.promise;return {kind:'ack',remoteRevision:6};
    }
    return {kind:'ack',remoteRevision:7};
  });
  const execution=executionFixture();execution.revision=5;
  const active=progressAction(execution,f.bus);
  await entered.promise;
  const same=structuredClone(execution);same.revision=5;same.status='awaiting_feedback';
  const finishing=(async()=>{
    // This is the same pre-dispatch barrier used by the real finish button.
    await settlePriorExecutionWrites(f.bus,same);
    return dispatchSessionAction({session,execution:same,actor,action:'finish',
      payload:{sessionRpe:7,comment:'Two acknowledged sets'},commandBus:f.bus,online:true}).value;
  })();
  await Promise.resolve();
  assert.equal(f.calls.filter(x=>x.type==='EJECUCION_COMPLETAR').length,0);
  wait.resolve();
  assert.equal((await active.value).ok,true);
  assert.equal((await finishing).ok,true);
  assert.equal(f.calls.at(-1).baseRevision,6);
});

test('U42 delayed finalization is lease-bound and rejects identity/workspace replacement',()=>{
 const bus={};
 const execution={id:'qa-execution',clientId:'qa-client'};
 const original={commandBus:bus,execution,actor:{userId:'qa-user'}};
 assert.equal(sameLiveExecutionOwner(original,{...original,actor:{userId:'qa-user'}}),true);
 for(const modified of [
   {...original,actor:{userId:'different-user'}},
   {...original,execution:{...execution}},
   {...original,commandBus:{}},
   {...original,execution:null},
   null,
 ])assert.equal(sameLiveExecutionOwner(original,modified),false);
});

test('U43 actual two-set CAS 3→4→5 survives a lost UI observer and slow rehydration before finish',async()=>{
  const refreshing=deferred(),release=deferred();
  let refreshes=0;
  const f=busWithResponse((command)=>{
    const next=command.type==='EJECUCION_COMPLETAR'?6:Number(command.baseRevision)+1;
    return {kind:'ack',remoteRevision:next};
  },{rehydrate:async()=>{
    if(++refreshes===2){refreshing.resolve();await release.promise;}
  }});
  const execution=executionFixture();
  const first=buildProgressExecutionCommand(execution,3);
  first.operationId='u43-first-set';
  assert.equal((await f.bus.execute(first)).kind,'ack');
  assert.equal(f.bus.confirmedExecutionRevision(execution),4);
  // After a first ACK the session UI has revision 4, but on the second
  // command its observer is detached while heavy bootstrap is pending.
  execution.revision=4;
  const second=buildProgressExecutionCommand(execution,4);
  second.operationId='u43-second-set';
  const secondWrite=f.bus.execute(second,{onAck:()=>{throw Error('OBSOLETE_UI_OBSERVER');}});
  await refreshing.promise;
  assert.equal(execution.revision,4,'stale view has not received second ACK');
  assert.equal(f.bus.confirmedExecutionRevision(execution),5,
    'the authenticated bus retained the real ACK 5 before rehydration');
  const stale=structuredClone(execution);
  stale.status='awaiting_feedback';
  const finish=dispatchSessionAction({session,execution:stale,actor,
    action:'finish',payload:{sessionRpe:7,comment:'QA finalizado',pain:false},
    commandBus:f.bus,online:true});
  release.resolve();
  assert.equal((await secondWrite).kind,'ack');
  assert.equal((await finish.value).kind,'ack');
  assert.equal(f.calls.at(-1).type,'EJECUCION_COMPLETAR');
  assert.equal(f.calls.at(-1).baseRevision,5,
    'finish must never reuse second-set stale base 4 after ACK 5');
  assert.equal(f.calls.filter(x=>x.type==='EJECUCION_COMPLETAR').length,1);
});


test('U47 NEXT uses the exact same-execution ACK after a stale Client hydration, not obsolete CAS',async()=>{
  const calls=[];
  const f=busWithResponse((cmd)=>{
    calls.push({type:cmd.type,baseRevision:cmd.baseRevision});
    return {kind:'ack',remoteRevision:Number(cmd.baseRevision)+1};
  });
  const execution=executionFixture();
  assert.equal((await progressAction(execution,f.bus).value).kind,'ack');
  assert.equal(execution.revision,4);
  // A delayed hydration can reset the visible model to CAS 3 even though
  // the authenticated command bus has already confirmed the first set at 4.
  execution.revision=3;
  const next=dispatchSessionAction({session,execution,actor,action:'next',
    payload:{},commandBus:f.bus,online:true});
  assert.equal(next.kind,'command');
  assert.equal((await next.value).kind,'ack');
  assert.equal(calls.at(-1).baseRevision,4);
  assert.equal(execution.revision,5);

  assert.equal((await progressAction(execution,f.bus).value).kind,'ack');
  assert.equal(execution.revision,6);
  execution.revision=5;
  const finalNext=dispatchSessionAction({session,execution,actor,action:'next',
    payload:{},commandBus:f.bus,online:true});
  assert.equal(finalNext.kind,'command');
  assert.equal((await finalNext.value).kind,'ack');
  assert.equal(calls.at(-1).baseRevision,6,
    'last NEXT must not conflict after the second confirmed set');
  assert.equal(execution.revision,7);
  assert.equal(execution.status,'awaiting_feedback');
});

test('U43 authenticated ACK ledger rejects false revisions, conflicts and foreign scope',async()=>{
  const respond=(cmd)=>{
    if(cmd.operationId==='u43-confirmed')return {kind:'ack',remoteRevision:5};
    if(cmd.operationId==='u43-conflict')return {kind:'conflict',remoteRevision:999,reason:'REVISION_MISMATCH'};
    if(cmd.operationId==='u43-rejected')return {kind:'rejected',remoteRevision:999,reason:'FORBIDDEN'};
    if(cmd.operationId==='u43-invalid')return {kind:'ack',remoteRevision:4};
    return {kind:'ack',remoteRevision:6};
  };
  const f=busWithResponse(respond);
  const execution=executionFixture();execution.revision=4;
  const command=buildProgressExecutionCommand(execution,4);
  command.operationId='u43-confirmed';
  assert.equal((await f.bus.execute(command)).kind,'ack');
  assert.equal(f.bus.confirmedExecutionRevision(execution),5);
  assert.equal(f.bus.confirmedExecutionRevision({...execution,id:'different-execution'}),0);
  assert.equal(f.bus.confirmedExecutionRevision({...execution,clientId:'different-client'}),0);
  assert.equal(busWithResponse(respond).bus.confirmedExecutionRevision(execution),0);
  for(const [op,kind] of [['u43-conflict','conflict'],['u43-rejected','rejected'],['u43-invalid','ack']]){
    const next={...buildProgressExecutionCommand(execution,4),operationId:op};
    const response=await f.bus.execute(next);
    assert.equal(response.kind,kind);
    assert.equal(f.bus.confirmedExecutionRevision(execution),5,
      'remote conflict, rejection and nonmonotone ACK cannot change trusted CAS');
  }
});

test('U44 explicit exit while finish settles is allowed only after same-owner confirmed clean completion',()=>{
 const bus={};
 const execution={id:'synthetic-execution',clientId:'synthetic-client',status:'completed',syncStatus:'clean',pendingOperationIds:[]};
 const first={commandBus:bus,execution,actor:{userId:'synthetic-account'}};
 const latest={...first};
 assert.equal(sessionExitAfterFinishConfirmed(first,latest),true);
 for(const e of [
  {...execution,status:'awaiting_feedback'},
  {...execution,syncStatus:'pending'},
  {...execution,syncStatus:'conflict'},
  {...execution,pendingOperationIds:['unconfirmed-remote-write']},
 ]){
  assert.equal(sessionExitAfterFinishConfirmed(first,{...latest,execution:e}),false,
    'a replaced or unconfirmed execution cannot silently exit');
 }
 execution.syncStatus='pending';
 assert.equal(sessionExitAfterFinishConfirmed(first,latest),false,'same in-memory object must still have clean synchronization');
 execution.syncStatus='clean';
 assert.equal(sessionExitAfterFinishConfirmed(first,{...latest,actor:{userId:'another-account'}}),false);
 assert.equal(sessionExitAfterFinishConfirmed(first,{...latest,commandBus:{}}),false);
});

test('U44 session exit tap is deferred until finishing action settles instead of silently being discarded',()=>{
 const source=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
 assert.match(source,/queuedExitAfterFinish=\{context,target:sessionExitTarget\(button\)\}/u);
 assert.match(source,/if\(intent&&sessionExitAfterFinishConfirmed\(intent.context,getContext\(\)\)\)/u);
 assert.match(source,/next\?\.click\?\.\(\)/u);
});


test('U45 a durable real completion ACK is shown immediately, with optional bootstrap still observable',async()=>{
 const hydrateEntered=deferred(),releaseHydrate=deferred(),reported=deferred();
 const f=busWithResponse(command=>({kind:'ack',remoteRevision:Number(command.baseRevision)+1}),{
   rehydrate:async()=>{hydrateEntered.resolve();await releaseHydrate.promise;throw new Error('U45_SYNTHETIC_POST_ACK_BOOTSTRAP_FAILED');},
   onPostAckRefreshError:(error,scope)=>reported.resolve({message:error.message,scope}),
 });
 const execution=executionFixture();
 execution.revision=6;
 execution.status='awaiting_feedback';
 const result=dispatchSessionAction({session,execution,actor,action:'finish',
   payload:{sessionRpe:7,comment:'Cierre real QA U45',pain:false},
   commandBus:f.bus,online:true});
 const resolution=Promise.resolve(result.value).then(ack=>({winner:'ack',ack}));
 const first=await Promise.race([resolution,hydrateEntered.promise.then(()=>({winner:'bootstrap'}))]);
 assert.equal(first.winner,'ack','optional bootstrap may not hold the confirmed FINISH ACK');
 assert.equal(first.ack.kind,'ack');
 assert.equal(first.ack.response.remoteRevision,7);
 assert.equal(first.ack.refreshDeferred,true,'refresh is pending, not silently claimed successful');
 assert.equal(first.ack.refreshOk,null);
 assert.equal(execution.status,'completed');
 assert.equal(execution.syncStatus,'clean');
 assert.equal(execution.revision,7);
 assert.equal(f.calls.filter(x=>x.type==='EJECUCION_COMPLETAR').length,1);
 assert.equal(f.calls.at(-1).baseRevision,6);
 await hydrateEntered.promise;
 releaseHydrate.resolve();
 const diagnostic=await reported.promise;
 assert.equal(diagnostic.message,'U45_SYNTHETIC_POST_ACK_BOOTSTRAP_FAILED');
 assert.equal(diagnostic.scope.commandType,'EJECUCION_COMPLETAR');
 assert.equal(diagnostic.scope.operationId,f.calls.at(-1).operationId);
 assert.equal(execution.syncStatus,'clean','an optional read failure must not erase confirmed server ACK');
});


test('U54 exact terminal ACK releases Client UI before the durable local receipt unblocks',async()=>{
  const release=deferred(),ackStorageEntered=deferred();
  const repository=createMemoryOperationRepository();
  const put=repository.put.bind(repository);
  repository.put=async(record)=>{
    if(record.type==='EJECUCION_COMPLETAR'&&record.status==='ack'){
      ackStorageEntered.resolve();
      await release.promise;
    }
    return put(record);
  };
  const calls=[];
  const bus=createCommandBus({
    repository,getToken:async()=> 'test-only-token',getRole:()=> 'client',
    transport:{preflight:async()=>({kind:'ack'}),
      execute:async(_token,command)=>{
        calls.push(command);
        return {kind:'ack',operationId:command.operationId,
          remoteRevision:Number(command.baseRevision)+1};
      }},
  });
  const execution=executionFixture();execution.revision=5;
  execution.status='awaiting_feedback';
  execution.syncStatus='pending';
  execution.pendingOperationIds=['old-set-ack-in-ui'];
  const action=dispatchSessionAction({session,execution,actor,action:'finish',
    payload:{sessionRpe:7,comment:'U54 authenticated remote ACK',pain:false},
    commandBus:bus,online:true});
  try{
    await ackStorageEntered.promise;
    const observed=await Promise.race([
      action.value,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('U54_ACK_UI_HELD_BEHIND_LOCAL_RECEIPT')),250)),
    ]);
    assert.equal(observed.ok,true);
    assert.equal(observed.response.operationId,execution.id);
    assert.equal(execution.status,'completed');
    assert.equal(execution.revision,6);
    assert.equal(execution.syncStatus,'clean');
    assert.deepEqual(execution.pendingOperationIds,[]);
    assert.equal(calls.length,1,'must not resend a committed finish');
  }finally{release.resolve();}
});

test('U54 refuses early completion confirmation for wrong operation ID, conflict or nonmonotonic ACK',async()=>{
  for(const kind of ['wrong-id','conflict','nonmonotonic']){
    const execute=async(_token,command)=>kind==='wrong-id'
      ?{kind:'ack',operationId:'another-operation',remoteRevision:6}
      :kind==='conflict'
        ?{kind:'conflict',operationId:command.operationId,reason:'REVISION_MISMATCH',remoteRevision:6}
        :{kind:'ack',operationId:command.operationId,remoteRevision:5};
    const repository=createMemoryOperationRepository();
    const bus=createCommandBus({repository,getToken:async()=> 'test-only-token',
      getRole:()=> 'client',transport:{preflight:async()=>({kind:'ack'}),execute}});
    const execution=executionFixture();execution.revision=5;
    execution.status='awaiting_feedback';
    const action=dispatchSessionAction({session,execution,actor,action:'finish',
      payload:{sessionRpe:7,comment:'U54 negative',pain:false},commandBus:bus,online:true});
    if(kind==='conflict'){
      await assert.rejects(action.value,/M26_COMMAND_CONFLICT/);
      assert.equal(execution.status,'awaiting_feedback');
      assert.notEqual(execution.syncStatus,'clean');
    }else{
      const reply=await action.value;
      assert.equal(reply.ok,true);
      assert.equal(execution.status,'completed','full command path still applies confirmed result');
    }
  }
});
