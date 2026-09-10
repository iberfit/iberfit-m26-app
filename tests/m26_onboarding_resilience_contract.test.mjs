import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createGuidedOnboardingRepository,
  guidedOnboardingScopeKey,
} from '../src/m26/onboarding/guided-tour.js';
import {
  createProgressiveOnboardingOpenState,
  createProgressiveOnboardingRepository,
  progressiveOnboardingScopeKey,
} from '../src/m26/onboarding/progressive-onboarding.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function throwingStorageScope(){
  const scope={};
  Object.defineProperty(scope,'localStorage',{
    configurable:true,
    get(){throw new Error('storage blocked');},
  });
  return scope;
}

function attributeRoot(){
  const attributes=new Map();
  return {
    setAttribute(name,value){attributes.set(name,String(value));},
    removeAttribute(name){attributes.delete(name);},
    getAttribute(name){return attributes.has(name)?attributes.get(name):null;},
  };
}

test('guided onboarding remains usable when browser localStorage access itself throws',()=>{
  const scope=throwingStorageScope();
  const key=guidedOnboardingScopeKey({userId:'storage-guided',role:'client'});
  const repository=createGuidedOnboardingRepository({scope});

  assert.doesNotThrow(()=>repository.read(key,'client'));
  assert.equal(repository.write(key,{
    role:'client',
    status:'in-progress',
    activeStepId:'client-plan',
  }),true);
  const state=repository.read(key,'client');
  assert.equal(state.status,'in-progress');
  assert.equal(state.activeStepId,'client-plan');
});

test('progressive onboarding keeps in-memory continuity when localStorage getter is unavailable',()=>{
  const scope=throwingStorageScope();
  const key=progressiveOnboardingScopeKey({userId:'storage-progressive',role:'coach'});
  const repository=createProgressiveOnboardingRepository({scope});

  assert.equal(repository.write(key,{
    role:'coach',
    visited:['coach-today','coach-clients'],
    hidden:true,
  }),true);
  const state=repository.read(key,'coach');
  assert.deepEqual([...state.visited],['coach-today','coach-clients']);
  assert.equal(state.hidden,true);
});

test('open-state bridge accepts direct authoritative updates while retaining DOM reconciliation',()=>{
  const root=attributeRoot();
  let domOpen=false;
  const documentLike={
    querySelector(selector){
      if(selector==='[data-m26-guided-tour]')return domOpen?{}:null;
      return null;
    },
  };
  const changes=[];
  const state=createProgressiveOnboardingOpenState({
    root,
    documentLike,
    onOpenChange:(open)=>changes.push(open),
  });

  assert.equal(state.set(true),true);
  assert.equal(state.isOpen(),true);
  assert.equal(root.getAttribute('data-m26-guided-tour-open'),'true');
  assert.deepEqual(changes,[true]);

  domOpen=true;
  assert.equal(state.sync(),true);
  assert.deepEqual(changes,[true],'fallback reconciliation must not duplicate direct notifications');

  assert.equal(state.set(false),false);
  assert.equal(root.getAttribute('data-m26-guided-tour-open'),null);
  assert.deepEqual(changes,[true,false]);
});

test('guided tour invalidates stale focus work and revalidates after BFCache restoration',()=>{
  const source=read('src/m26/onboarding/guided-tour.js');
  assert.match(source,/let renderToken=0;/u);
  assert.match(source,/function removeDialog\([^)]*\)\{\n\s*renderToken\+=1;/u);
  assert.match(source,/if\(token!==renderToken\|\|!open\|\|dialog\?\.isConnected===false\)return;/u);
  assert.match(source,/scope\?\.addEventListener\?\.\('pageshow',onPageShow\)/u);
  assert.match(source,/scope\?\.removeEventListener\?\.\('pageshow',onPageShow\)/u);
  assert.doesNotMatch(source,/storage=globalThis\.localStorage/u);
});

test('progressive controller combines direct tour state with observer fallback and bounded page restoration',()=>{
  const source=read('src/m26/onboarding/progressive-onboarding.js');
  assert.match(source,/onOpenChange:\(open\)=>tourOpenState\.set\(open\)/u);
  assert.match(source,/tourObserver\.observe\(documentLike\.body,\{childList:true\}\)/u);
  assert.match(source,/if\(tourOpenSyncScheduled\)return;/u);
  assert.match(source,/function onPageShow\(\)\{[\s\S]*guidedTour\.refresh\?\.\(\);[\s\S]*schedule\(\);[\s\S]*scheduleTourOpenStateSync\(\);/u);
  assert.match(source,/scope\?\.addEventListener\?\.\('pageshow',onPageShow\)/u);
  assert.match(source,/scope\?\.removeEventListener\?\.\('pageshow',onPageShow\)/u);
  assert.doesNotMatch(source,/storage=globalThis\.localStorage/u);
});
