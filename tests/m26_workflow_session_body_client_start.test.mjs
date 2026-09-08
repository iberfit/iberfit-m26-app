import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflowController} from '../src/m26/app/workflow-controller.js';

if (typeof globalThis.CustomEvent !== 'function') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type,{detail}={}){this.type=type;this.detail=detail;}
  };
}

function makeRoot(events,handlers){
  return {
    addEventListener(type,handler){handlers.set(type,handler);},
    removeEventListener(type){handlers.delete(type);},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    dispatchEvent(event){events.push(event);return true;},
  };
}

function makeButton(sessionId){
  return {
    dataset:{entityId:sessionId},
    disabled:false,
    type:'button',
    setAttribute(){},
    removeAttribute(){},
    getAttribute(name){
      if(name==='data-workflow-action')return 'start-published-session';
      return null;
    },
    closest(selector){
      if(selector==='[data-workflow-action]')return this;
      return null;
    },
  };
}

async function startWithSession(session){
  const events=[];
  const handlers=new Map();
  const state={
    identity:{role:'coach'},
    selectedClientId:'CLIENT-A',
    collections:{
      clients:[{id:'CLIENT-A'}],
      sessions:[session],
    },
  };
  const controller=createWorkflowController({
    root:makeRoot(events,handlers),
    store:{getState(){return state;}},
    commandBus:{async execute(){return {ok:true};}},
    catalog:{list(){return [];},count:0},
    mediaMap:null,
  });
  controller.mount();
  const click=handlers.get('click');
  assert.equal(typeof click,'function');
  await click({
    target:makeButton('SESSION-A'),
    preventDefault(){},
  });
  controller.destroy();
  return events;
}

test('published session start accepts legacy body.clientId shape',async()=>{
  const events=await startWithSession({
    id:'SESSION-A',
    body:{clientId:'CLIENT-A',status:'published'},
  });
  const started=events.find((event)=>event.type==='m26:start-session');
  assert.ok(started,'expected m26:start-session');
  assert.equal(started.detail.clientId,'CLIENT-A');
  assert.equal(started.detail.session.id,'SESSION-A');
  assert.equal(events.some((event)=>event.type==='m26:workflow-error'),false);
});

test('published session start accepts legacy body.client_id shape',async()=>{
  const events=await startWithSession({
    id:'SESSION-A',
    body:{client_id:'CLIENT-A',status:'published'},
  });
  const started=events.find((event)=>event.type==='m26:start-session');
  assert.ok(started,'expected m26:start-session');
  assert.equal(started.detail.session.id,'SESSION-A');
  assert.equal(events.some((event)=>event.type==='m26:workflow-error'),false);
});