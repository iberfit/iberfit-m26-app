import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanonicalStore} from '../src/m26/canonical-store.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('U360: session actor identity is a bounded frozen owner-scoped projection with zero archive copies',()=>{
  const archive=Array.from({length:256},(_,i)=>({id:'execution-'+i,clientId:'client-a'}));
  const store=createCanonicalStore({
    identity:{id:'coach-1',role:'coach',clientId:'client-a'},
    collections:{clients:[],sessionExecutions:archive},
  });
  const original=globalThis.structuredClone;
  let clones=0;
  globalThis.structuredClone=(value,...args)=>{clones++;return original(value,...args);};
  let snapshot;
  try{snapshot=store.getSessionActorSnapshot();}finally{globalThis.structuredClone=original;}
  assert.equal(clones,0,'never deep-copy Coach history to read actor identity');
  assert.deepEqual(snapshot,{identity:{id:'coach-1',role:'coach',clientId:'client-a'}});
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.identity));
  assert.equal('collections' in snapshot,false);
  assert.equal('sessionExecutions' in snapshot,false);
});

test('U360: shell event synchronizes every session control from a single consistent context and preserves first tap',()=>{
  const s=source('src/m26/workflows/session-controller.js');
  const start=s.indexOf('async function onShellRendered(){');
  const end=s.indexOf('function focusSessionRecoveryField(',start);
  assert.ok(start>0&&end>start);
  const handler=s.slice(start,end);
  assert.equal(handler.split('getContext()').length-1,1,'one context per route event');
  assert.ok(handler.includes('const context=getContext()'));
  for(const name of ['hydrateActiveSetDraft','hydrateFinalFeedbackDraft','syncLiveAddExerciseControl',
    'syncFinishControl','syncManualSyncControl','syncRecoveryReviewControl','scheduleCoachRestAutoAdvance',
    'ensureSessionClockTicker'])assert.ok(handler.includes(name+'(context)'),name+' must reuse context');
  assert.ok(handler.includes('peekPendingSessionEntry(root)'));
  assert.ok(handler.includes('consumePendingSessionEntry(root)'));
  assert.ok(handler.includes('await start()'));
  assert.ok(s.includes("root.addEventListener('m26:shell-rendered',onShellRendered)"));
});

test('U360: app session role and actor never clone the full canonical state during Coach route rendering',()=>{
  const s=source('src/m26/app/application.js');
  const start=s.indexOf('sessionController=createSessionController({');
  const end=s.indexOf("qaStage('rc64-setup-controllers-ready')",start);
  assert.ok(start>0&&end>start);
  const provider=s.slice(start,end);
  assert.equal(provider.split('store.getState().identity').length-1,0);
  assert.ok(provider.split('store.getSessionActorSnapshot().identity').length-1>=4);
  assert.ok(provider.includes('actor:{userId:'));
  assert.ok(provider.includes('clientId:String(store.getSessionActorSnapshot().identity?.clientId'));
  const qa=source('qa/signature-u26-authenticated-professional-routes.mjs');
  assert.ok(qa.includes(".toBeLessThanOrEqual(5_000)"));
  assert.ok(qa.includes("event.isTrusted!==true"));
});
