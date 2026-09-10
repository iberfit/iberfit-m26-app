import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderSessionSyncBanner} from '../src/m26/workflows/session-ui.js';
import {
  createSessionController,
  manualSessionSyncOutcome,
} from '../src/m26/workflows/session-controller.js';

test('pending session banner adds one explicit manual sync action without hiding existing status copy',()=>{
  const pending=renderSessionSyncBanner({syncStatus:'pending'});
  assert.match(pending,/Guardado en este dispositivo · pendiente de sincronización\./u);
  assert.match(pending,/data-session-action="sync-now"/u);
  assert.match(pending,/>Sincronizar ahora</u);

  assert.equal(renderSessionSyncBanner({syncStatus:'clean'}),'');
  assert.doesNotMatch(renderSessionSyncBanner({syncStatus:'conflict'}),/sync-now/u);
  assert.doesNotMatch(renderSessionSyncBanner({syncStatus:'rejected'}),/sync-now/u);
});

test('manual sync messaging never claims success while offline, pending, conflicted or rejected',()=>{
  assert.deepEqual(
    manualSessionSyncOutcome({syncStatus:'clean'},{online:true,attempted:1,results:[]}),
    {status:'success',message:'Sincronización completada. Los cambios pendientes quedaron confirmados.'},
  );
  assert.match(
    manualSessionSyncOutcome({syncStatus:'pending'},{online:false}).message,
    /Sin conexión/u,
  );
  assert.match(
    manualSessionSyncOutcome({syncStatus:'pending'},{online:true,deferred:1}).message,
    /próximo reintento/u,
  );
  assert.match(
    manualSessionSyncOutcome({syncStatus:'conflict'},{online:true}).message,
    /versión más reciente/u,
  );
  assert.match(
    manualSessionSyncOutcome({syncStatus:'rejected'},{online:true}).message,
    /no pudo confirmarse/u,
  );
  assert.equal(
    manualSessionSyncOutcome({syncStatus:'pending'},null,new Error('NETWORK')).status,
    'retry',
  );
});

function controllerHarness({sync}={}){
  const listeners=[];
  const execution={
    id:'execution-1',
    sessionId:'session-1',
    clientId:'client-1',
    status:'active',
    syncStatus:'pending',
    pendingOperationIds:['op-1'],
    queue:[{blockId:'block-1',exerciseId:'exercise-1',sets:1,prescription:{}}],
    index:0,
    setIndex:0,
    results:{},
  };
  const actionState={status:'idle',message:''};
  let syncCalls=0;
  let renders=0;
  const button={
    disabled:false,
    attrs:new Map([['data-session-action','sync-now']]),
    getAttribute(name){return this.attrs.get(name)||null;},
    setAttribute(name,value){this.attrs.set(name,String(value));},
    removeAttribute(name){this.attrs.delete(name);},
  };
  const root={
    addEventListener(type,fn,capture=false){listeners.push({type,fn,capture:Boolean(capture)});},
    removeEventListener(){},
    querySelector(selector){
      if(selector==='[data-session-action="sync-now"]')return button;
      return null;
    },
    querySelectorAll(){return [];},
  };
  const recoveryCoordinator={
    async synchronize(){
      syncCalls+=1;
      return sync?sync({execution}):{online:true,attempted:0,results:[]};
    },
    async persist(){},
    async settle(){},
  };
  const controller=createSessionController({
    root,
    getContext:()=>({
      execution,
      session:{id:'session-1',clientId:'client-1'},
      actionState,
      recoveryCoordinator,
    }),
    render:()=>{renders+=1;},
    onError:()=>{},
    liveTelemetryController:{
      start:async()=>{},
      pause:async()=>{},
      resume:async()=>{},
      stop:async()=>{},
    },
    lifecycleTarget:{addEventListener(){},removeEventListener(){}},
    visibilityTarget:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
  });
  controller.mount();
  const click=listeners.find((item)=>item.type==='click'&&!item.capture)?.fn;
  assert.equal(typeof click,'function');
  const event={
    target:{closest:(selector)=>selector==='[data-session-action]'?button:null},
    preventDefault(){},
  };
  return {controller,execution,actionState,button,event,click,get syncCalls(){return syncCalls;},get renders(){return renders;}};
}

test('manual sync button calls the existing recovery coordinator exactly once and reports confirmed state',async()=>{
  const harness=controllerHarness({
    sync:async({execution})=>{
      execution.syncStatus='clean';
      execution.pendingOperationIds=[];
      return {online:true,attempted:1,remaining:0,deferred:0,results:[{ok:true,kind:'ack'}]};
    },
  });
  await harness.click(harness.event);
  assert.equal(harness.syncCalls,1);
  assert.equal(harness.execution.syncStatus,'clean');
  assert.equal(harness.actionState.status,'success');
  assert.match(harness.actionState.message,/Sincronización completada/u);
  assert.equal(harness.button.attrs.has('aria-busy'),false);
  harness.controller.destroy();
});

test('manual sync while offline keeps pending state and gives a truthful retry message',async()=>{
  const harness=controllerHarness({
    sync:async()=>({online:false,attempted:0,results:[]}),
  });
  await harness.click(harness.event);
  assert.equal(harness.syncCalls,1);
  assert.equal(harness.execution.syncStatus,'pending');
  assert.equal(harness.actionState.status,'retry');
  assert.match(harness.actionState.message,/Sin conexión/u);
  harness.controller.destroy();
});

test('manual sync is coordination only and does not become a domain dispatch action',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  const dispatchStart=source.indexOf('export function dispatchSessionAction');
  const dispatchEnd=source.indexOf('export function createSessionController',dispatchStart);
  const dispatch=source.slice(dispatchStart,dispatchEnd);
  assert.doesNotMatch(dispatch,/sync-now/u);

  const controller=source.slice(dispatchEnd);
  assert.match(controller,/if\(action==='sync-now'\)/u);
  assert.match(controller,/await context\.recoveryCoordinator\.synchronize\(\)/u);
  assert.match(controller,/manualSyncPending/u);
});

test('pending sync banner remains responsive and touch-friendly without disabling pointer interaction',()=>{
  const css=fs.readFileSync('src/m26/shell/shell.css','utf8');
  const start=css.indexOf('.m26-sync-banner{');
  assert.ok(start>=0);
  const block=css.slice(start,start+1400);
  assert.match(block,/\.m26-sync-banner\.is-pending\{display:flex/u);
  assert.match(block,/min-height:2\.75rem/u);
  assert.doesNotMatch(block,/pointer-events\s*:\s*none|display\s*:\s*none|visibility\s*:\s*hidden/iu);
});

test('manual sync addition does not reintroduce automatic connectivity IO at login',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  const start=source.indexOf('async function setupAuthenticated()');
  const end=source.indexOf('function guardSessionNavigation',start);
  const setup=source.slice(start,end);
  assert.match(setup,/connectivityStop=sync\.start\(\{emitInitial:false\}\)/u);
  assert.doesNotMatch(setup,/await sync\.sync\(\)/u);
});
