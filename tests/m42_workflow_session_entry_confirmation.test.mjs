import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflowController} from '../src/m26/app/workflow-controller.js';
if(typeof globalThis.CustomEvent!=='function'){
  globalThis.CustomEvent=class CustomEvent{
    constructor(type,{detail}={}){this.type=type;this.detail=detail;}
  };
}
function setup({reject=false,completionMode='promise'}={}){
  const handlers=new Map(),events=[],status={textContent:'',dataset:{}};
  let release,requests=0;
  const root={
    addEventListener(type,fn){handlers.set(type,fn);},
    removeEventListener(type){handlers.delete(type);},
    querySelector(selector){return selector==='[data-workflow-status="session"]'?status:null;},
    querySelectorAll(){return [];},
    dispatchEvent(event){
      events.push(event);
      if(event.type==='m26:start-session'){
        requests++;
        if(completionMode==='missing')return true;
        if(completionMode==='invalid'){event.detail.completion={};return true;}
        if(completionMode==='not-opened'){event.detail.completion=Promise.resolve(false);return true;}
        event.detail.completion=new Promise((resolve,decline)=>{
          release=()=>reject?decline(new Error('M26_SESSION_CLIENT_MISMATCH')):resolve(true);
        });
      }
      return true;
    },
  };
  const clientId='CLIENT-A',id='SESSION-A';
  const state={identity:{role:'coach'},selectedClientId:clientId,
    collections:{clients:[{id:clientId}],sessions:[{id,clientId,status:'disponible',
    body:{clientId,blocks:[{id:'B1',exerciseId:'squat',name:'Sentadilla'}]}}]}};
  const ctrl=createWorkflowController({root,store:{getState:()=>state},
    commandBus:{async execute(){return {ok:true};}},
    catalog:{list(){return [];},count:0},mediaMap:null});
  const button={disabled:false,dataset:{entityId:id},type:'button',
    setAttribute(){},removeAttribute(){},
    getAttribute(name){return name==='data-workflow-action'?'start-published-session':null;},
    closest(selector){return selector==='[data-workflow-action]'?this:null;}};
  ctrl.mount();
  return {ctrl,events,status,handlers,button,trigger(){return handlers.get('click')({target:button,preventDefault(){}});},
    get requests(){return requests;},finish(){release();}};
}
test('M42 opening session remains pending until actual async workspace preparation confirms ready',async()=>{
  const s=setup();
  const first=s.trigger();await Promise.resolve();
  assert.equal(s.requests,1);assert.equal(s.status.dataset.status,'pending');
  await s.trigger();
  assert.equal(s.requests,1,'second click does not start competing recovery');
  s.finish();await first;
  assert.equal(s.status.dataset.status,'success');
  assert.match(s.status.textContent,/Sesión abierta/u);
  assert.equal(s.events.some(e=>e.type==='m26:workflow-error'),false);
  s.ctrl.destroy();
});
test('M42 failed async workspace opening never paints false success',async()=>{
  const s=setup({reject:true});
  const first=s.trigger();await Promise.resolve();
  assert.equal(s.status.dataset.status,'pending');
  s.finish();await first;
  assert.equal(s.status.dataset.status,'error');
  assert.equal(s.events.some(e=>e.type==='m26:workflow-error'),true);
  s.ctrl.destroy();
});

for(const completionMode of ['missing','invalid','not-opened']){
  test('U46 missing or invalid session player handshake never reports success: '+completionMode,async()=>{
    const s=setup({completionMode});
    await s.trigger();
    assert.equal(s.requests,1,'first tap dispatches once');
    assert.equal(s.status.dataset.status,'error','never present a false opened state');
    assert.doesNotMatch(s.status.textContent,/Sesión abierta|Confirma Inicio/u);
    assert.match(s.status.textContent,completionMode==='not-opened'
      ?/No se pudo abrir la sesión/u:/reproductor no está preparado/u);
    assert.equal(s.events.filter(e=>e.type==='m26:workflow-error').length,1);
    assert.equal(s.button.disabled,false,'a recoverable failure must allow retry');
    s.ctrl.destroy();
  });
}
