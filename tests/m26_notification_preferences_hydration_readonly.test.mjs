import test from 'node:test';
import assert from 'node:assert/strict';

import {createCommunicationController} from '../src/m26/communication/controller.js';

const REMOTE_DEFAULTS=Object.freeze({
  sessionReminders:true,
  scheduleChanges:true,
  planPublished:true,
  coachMessages:true,
  challenges:true,
  milestones:true,
});

function flushAsync(){
  return new Promise((resolve)=>setImmediate(resolve));
}

function createHarness(){
  const rootListeners=new Map();
  const windowListeners=new Map();
  const updates=[];
  const applied=[];
  let statusCalls=0;

  const controls=Object.entries(REMOTE_DEFAULTS).map(([key,checked])=>({
    type:'checkbox',
    checked,
    getAttribute(name){
      return name==='data-m26-preference'?`notifications.${key}`:null;
    },
  }));

  const windowLike={
    addEventListener(name,handler){windowListeners.set(name,handler);},
    removeEventListener(name,handler){if(windowListeners.get(name)===handler)windowListeners.delete(name);},
  };

  const root={
    ownerDocument:{defaultView:windowLike},
    addEventListener(name,handler){rootListeners.set(name,handler);},
    removeEventListener(name,handler){if(rootListeners.get(name)===handler)rootListeners.delete(name);},
    querySelector(){return null;},
    querySelectorAll(selector){
      return selector==='[data-m26-preference^="notifications."]'?controls:[];
    },
  };

  const service={
    notificationPreferences:{
      async status(){
        statusCalls+=1;
        return {ok:true,preferences:REMOTE_DEFAULTS,updatedAt:null};
      },
      async update(payload){
        updates.push({...payload});
        return {ok:true,preferences:{...REMOTE_DEFAULTS,...payload},updatedAt:'2026-09-21T00:00:00.000Z'};
      },
      applyRemote(preferences){
        applied.push({...preferences});
        return true;
      },
    },
    webPush:{async status(){return {active:false,supported:false};}},
    async execute(){return {ok:true};},
  };

  const controller=createCommunicationController({root,service});
  return {controller,rootListeners,windowListeners,controls,updates,applied,getStatusCalls:()=>statusCalls};
}

test('notification preference hydration stays read-only when server returns defaults without a persisted row',async()=>{
  const harness=createHarness();
  harness.controller.mount();
  await flushAsync();

  assert.equal(harness.getStatusCalls(),1);
  assert.deepEqual(harness.applied,[REMOTE_DEFAULTS]);
  assert.deepEqual(harness.updates,[],'hydration must never create a preference row');

  const online=harness.windowListeners.get('online');
  assert.equal(typeof online,'function');
  online();
  await flushAsync();

  assert.equal(harness.getStatusCalls(),2);
  assert.deepEqual(harness.updates,[],'reconnect hydration must remain read-only');
  harness.controller.destroy();
});

test('an explicit notification preference change still persists exactly that user change',async()=>{
  const harness=createHarness();
  harness.controller.mount();
  await flushAsync();
  assert.deepEqual(harness.updates,[]);

  const control=harness.controls[0];
  control.checked=false;
  const change=harness.rootListeners.get('change');
  assert.equal(typeof change,'function');
  change({target:{closest(){return control;}}});
  await flushAsync();

  assert.deepEqual(harness.updates,[{sessionReminders:false}]);
  harness.controller.destroy();
});
