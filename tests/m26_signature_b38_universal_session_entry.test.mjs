import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorkflowController} from '../src/m26/app/workflow-controller.js';

if(typeof globalThis.CustomEvent!=='function'){
  globalThis.CustomEvent=class CustomEvent{
    constructor(type,{detail}={}){this.type=type;this.detail=detail;}
  };
}
const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');

test('B38: every session type has its workflow and player controllers mounted before the shell is interactive',()=>{
  const ready=app.indexOf("root.dataset.m26Interactive='ready'");
  const setup=app.slice(app.indexOf('async function setupAuthenticated()'),ready);
  assert.ok(ready>0&&setup.length>0);
  assert.ok(setup.indexOf('workflow.mount();')>0);
  assert.ok(setup.indexOf('sessionController.mount();')>setup.indexOf('workflow.mount();'));
  assert.ok(setup.indexOf("root.dataset.m26SessionEntryReady='ready'")>setup.indexOf('sessionController.mount();'));
  assert.ok(setup.indexOf("root.dataset.m26SessionEntryReady='ready'")<setup.length);
  const progressive=app.slice(app.indexOf('const controllerEntries=['),app.indexOf('progressiveControllerMountPromise=(async()=>'));
  assert.doesNotMatch(progressive,/name:'workflow'|name:'session'/u,'critical controllers cannot be mounted after advertising interactive');
});

test('B38: pre-ready click on either training CTA is never silently discarded',()=>{
  assert.match(app,/function guardPendingSessionEntry\(event\)/u);
  assert.match(app,/start-published-session.*data-session-action="start"/u);
  assert.match(app,/event\.preventDefault\?\.\(\)/u);
  assert.match(app,/event\.stopImmediatePropagation\?\.\(\)/u);
  assert.match(app,/guardPendingSessionEntry, true/u);
  assert.match(app,/delete root\.dataset\.m26SessionEntryReady/u);
  assert.match(app,/removeEventListener\('click', guardPendingSessionEntry, true\)/u);
});

for(const sport of ['running','strength','swimming','mixed']){
  test('B38: '+sport+' published session reports a visible recovery message when entry is rejected',async()=>{
    const listeners=new Map(),notifications=[],events=[];
    const id='10000000-0000-4000-8000-000000000201';
    const clientId='10000000-0000-4000-8000-000000000202';
    const session={id,clientId,status:'disponible',
      deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
      clientVisibilityLevel:'full',
      body:{id,clientId,title:'Entrenamiento '+sport,
        blocks:[{id:'block1',type:'exercise',exerciseId:'exercise1',name:'Ejercicio '+sport}]}};
    const root={
      addEventListener(name,fn){listeners.set(name,fn);},
      removeEventListener(name){listeners.delete(name);},
      querySelector(){return null;},
      querySelectorAll(){return [];},
      dispatchEvent(evt){
        events.push(evt);
        if(evt.type==='m26:start-session')evt.detail.completion=Promise.reject(new Error('M42_SESSION_WORKSPACE_UNAVAILABLE'));
        return true;
      },
    };
    const orig=globalThis.dispatchEvent;
    globalThis.dispatchEvent=event=>{notifications.push(event);return true;};
    const button={dataset:{entityId:id},type:'button',disabled:false,
      closest(selector){return selector==='[data-workflow-action]'?this:null;},
      getAttribute(){return 'start-published-session';},
      setAttribute(){},removeAttribute(){},
    };
    const controller=createWorkflowController({root,
      store:{getState:()=>({identity:{role:'client',clientId},selectedClientId:clientId,
        collections:{clients:[{id:clientId}],sessions:[session]}})},
      commandBus:{execute:async()=>({ok:true})},catalog:{list(){return [];},count:0},mediaMap:null});
    try{
      controller.mount();
      await listeners.get('click')({target:button,preventDefault(){}});
      assert.equal(events.filter(event=>event.type==='m26:start-session').length,1);
      assert.ok(events.some(event=>event.type==='m26:workflow-error'),'failure must not be treated as success');
      assert.ok(notifications.some(event=>event.type==='m26:toast'&&/No se pudo abrir la sesión/i.test(event.detail?.message||'')),
        'Client route without a status node needs a global recovery message');
    }finally{
      controller.destroy();
      if(orig===undefined)delete globalThis.dispatchEvent;else globalThis.dispatchEvent=orig;
    }
  });
}

for(const sport of ['running','strength','swimming','mixed']){
  test('U46 '+sport+' first click fails closed if the session workspace listener is missing',async()=>{
    const listeners=new Map(),notifications=[],events=[];
    const id='10000000-0000-4000-8000-000000000201';
    const clientId='10000000-0000-4000-8000-000000000202';
    const session={id,clientId,status:'disponible',
      deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
      clientVisibilityLevel:'full',
      body:{id,clientId,title:'Entrenamiento '+sport,
        blocks:[{id:'block1',type:'exercise',exerciseId:'exercise1',name:'Ejercicio '+sport}]}};
    const root={
      addEventListener(name,fn){listeners.set(name,fn);},
      removeEventListener(name){listeners.delete(name);},
      querySelector(){return null;},
      querySelectorAll(){return [];},
      dispatchEvent(evt){events.push(evt);return true;},
    };
    const original=globalThis.dispatchEvent;
    globalThis.dispatchEvent=event=>{notifications.push(event);return true;};
    const button={dataset:{entityId:id},type:'button',disabled:false,
      closest(selector){return selector==='[data-workflow-action]'?this:null;},
      getAttribute(){return 'start-published-session';},
      setAttribute(){},removeAttribute(){}};
    const controller=createWorkflowController({root,
      store:{getState:()=>({identity:{role:'client',clientId},selectedClientId:clientId,
        collections:{clients:[{id:clientId}],sessions:[session]}})},
      commandBus:{execute:async()=>({ok:true})},
      catalog:{list(){return [];},count:0},mediaMap:null});
    try{
      controller.mount();
      await listeners.get('click')({target:button,preventDefault(){}});
      assert.equal(events.filter(evt=>evt.type==='m26:start-session').length,1);
      assert.equal(events.filter(evt=>evt.type==='m26:workflow-error').length,1);
      assert.ok(notifications.some(evt=>evt.type==='m26:toast'&&
        /reproductor no está preparado/u.test(evt.detail?.message||'')),
        'Any sport without an attached player must show an actionable visible error');
      assert.equal(button.disabled,false,'The user can retry after recovering');
    }finally{
      controller.destroy();
      if(original===undefined)delete globalThis.dispatchEvent;
      else globalThis.dispatchEvent=original;
    }
  });
}
