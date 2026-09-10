import test from 'node:test';
import assert from 'node:assert/strict';

import * as publicApi from '../src/m26/onboarding/guided-tour.js';
import {existsSync} from 'node:fs';

function fakeClassList(){
  const values=new Set();
  return {
    add(value){values.add(value);},
    remove(value){values.delete(value);},
    contains(value){return values.has(value);},
  };
}

function createHarness(){
  const documentListeners=new Map();
  const targetAttributes=new Map();
  const target={
    classList:fakeClassList(),
    setAttribute(name,value){targetAttributes.set(name,String(value));},
    removeAttribute(name){targetAttributes.delete(name);},
    getAttribute(name){return targetAttributes.get(name)??null;},
    scrollIntoView(){},
  };
  const activeArea={getAttribute(name){return name==='data-m26-area'?'hoy':null;}};
  const focusable={focus(){}};
  const state={dialog:null,style:null};
  const documentLike={
    activeElement:{isConnected:true,focus(){}},
    head:{append(node){state.style=node;}},
    body:{
      insertAdjacentHTML(_position,markup){
        const listeners=new Map();
        const dialog={
          markup,
          addEventListener(type,handler){listeners.set(type,handler);},
          removeEventListener(type,handler){if(listeners.get(type)===handler)listeners.delete(type);},
          querySelector(selector){return selector==='[data-m26-guided-tour-next]'?focusable:null;},
          focus(){},
          remove(){if(state.dialog===dialog)state.dialog=null;},
          emit(type,event){listeners.get(type)?.(event);},
        };
        state.dialog=dialog;
      },
    },
    createElement(){
      const attributes=new Map();
      return {
        textContent:'',
        setAttribute(name,value){attributes.set(name,String(value));},
        remove(){if(state.style===this)state.style=null;},
      };
    },
    querySelector(selector){
      if(selector==='[data-m26-guided-tour]')return state.dialog;
      if(selector==='[data-m26-guided-tour-style]')return state.style;
      return null;
    },
    querySelectorAll(selector){
      if(selector==='[data-m26-guided-tour]')return state.dialog?[state.dialog]:[];
      return [];
    },
    addEventListener(type,handler){
      const list=documentListeners.get(type)||[];
      list.push(handler);
      documentListeners.set(type,list);
    },
    removeEventListener(type,handler){
      const list=documentListeners.get(type)||[];
      documentListeners.set(type,list.filter((item)=>item!==handler));
    },
    emit(type,event){for(const handler of documentListeners.get(type)||[])handler(event);},
  };
  const root={
    ownerDocument:documentLike,
    addEventListener(){},
    removeEventListener(){},
    dispatchEvent(){},
    querySelector(selector){
      if(selector==='[data-m26-area][aria-current="page"]')return activeArea;
      if(selector==='[data-m26-area="hoy"]')return target;
      return null;
    },
    querySelectorAll(selector){
      if(selector==='[data-m26-guided-tour-target-active="true"]'&&target.getAttribute('data-m26-guided-tour-target-active')==='true')return [target];
      return [];
    },
  };
  const storage={getItem(){return null;},setItem(){}};
  const scope={document:documentLike,matchMedia(){return {matches:true};}};
  return {root,documentLike,target,state,storage,scope};
}

function closeEvent(selector){
  return {
    preventDefault(){},
    target:{
      closest(query){
        return query===selector||query==='[data-m26-guided-tour]'?{}:null;
      },
    },
  };
}

test('guided-tour remains a single canonical module while preserving the full public surface and hardened factory',()=>{
  const expectedExports=[
  "GUIDED_ONBOARDING_VERSION",
  "GUIDED_ONBOARDING_SCHEMA_VERSION",
  "guidedOnboardingCopy",
  "guidedOnboardingTranslationCoverage",
  "guidedOnboardingTrack",
  "guidedOnboardingSettingsArea",
  "guidedOnboardingScopeKey",
  "normalizeGuidedOnboardingState",
  "createGuidedOnboardingRepository",
  "resolveGuidedOnboardingSteps",
  "shouldAutoOpenGuidedOnboarding",
  "renderGuidedOnboardingDialog",
  "renderGuidedOnboardingSettings",
  "__guidedOnboardingInternals"
];
  for(const key of expectedExports){
    assert.ok(Object.hasOwn(publicApi,key),`missing public export ${key}`);
  }
  assert.equal(typeof publicApi.createGuidedTourController,'function');
  assert.equal(existsSync(new URL('../src/m26/onboarding/guided-tour-core.js',import.meta.url)),false,'guided tour must remain single-module to avoid duplicated UI/i18n surfaces');
});

test('direct controller can open before mount and destroy without leaving dialog target or style residue',()=>{
  const harness=createHarness();
  const changes=[];
  const controller=publicApi.createGuidedTourController({
    ...harness,
    identityProvider:()=>({role:'client',userId:'direct-user'}),
    onOpenChange:(open)=>changes.push(open),
  });

  assert.equal(controller.open(),true);
  assert.equal(controller.isOpen(),true);
  assert.deepEqual(changes,[true]);
  assert.ok(harness.state.dialog);
  assert.ok(harness.state.style);
  assert.equal(harness.target.classList.contains('m26-guided-tour-target'),true);
  assert.equal(harness.target.getAttribute('data-m26-guided-tour-target-active'),'true');

  assert.doesNotThrow(()=>controller.destroy());
  assert.equal(controller.isOpen(),false);
  assert.deepEqual(changes,[true,false]);
  assert.equal(harness.state.dialog,null);
  assert.equal(harness.state.style,null);
  assert.equal(harness.target.classList.contains('m26-guided-tour-target'),false);
  assert.equal(harness.target.getAttribute('data-m26-guided-tour-target-active'),null);

  assert.doesNotThrow(()=>controller.destroy());
  assert.deepEqual(changes,[true,false],'repeated destroy must not duplicate close notifications');
});

test('direct controller can reopen after pre-mount cleanup and manual close reports false',async()=>{
  const harness=createHarness();
  const changes=[];
  const controller=publicApi.createGuidedTourController({
    ...harness,
    identityProvider:()=>({role:'client',userId:'reopen-user'}),
    onOpenChange:(open)=>changes.push(open),
  });

  assert.equal(controller.open(),true);
  controller.destroy();
  assert.equal(controller.open(),true);
  assert.equal(controller.isOpen(),true);
  const event=closeEvent('[data-m26-guided-tour-close]');
  harness.documentLike.emit('click',event);
  harness.state.dialog.emit('click',event);
  await Promise.resolve();
  assert.equal(controller.isOpen(),false);
  assert.deepEqual(changes,[true,false,true,false]);
  controller.destroy();
});

test('skip and finish also reconcile direct open state without callback failures escaping',async()=>{
  for(const selector of ['[data-m26-guided-tour-skip]','[data-m26-guided-tour-next]']){
    const harness=createHarness();
    const changes=[];
    const controller=publicApi.createGuidedTourController({
      ...harness,
      identityProvider:()=>({role:'client',userId:`exit-${selector}`}),
      onOpenChange:(open)=>{changes.push(open);if(open)throw new Error('consumer failure');},
    });
    assert.doesNotThrow(()=>controller.open());
    assert.equal(controller.isOpen(),true);
    const event=closeEvent(selector);
    harness.documentLike.emit('click',event);
    harness.state.dialog.emit('click',event);
    await Promise.resolve();
    assert.equal(controller.isOpen(),false);
    assert.deepEqual(changes,[true,false]);
    controller.destroy();
  }
});
