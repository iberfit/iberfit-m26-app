import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunicationController,__communicationControllerInternals} from '../src/m26/communication/controller.js';

const tick=()=>new Promise((resolve)=>setTimeout(resolve,0));

function control(key,checked){
  return Object.freeze({
    type:'checkbox',
    checked:Boolean(checked),
    getAttribute(name){return name==='data-m26-preference'?`notifications.${key}`:null;},
    closest(){return this;},
  });
}

function rootWithControls(controls=[]){
  const listeners=new Map();
  return {
    ownerDocument:{defaultView:null},
    addEventListener(name,fn){listeners.set(name,fn);},
    removeEventListener(name){listeners.delete(name);},
    querySelector(){return null;},
    querySelectorAll(selector){return selector==='[data-m26-preference^="notifications."]'?controls:[];},
    listeners,
  };
}

test('existing remote preferences are authoritative on a newly opened device',async()=>{
  const controls=[
    control('sessionReminders',false),
    control('scheduleChanges',false),
    control('planPublished',false),
    control('coachMessages',false),
    control('challenges',false),
    control('milestones',false),
  ];
  const root=rootWithControls(controls);
  const remote=Object.freeze({
    sessionReminders:true,
    scheduleChanges:true,
    planPublished:false,
    coachMessages:true,
    challenges:false,
    milestones:true,
  });
  let applied=null;
  let updates=0;
  let renders=0;
  const service={
    notificationPreferences:{
      async status(){return {ok:true,preferences:remote,updatedAt:'2026-09-19T23:00:00Z'};},
      async update(){updates+=1;return {ok:true};},
      applyRemote(value){applied=value;return true;},
    },
    webPush:{async status(){return {active:false};}},
  };
  const controller=createCommunicationController({root,service,render:()=>{renders+=1;}});
  controller.mount();
  await tick();
  await tick();
  assert.deepEqual(applied,remote);
  assert.equal(updates,0,'local defaults must never overwrite an existing remote consent row');
  assert.equal(renders,1);
  controller.destroy();
});

test('server defaults are authoritative and hydration remains read-only when no preference row exists',async()=>{
  const controls=[
    control('sessionReminders',true),
    control('scheduleChanges',false),
    control('planPublished',true),
    control('coachMessages',true),
    control('challenges',false),
    control('milestones',false),
  ];
  const root=rootWithControls(controls);
  const remote=Object.freeze({
    sessionReminders:true,
    scheduleChanges:true,
    planPublished:true,
    coachMessages:true,
    challenges:true,
    milestones:true,
  });
  const updates=[];
  let applied=null;
  const service={
    notificationPreferences:{
      async status(){return {ok:true,preferences:remote,updatedAt:null};},
      async update(value){updates.push(value);return {ok:true,preferences:value,updatedAt:'2026-09-19T23:00:00Z'};},
      applyRemote(value){applied=value;return true;},
    },
    webPush:{async status(){return {active:false};}},
  };
  const controller=createCommunicationController({root,service});
  controller.mount();
  await tick();
  await tick();
  assert.deepEqual(applied,remote);
  assert.equal(updates.length,0,'hydration must not create a preference row without explicit user action');
  controller.destroy();
});

test('queued preference retry clears only keys confirmed by the server',()=>{
  const {mergePreferencePayload,clearSyncedPreferenceKeys}=__communicationControllerInternals;
  const pending=mergePreferencePayload(
    {coachMessages:true,scheduleChanges:true},
    {milestones:false},
  );
  assert.deepEqual(pending,{coachMessages:true,scheduleChanges:true,milestones:false});
  assert.deepEqual(
    clearSyncedPreferenceKeys(pending,{coachMessages:true}),
    {scheduleChanges:true,milestones:false},
  );
});
