import test from 'node:test';
import assert from 'node:assert/strict';

import {createCommandBus,createMemoryOperationRepository} from '../src/m26/command-bus.js';
import {createExecutionRecoveryCoordinator,createMemoryExecutionRecoveryStore} from '../src/m26/workflows/session-recovery.js';
import {createExecution,startExecution,currentStep} from '../src/m26/workflows/session-execution.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';
import {createActionState} from '../src/m26/ui/action-state.js';

function deferred(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});return {promise,resolve,reject};}
function passiveTarget(extra={}){return {...extra,addEventListener(){},removeEventListener(){}};}
function node({action=null,field=null,value=''}){
  const attrs=new Map();
  if(action)attrs.set('data-session-action',action);
  if(field)attrs.set('data-set-field',field);
  return {
    value,disabled:false,checked:false,options:[],attrs,
    getAttribute(name){return attrs.get(name)??null;},
    setAttribute(name,value){attrs.set(name,String(value));},
    removeAttribute(name){attrs.delete(name);},
    closest(selector){
      if(selector==='[data-session-action]'&&action)return this;
      if(selector==='[data-set-field]'&&field)return this;
      return null;
    },
    click(){},focus(){},
  };
}
function rootHarness(){
  const listeners=new Map();
  const nodes={
    reps:node({field:'reps',value:'8'}),seconds:node({field:'seconds',value:''}),load:node({field:'load',value:'40 kg'}),
    rpe:node({field:'rpe',value:'8'}),rir:node({field:'rir',value:'2'}),notes:node({field:'notes',value:''}),
    complete:node({action:'complete-set'}),next:node({action:'next'}),
  };
  nodes.complete.attrs.set('data-rest-seconds','60');
  const root={
    ownerDocument:{activeElement:null},
    addEventListener(type,handler){const values=listeners.get(type)||[];values.push(handler);listeners.set(type,values);},
    removeEventListener(type,handler){listeners.set(type,(listeners.get(type)||[]).filter(item=>item!==handler));},
    querySelector(selector){
      const m=selector.match(/^\[data-set-field="([^"]+)"\]$/);if(m)return nodes[m[1]]||null;
      if(selector==='[data-session-action="finish"]'||selector==='[data-session-action="sync-now"]'||selector==='[data-session-action="add-live-exercise"]')return null;
      return null;
    },
    querySelectorAll(selector){if(selector==='[data-set-field]')return [nodes.reps,nodes.seconds,nodes.load,nodes.rpe,nodes.rir,nodes.notes];return [];},
    async click(target){for(const handler of listeners.get('click')||[])await handler({target,preventDefault(){}});},
  };
  return {root,nodes};
}

const actor={role:'coach',id:'coach-timeout'};
const session={id:'session-timeout',clientId:'client-timeout',blocks:[{
  id:'block-1',type:'exercise',exerciseId:'exercise-1',sets:2,reps:'8',restSeconds:60,targetRpe:7,targetRir:3,
}]};

test('timeout de progreso libera la UI, la siguiente acción queda en cola y el ACK tardío reconcilia sin duplicar',async()=>{
  const execution=createExecution({session,clientId:'client-timeout',executionId:'execution-timeout'});
  startExecution(execution,{actor});
  const firstGate=deferred();
  const calls=[];
  const repository=createMemoryOperationRepository();
  const commandBus=createCommandBus({
    repository,getToken:async()=> 'jwt',getRole:()=> 'coach',rehydrate:async()=>{},
    transport:{
      preflight:async()=>({kind:'ack'}),
      execute:async(_token,command)=>{
        calls.push({operationId:command.operationId,baseRevision:command.baseRevision});
        if(calls.length===1)return await firstGate.promise;
        return {kind:'ack',remoteRevision:2};
      },
    },
  });
  const store=createMemoryExecutionRecoveryStore({ownerId:'coach-timeout'});
  let context;
  const coordinator=createExecutionRecoveryCoordinator({store,commandBus,isOnline:()=>true,getActiveContext:()=>context});
  const actionState=createActionState();
  const {root,nodes}=rootHarness();
  const errors=[];
  context={session,execution,catalog:{has:()=>true,get:()=>null,search:()=>[]},actor,actionState,commandBus,recoveryCoordinator:coordinator,online:true};
  const controller=createSessionController({
    root,getContext:()=>context,render(){},onError:error=>errors.push(error),progressActionTimeoutMs:20,
    liveTelemetryController:{start(){},pause(){},resume(){},stop(){}},
    lifecycleTarget:passiveTarget(),visibilityTarget:passiveTarget({visibilityState:'visible'}),clockTarget:{},
  });
  controller.mount();

  await root.click(nodes.complete);
  assert.equal(actionState.status,'pending');
  assert.equal(execution.syncStatus,'pending');
  assert.equal(execution.pendingOperationIds.length,1);
  assert.equal(nodes.complete.disabled,false,'el control debe liberarse después del timeout de UI');
  assert.match(actionState.message,/Puedes continuar la sesión/u);

  await root.click(nodes.next);
  assert.equal(execution.setIndex,1,'la sesión debe poder avanzar localmente mientras el primer ACK sigue pendiente');
  assert.equal((await commandBus.pending()).length,2,'predecesor remoto + sucesor en cola deben quedar protegidos');

  firstGate.resolve({kind:'ack',remoteRevision:1});
  await new Promise(resolve=>setTimeout(resolve,80));

  assert.equal(calls.length,2,'el sucesor debe enviarse una sola vez tras rebase');
  assert.equal(calls[1].baseRevision,1);
  assert.equal(execution.revision,2);
  assert.equal(execution.syncStatus,'clean');
  assert.deepEqual(execution.pendingOperationIds,[]);
  assert.deepEqual(await commandBus.pending(),[]);
  assert.equal(currentStep(execution,session).setNumber,2);
  assert.ok(errors.some(error=>error?.message==='M26_SESSION_ACTION_TIMEOUT'),'el timeout de UI se reporta sin bloquear la continuidad');
  controller.destroy();
});