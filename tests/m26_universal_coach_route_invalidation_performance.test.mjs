import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanonicalStore} from '../src/m26/canonical-store.js';
import {createProductionState} from '../src/m26/production-state.js';

const source=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
function historyState(){
 const base=createProductionState();
 return {...base,activeArea:'clientes',selectedClientId:'a',
 identity:{id:'coach-a',role:'coach'},hydration:{status:'ready'},
 collections:{...base.collections,
 clients:[{id:'a'},{id:'b'}],
 domainEvents:Array.from({length:1400},(_,i)=>({id:String(i),
  body:{owner:'a',proof:'v'.repeat(1400)}}))}};
}
test('UNIVERSAL: route invalidation and selection observers clone zero historical bytes',()=>{
 const store=createCanonicalStore(historyState());
 const original=globalThis.structuredClone;
 let expensiveClones=0;
 let invalidations=0;
 let selections=[];
 let legacySeen=[];
 const stopInvalidate=store.subscribeInvalidation(()=>{invalidations++;});
 const stopSelection=store.subscribeSelection(id=>{selections.push(id);});
 const stopLegacy=store.subscribe(s=>{legacySeen.push(s);});
 try{
  globalThis.structuredClone=value=>{
   if(value?.collections?.domainEvents?.length>1000)expensiveClones++;
   return original(value);
  };
  assert.equal(store.navigateFast('hoy'),true);
  assert.equal(invalidations,1);
  assert.equal(expensiveClones,1,'only legacy subscriber gets a full defensive clone');
  assert.deepEqual(selections,[],'route-only change must not pretend owner change');
  store.selectClient('b');
  assert.deepEqual(selections,['b']);
  assert.equal(invalidations,2);
  assert.equal(expensiveClones,3,
   'selectClient legacy API preserves one snapshot return and one subscriber clone');
  assert.equal(legacySeen.at(-1).selectedClientId,'b');
  assert.equal(store.getNavigationSnapshot().activeArea,'hoy');
  legacySeen[0].collections.domainEvents.length=0;
  assert.equal(store.getState().collections.domainEvents.length,1400,
   'legacy public observer may never mutate canonical private history');
 }finally{
  globalThis.structuredClone=original;
  stopInvalidate();stopSelection();stopLegacy();
 }
 assert.equal(store.navigateFast('clientes'),true);
 assert.equal(invalidations,2,'destroyed observers never fire');
 assert.deepEqual(selections,['b']);
});
test('UNIVERSAL: selection guard never clones a Coach archive on route changes',()=>{
 const store=createCanonicalStore(historyState());
 const original=globalThis.structuredClone;
 let copies=0,cancelled=false;
 const stop=store.subscribeSelection(id=>{if(id!=='a')cancelled=true;});
 try{
  globalThis.structuredClone=value=>{
   if(value?.collections?.domainEvents?.length>1000)copies++;
   return original(value);
  };
  assert.equal(store.navigateFast('hoy'),true);
  assert.equal(store.navigateFast('agenda'),true);
  assert.equal(copies,0);
  assert.equal(cancelled,false);
  assert.equal(store.selectClient('b').selectedClientId,'b');
  assert.equal(cancelled,true);
  assert.equal(copies,1,'only public selectClient return copies history');
 }finally{globalThis.structuredClone=original;stop();}
});
test('UNIVERSAL: every listener exception is isolated; no full-state or privilege transfer',()=>{
 const errors=[];
 const state=historyState();
 const store=createCanonicalStore(state,{onListenerError:e=>errors.push(e.message)});
 const offI=store.subscribeInvalidation(()=>{throw Error('observer-invalidated');});
 const offS=store.subscribeSelection(()=>{throw Error('selection-invalidated');});
 let legacyCalled=0;
 const offL=store.subscribe(()=>{legacyCalled++;});
 store.navigateFast('hoy');
 store.selectClient('b');
 assert.equal(legacyCalled,2);
 assert.deepEqual(errors,['observer-invalidated','selection-invalidated','observer-invalidated']);
 offI();offS();offL();
 assert.equal(store.getState().selectedClientId,'b');
});
test('UNIVERSAL: shell paints only latest state once per invalidation, strict QA real paint unchanged',()=>{
 const shell=source('../src/m26/shell/shell-controller.js');
 const app=source('../src/m26/app/application.js');
 const qa=source('../qa/signature-u26-authenticated-professional-routes.mjs');
 assert.match(shell,/store\.subscribeInvalidation\(scheduleRender\)/u);
 assert.match(shell,/const next=needsFreshState\?readShellSnapshot\(\):queuedState;/u);
 assert.match(shell,/store\.getRenderSnapshot\(\)/u);
 assert.match(shell,/if\(renderQueued\)return;/u);
 assert.match(shell,/token!==generation/u);
 assert.match(shell,/if\(shellInteractionActive\(\)\)return;/u);
 assert.match(app,/store\.subscribeSelection\(selectedClientId=>/u);
 assert.match(app,/hydrationCoordinator\.cancel\(\)/u);
 assert.match(qa,/event\.isTrusted!==true/u);
 assert.match(qa,/SIGNATURE_U26_SLOW_REAL_PAINT/u);
 assert.match(qa,/\.toBeLessThanOrEqual\(5_000\)/u);
 assert.doesNotMatch(qa,/force:true|dispatchEvent\(/u);
});
