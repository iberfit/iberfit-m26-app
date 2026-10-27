import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const listeners=new Map();
const root={
  addEventListener(type,handler){listeners.set(type,handler);},
  removeEventListener(type){listeners.delete(type);},
  querySelector(){return null;},
};
globalThis.__IBERFIT_M26_RUNTIME__=Object.freeze({enabled:false,qaOnly:true});
globalThis.requestIdleCallback=()=>0;
globalThis.document={
  querySelector(selector){return selector==='#app'?root:null;},
  querySelectorAll(){return [];},
  createElement(){return {setAttribute(){},addEventListener(){},removeEventListener(){}};},
  head:{append(){}},
};

const {validateLiveSetInput}=await import('../public/m26/app.js');

test('live set requires reps or time before completion',()=>{
  const result=validateLiveSetInput({reps:'',seconds:'',rpe:'7',rir:'3'});
  assert.equal(result.valid,false);
  assert.deepEqual(result.invalidFields,['reps','seconds']);
  assert.match(result.message,/repeticiones o tiempo/i);
});

test('live set requires valid RPE and optional RIR remains bounded',()=>{
  assert.equal(validateLiveSetInput({reps:'8',rpe:''}).valid,false);
  assert.deepEqual(validateLiveSetInput({reps:'8',rpe:''}).invalidFields,['rpe']);
  assert.equal(validateLiveSetInput({seconds:'30',rpe:'7',rir:'11'}).valid,false);
  assert.deepEqual(validateLiveSetInput({seconds:'30',rpe:'7',rir:'11'}).invalidFields,['rir']);
});

test('live set accepts the same numeric bounds as the domain contract',()=>{
  assert.equal(validateLiveSetInput({reps:'0',rpe:'1',rir:'0'}).valid,true);
  assert.equal(validateLiveSetInput({seconds:'86400',rpe:'10',rir:'10'}).valid,true);
  assert.equal(validateLiveSetInput({reps:'10001',rpe:'7'}).valid,false);
  assert.equal(validateLiveSetInput({seconds:'86401',rpe:'7'}).valid,false);
});

test('public enhancer disables invalid completion and exposes accessible guidance',()=>{
  const source=new URL('../public/m26/app.js',import.meta.url);
  const text=readFileSync(source,'utf8');
  assert.match(text,/data-m28-set-validation/);
  assert.match(text,/aria-invalid/);
  assert.match(text,/button\.disabled=!result\.valid/);
  assert.match(text,/button\.setAttribute\('aria-disabled',result\.valid\?'false':'true'\)/);
  assert.match(text,/root\.addEventListener\('input',onInput\)/);
});

test('Client set validation is reconciled after saved observations hydrate on shell render',()=>{
  const app=readFileSync(new URL('../public/m26/app.js',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(app,/function onShellRendered\(\)\{[\s\S]*?refresh\(\);[\s\S]*?queueMicrotask\(syncLiveSetRequirements\)/u);
  // The Coach editor can snapshot/restore its panels before and after rendering.
  // Regardless of that UX work, the live Client set must hydrate AFTER the
  // shell's base render, rather than before it.
  const renderWrapper=controller.match(/render=\(\)=>\{([^\n]*)/u)?.[1]||'';
  const baseIndex=renderWrapper.indexOf('baseRender?.();');
  const hydrateIndex=renderWrapper.indexOf('hydrateActiveSetDraft(getContext())');
  assert.ok(baseIndex>=0,'The shell must complete the base render');
  assert.ok(hydrateIndex>baseIndex,'Saved live-set fields hydrate after the shell render');
  assert.match(renderWrapper,/restoreSessionBuilderDisclosureState\(/u);
  assert.match(renderWrapper,/restoreSessionBuilderFocus\(/u);
  assert.match(app,/button\.disabled=!result\.valid/u);
  assert.match(app,/root\.addEventListener\('input',onInput\)/u);
});
