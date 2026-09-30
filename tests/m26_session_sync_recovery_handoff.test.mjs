import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enhanceSessionSyncRecoveryBanner,
  openSessionRecoveryReview,
  sessionExitTarget,
  sessionSyncNeedsRecoveryReview,
} from '../src/m26/workflows/session-sync-recovery-ui.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';

function fakeElement(attrs={}){
  return {
    attrs:new Map(Object.entries(attrs)),
    children:[],
    disabled:false,
    className:'',
    textContent:'',
    getAttribute(name){return this.attrs.get(name)??null;},
    setAttribute(name,value){this.attrs.set(name,String(value));},
    removeAttribute(name){this.attrs.delete(name);},
    querySelector(selector){
      if(selector==='[data-session-recovery-review]')return this.children.find((child)=>child.getAttribute?.('data-session-recovery-review')==='true')||null;
      return null;
    },
    append(child){this.children.push(child);},
  };
}

function recoveryBannerHarness(status='conflict'){
  const documentLike={createElement:()=>fakeElement()};
  const banner=fakeElement({role:'alert'});
  banner.ownerDocument=documentLike;
  const root={
    ownerDocument:documentLike,
    querySelector(selector){
      return selector===`.m26-sync-banner.is-${status}`?banner:null;
    },
  };
  return {root,banner};
}

test('sync recovery review is limited to coach conflict/rejected states',()=>{
  assert.equal(sessionSyncNeedsRecoveryReview({syncStatus:'conflict'},{role:'coach'}),true);
  assert.equal(sessionSyncNeedsRecoveryReview({syncStatus:'rejected'},{role:'entrenador'}),true);
  assert.equal(sessionSyncNeedsRecoveryReview({syncStatus:'pending'},{role:'coach'}),false);
  assert.equal(sessionSyncNeedsRecoveryReview({syncStatus:'conflict'},{role:'client'}),false);
});

test('conflict banner gains one accessible safe handoff without retrying or discarding data',()=>{
  const {root,banner}=recoveryBannerHarness('conflict');
  assert.equal(enhanceSessionSyncRecoveryBanner(root,{syncStatus:'conflict'},{role:'coach'}),true);
  assert.equal(banner.getAttribute('aria-live'),'assertive');
  assert.equal(banner.getAttribute('aria-atomic'),'true');
  assert.equal(banner.children.length,1);
  const button=banner.children[0];
  assert.equal(button.getAttribute('data-session-action'),'exit-session');
  assert.equal(button.getAttribute('data-session-exit-target'),'verificacion');
  assert.equal(button.getAttribute('data-session-recovery-review'),'true');
  assert.equal(button.textContent,'Revisar sincronización');
  assert.equal(sessionExitTarget(button),'verificacion');
  assert.equal(enhanceSessionSyncRecoveryBanner(root,{syncStatus:'conflict'},{role:'coach'}),true);
  assert.equal(banner.children.length,1);
});

test('recovery review opens the existing verification route and fails closed when unavailable',()=>{
  let clicks=0;
  const nav={click(){clicks+=1;}};
  assert.equal(openSessionRecoveryReview({querySelector:()=>nav}),true);
  assert.equal(clicks,1);
  assert.equal(openSessionRecoveryReview({querySelector:()=>null}),false);
});

test('coach conflict handoff persists recovery before exiting and only then opens verification',async()=>{
  const listeners=[];
  const order=[];
  const documentLike={activeElement:null,createElement:()=>fakeElement()};
  const banner=fakeElement({role:'alert'});
  banner.ownerDocument=documentLike;
  const nav={click(){order.push('verification');}};
  const root={
    ownerDocument:documentLike,
    addEventListener(type,fn,capture=false){listeners.push({type,fn,capture:Boolean(capture)});},
    removeEventListener(){},
    querySelector(selector){
      if(selector==='.m26-sync-banner.is-conflict')return banner;
      if(selector==='[data-m26-area="verificacion"]')return nav;
      return null;
    },
    querySelectorAll(){return [];},
    dispatchEvent(){},
  };
  const execution={
    id:'execution-conflict',
    sessionId:'session-1',
    clientId:'client-1',
    status:'active',
    syncStatus:'conflict',
    pendingOperationIds:['op-conflict'],
    lastSyncError:'REVISION_CONFLICT',
    queue:[{blockId:'block-1',exerciseId:'exercise-1',sets:1,prescription:{}}],
    index:0,
    setIndex:0,
    results:{},
  };
  const recoveryCoordinator={
    async persist(){order.push('persist');},
    async settle(){order.push('settle');},
  };
  const context={
    execution,
    session:{id:'session-1',clientId:'client-1'},
    recoveryCoordinator,
    actor:{role:'coach',userId:'coach-1'},
    actionState:{status:'idle',message:''},
    async onExit(){order.push('exit');},
  };
  const controller=createSessionController({
    root,
    getContext:()=>context,
    render:()=>{},
    onError:(error)=>{throw error;},
    liveTelemetryController:{start:async()=>{},pause:async()=>{},resume:async()=>{},stop:async()=>{}},
    lifecycleTarget:{addEventListener(){},removeEventListener(){}},
    visibilityTarget:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
    clockTarget:{},
  });
  controller.mount();
  assert.equal(banner.children.length,1);
  const reviewButton=banner.children[0];
  const click=listeners.find((item)=>item.type==='click'&&!item.capture)?.fn;
  assert.equal(typeof click,'function');
  await click({
    target:{closest:(selector)=>selector==='[data-session-action]'?reviewButton:null},
    preventDefault(){},
  });
  await Promise.resolve();
  assert.deepEqual(order.slice(0,4),['persist','settle','exit','verification']);
  assert.equal(execution.syncStatus,'conflict');
  assert.deepEqual(execution.pendingOperationIds,['op-conflict']);
});
