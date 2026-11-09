import test from 'node:test';
import assert from 'node:assert/strict';
import {createExecution} from '../src/m26/workflows/session-execution.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';
import {setPendingSessionEntry} from '../src/m26/intelligence/session-entry-intent.js';
import {createActionState} from '../src/m26/ui/action-state.js';

const clientId='10000000-0000-4000-8000-000000000271';
const sessionId='10000000-0000-4000-8000-000000000272';
const session={
  id:sessionId,clientId,title:'Entrenamiento guiado',revision:2,status:'disponible',
  visibleToClient:true,deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  clientVisibilityLevel:'full',durationMinutes:45,
  blocks:[{id:'block-a',type:'exercise',exerciseId:'IBF-SENTADILLA',sets:2,
    reps:'8',restSeconds:60,targetRpe:7,targetRir:3}],
};
function fixture({checkin=null,wrongOwner=false,allowReadState=true,remoteAck=true}={}){
  const listeners=new Map(),calls=[],operations=[];
  const root={
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    querySelector(){return null;},querySelectorAll(){return [];},
    async emit(type,event={}){for(const fn of listeners.get(type)||[])await fn(event);},
  };
  const state={identity:{role:'client',clientId:wrongOwner?'other-client':clientId},
    collections:{clients:[],appointments:[],sessionExecutions:[],checkins:checkin?[checkin]:[],
      iriAssessments:[],clientProfiles:[],wearableDailySummaries:[],wearableConnections:[],trainingCycles:[]},
    pendingOperations:[],conflicts:[],rejectedOperations:[]};
  const execution=createExecution({session,clientId});
  const inert={addEventListener(){},removeEventListener(){}};
  const context={session,execution,sessionRevision:session.revision,online:true,
    actor:{role:'client',clientId,userId:'synthetic-user'},
    actionState:createActionState(),
    commandBus:{execute:async command=>{
      calls.push(command);
      return remoteAck?{ok:true,kind:'ack',command,response:{executionRevision:1,remoteRevision:3}}
        :{ok:false,kind:'rejected',command,response:{reason:'REVISION_MISMATCH'}};
    }}};
  const controller=createSessionController({
    root,getContext:()=>context,render(){},
    getSessionEntryState:allowReadState?()=>state:null,
    onOperationResult:(operation,result)=>operations.push({operation,result}),
    liveTelemetryController:{start(){},pause(){},resume(){},stop(){}},
    lifecycleTarget:inert,visibilityTarget:{...inert,visibilityState:'visible'},
    clockTarget:{setInterval:()=>1,clearInterval(){}},
  });
  controller.mount();
  setPendingSessionEntry(root,{clientId,sessionId});
  return {root,controller,calls,operations,execution,context};
}
test('Client CTA revalidates current adaptive state and starts exactly once after remote ACK',async()=>{
  const f=fixture();
  // The real home CTA has no data-session-entry-level attribute. Capture the
  // user gesture before the route mounts, then validate the hydrated state.
  const button={getAttribute(name){return name==='data-entity-id'?sessionId:null;}};
  await f.root.emit('click',{target:{closest(selector){return selector==='[data-workflow-action="start-published-session"]'?button:null;}}});
  await f.root.emit('m26:shell-rendered');
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].type,'SESION_INICIAR');
  assert.equal(f.execution.status,'active');
  assert.match(f.context.actionState.message,/confirmado por el servidor/);
  assert.deepEqual(f.operations,[{operation:'training_start',result:'ack'}]);
  await f.root.emit('m26:shell-rendered');
  assert.equal(f.calls.length,1);
  f.controller.destroy();
});
test('Adaptive hold blocks first-tap autostart without losing the explicit session viewer',async()=>{
  const f=fixture({checkin:{id:'checkin-latest',clientId,createdAt:new Date().toISOString(),
    energy:7,sleep:8,stress:3,pain:8}});
  await f.root.emit('m26:shell-rendered');
  assert.equal(f.calls.length,0);
  assert.equal(f.execution.status,'ready');
  assert.deepEqual(f.operations,[]);
  f.controller.destroy();
});
test('Stale owner and remote rejection never report started workout',async()=>{
  const mismatched=fixture({wrongOwner:true});
  await mismatched.root.emit('m26:shell-rendered');
  assert.equal(mismatched.calls.length,0);
  assert.equal(mismatched.execution.status,'ready');
  mismatched.controller.destroy();

  const denied=fixture({remoteAck:false});
  await denied.root.emit('m26:shell-rendered');
  assert.equal(denied.calls.length,1);
  assert.equal(denied.execution.status,'ready');
  assert.deepEqual(denied.operations,[{operation:'training_start',result:'not_confirmed'}]);
  denied.controller.destroy();
});
