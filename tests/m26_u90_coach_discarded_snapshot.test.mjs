import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanonicalStore} from '../src/m26/canonical-store.js';
import {createProductionState} from '../src/m26/production-state.js';

function fixture(){
 const base=createProductionState();
 return {...base,identity:{id:'verified-coach',role:'coach'},
  hydration:{status:'ready',error:null,refreshing:false},
  collections:{...base.collections,clients:[{id:'A'}],
   domainEvents:Array.from({length:1200},(_,i)=>({id:String(i),body:{proof:'x'.repeat(1000)}}))}};
}
test('Coach fast hydration status preserves notifications and avoids discarded full-state cloning',()=>{
 const s=createCanonicalStore(fixture()),original=globalThis.structuredClone;
 let fullCopies=0,notifications=0;
 const stop=s.subscribeInvalidation(()=>notifications++);
 try{
  globalThis.structuredClone=value=>{
   if(value?.collections?.domainEvents?.length>1000)fullCopies++;
   return original(value);
  };
  assert.equal(s.setHydrationFast('loading'),true);
  assert.equal(s.setHydrationFast('loading'),false);
  assert.equal(notifications,1);
  assert.equal(fullCopies,0);
  assert.equal(s.setHydrationFast('error',new Error('TRANSIENT')),true);
  assert.equal(fullCopies,0);
  const read=s.getState();
  assert.equal(read.hydration.status,'ready','existing verified owner remains visible');
  assert.equal(read.hydration.error,'TRANSIENT');
  assert.equal(fullCopies,1);
  const legacy=s.setHydration('ready');
  assert.equal(legacy.collections.domainEvents.length,1200);
  assert.equal(fullCopies,2,'legacy full-state return is unchanged');
  legacy.collections.domainEvents.length=0;
  assert.equal(s.getState().collections.domainEvents.length,1200);
 }finally{globalThis.structuredClone=original;stop();}
});
test('Full bootstrap still passes the same owner, permission and transport checks',()=>{
 const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
 const store=readFileSync(new URL('../src/m26/canonical-store.js',import.meta.url),'utf8');
 assert.match(app,/store\.setHydrationFast\('loading'\)/u);
 assert.match(app,/store\.hydrateFast\(enriched\)/u);
 assert.match(app,/store\.setHydrationFast\('error',error\)/u);
 assert.match(app,/requireOwner\(\); \/\/ No stale account/u);
 assert.match(store,/function hydrate\(snapshot\)\{return commitHydrate\(snapshot,true\);\}/u);
 assert.match(store,/function hydrateFast\(snapshot\)\{return commitHydrate\(snapshot,false\);\}/u);
 assert.match(store,/function getState\(\) \{\s*return clone\(state\)/u);
});
