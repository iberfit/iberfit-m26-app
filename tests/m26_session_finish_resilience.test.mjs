import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionController} from '../src/m26/workflows/session-controller.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {createActionState} from '../src/m26/ui/action-state.js';

function awaitingFeedback(){
  return {
    id:'execution-finish-1',
    sessionId:'session-finish-1',
    clientId:'client-finish-1',
    status:'awaiting_feedback',
    syncStatus:'clean',
    pendingOperationIds:[],
    lastSyncError:null,
    revision:7,
    queue:[{blockId:'block-1',exerciseId:'exercise-1',sets:1,prescription:{reps:'10',restSeconds:60,targetRpe:7,targetRir:3}}],
    index:1,
    setIndex:0,
    startedAt:'2026-09-10T01:00:00.000Z',
    activeSince:null,
    accumulatedActiveMs:1800000,
    completedAt:null,
    restUntil:null,
    events:[],
    results:{'exercise-1:1':{exerciseId:'exercise-1',setNumber:1,reps:10,seconds:null,load:'20 kg',rpe:7,rir:3,notes:'',completedAt:'2026-09-10T01:30:00.000Z'}},
    feedback:null,
  };
}

function harness({finishTimeoutMs=30,commandBus=null,recoveryCoordinator=null,onExit=()=>{}}={}){
  const listeners=new Map();
  const nodes=new Map();
  function node(selector,value='',attrs={}){
    const n={value,checked:false,disabled:false,options:[],attrs:new Map(Object.entries(attrs)),
      getAttribute(k){return this.attrs.get(k)??null;},setAttribute(k,v){this.attrs.set(k,v);},removeAttribute(k){this.attrs.delete(k);},
      closest(s){return s===selector||(s==='[data-session-action]'&&this.attrs.has('data-session-action'))?this:null;}};
    nodes.set(selector,n);return n;
  }
  node('[data-session-feedback-rpe]','8');
  node('[data-session-feedback-comment]','Sesión completada con buena técnica');
  node('[data-session-feedback-pain]').checked=false;
  node('[data-session-feedback-pain-notes]','');
  const finish=node('[data-session-action="finish"]','',{'data-session-action':'finish'});
  const exit=node('[data-session-action="exit-session"]','',{'data-session-action':'exit-session'});
  const root={querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],
    addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},
    removeEventListener(k,fn){listeners.get(k)?.delete(fn);}};
  const execution=awaitingFeedback();
  const session={id:'session-finish-1',clientId:'client-finish-1',title:'Fuerza A',blocks:[]};
  const context={session,execution,catalog:{has:()=>true,get:()=>null,search:()=>[]},actor:{role:'client',clientId:'client-finish-1'},actionState:createActionState(),commandBus,recoveryCoordinator,onExit};
  const errors=[];let renders=0;
  const controller=createSessionController({root,getContext:()=>context,render:()=>{renders+=1;},onError:e=>errors.push(e),finishTimeoutMs,
    liveTelemetryController:{stop:async()=>{},start:async()=>{},pause:async()=>{},resume:async()=>{}},lifecycleTarget:null,visibilityTarget:null});
  const fire=async(k,target)=>Promise.all([...listeners.get(k)||[]].map(fn=>fn({target,preventDefault(){}})));
  controller.mount();
  return {finish,exit,context,execution,errors,controller,listeners,fire,get renders(){return renders;}};
}

test('un cierre remoto que no responde sale de busy y no permite duplicar una finalización incierta',async()=>{
  let calls=0,operationId=null;
  const h=harness({commandBus:{execute:(command)=>{calls+=1;operationId=command.operationId;return new Promise(()=>{});}}});
  await h.fire('click',h.finish);
  assert.equal(calls,1);
  assert.equal(operationId,h.execution.id);
  assert.equal(h.execution.status,'awaiting_feedback');
  assert.equal(h.finish.getAttribute('aria-busy'),null);
  assert.equal(h.finish.disabled,true);
  assert.equal(h.execution.syncStatus,'pending');
  assert.deepEqual(h.execution.pendingOperationIds,[h.execution.id]);
  assert.equal(h.execution.lastSyncError,'M26_SESSION_ACTION_TIMEOUT');
  await h.fire('click',h.finish);
  assert.equal(calls,1);
  h.controller.destroy();
});

test('un ACK tardío reconcilia automáticamente el cierre incierto sin segundo envío',async()=>{
  let resolveCommand;let calls=0;
  const h=harness({commandBus:{execute:(command)=>{calls+=1;return new Promise(resolve=>{resolveCommand=()=>resolve({ok:true,kind:'ack',command:{operationId:command.operationId},response:{remoteRevision:8}});});}}});
  await h.fire('click',h.finish);
  assert.equal(h.execution.status,'awaiting_feedback');
  assert.equal(h.execution.syncStatus,'pending');
  resolveCommand();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls,1);
  assert.equal(h.execution.status,'completed');
  assert.equal(h.execution.syncStatus,'clean');
  assert.deepEqual(h.execution.pendingOperationIds,[]);
  assert.equal(h.execution.feedback.sessionRpe,8);
  assert.ok(h.renders>=1);
  h.controller.destroy();
});

test('el feedback final ofrece salida segura para terminar después sin marcar la sesión como completada',async()=>{
  const execution=awaitingFeedback();
  const html=renderGuidedExecution({execution,session:{id:execution.sessionId,title:'Fuerza A'},catalog:{get:()=>null,search:()=>[]},actionState:createActionState(),role:'client'});
  assert.match(html,/data-session-action="exit-session"/);
  assert.match(html,/Salir y terminar después/);
  assert.match(html,/data-session-action="finish"/);
  assert.equal(execution.status,'awaiting_feedback');
});

test('salir desde feedback persiste el borrador local antes de abandonar',async()=>{
  let persisted=null,exits=0;
  const recoveryCoordinator={persist:async context=>{persisted=structuredClone(context.execution);},settle:async()=>{}};
  const h=harness({recoveryCoordinator,onExit:()=>{exits+=1;}});
  h.execution.finalFeedbackDraft={executionId:h.execution.id,values:{sessionRpe:'8',comment:'Seguir después',pain:false,painNotes:''},updatedAt:'2026-09-10T02:00:00.000Z'};
  await h.fire('click',h.exit);
  assert.equal(exits,1);
  assert.equal(h.execution.status,'awaiting_feedback');
  assert.equal(persisted.finalFeedbackDraft.values.comment,'Seguir después');
  assert.equal(h.exit.getAttribute('aria-busy'),null);
  h.controller.destroy();
});
