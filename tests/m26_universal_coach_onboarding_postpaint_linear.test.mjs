import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanonicalStore} from '../src/m26/canonical-store.js';
import {createProductionState} from '../src/m26/production-state.js';
import {deriveCoachSelfLaunchJourney} from '../src/m26/onboarding/coach-launch-journey.js';
import {confirmedSessionExecutionsForClient} from '../src/m26/domain/session-execution-truth.js';

function fixture(size=1000){
 const base=createProductionState();
 const clients=Array.from({length:36},(_,i)=>({id:'client-'+i,name:'Client '+i}));
 const sessionExecutions=Array.from({length:size},(_,i)=>{
  const clientId='client-'+(i%clients.length);
  return {id:'execution-'+i,clientId,startedBy:'coach-1',
   status:i%11===0?'active':'completed',
   syncStatus:i%17===0?'dirty':'clean',completedAt:'2026-11-01T12:00:00Z'};
 });
 sessionExecutions.push({
  id:'conflicting',clientId:'client-1',
  body:{clientId:'client-2',status:'completed'},startedBy:'coach-1'});
 const identity={id:'coach-1',role:'coach',status:'active',
  name:'Coach Example',email:'coach@example.invalid',lastAccessAt:'2026-11-06T12:00:00Z'};
 return {...base,identity,applicationAccess:{roleChoiceConfirmed:true,authorizedRoles:['coach']},
  selectedClientId:'client-1',collections:{...base.collections,clients,
  sessionExecutions,sessions:clients.map((client,i)=>({
   id:'session-'+i,clientId:client.id,status:'published',
   publishedAt:'2026-11-01T00:00:00Z',
  }))},pendingOperations:[{
   id:'pending-completion',type:'EJECUCION_COMPLETAR',entityId:'execution-22',
  }]};
}
test('U360: single-pass Coach milestone equals old canonical confirmation across all owners',()=>{
 const state=fixture();
 const coachId=state.identity.id,clients=state.collections.clients;
 const original=clients.flatMap(client=>confirmedSessionExecutionsForClient(
   state,client.id).filter(x=>String(x.startedBy||x.started_by||'')===coachId));
 const journey=deriveCoachSelfLaunchJourney({state});
 assert.equal(journey.completedSessionEvidence,original.length>0);
 assert.equal(journey.publishedPlanningEvidenceCount,clients.length);
 assert.equal(journey.clientEvidenceCount,clients.length);
 assert.equal(journey.ready,true);
 assert.equal(original.some(x=>x.id==='execution-22'),false,
  'a pending completion is never accepted as confirmed');
});
test('U360: huge Coach archive is not cloned to observe role or derive only frozen milestones',()=>{
 const state=fixture(2400);
 const store=createCanonicalStore(state);
 const saved=globalThis.structuredClone;
 let fullCopies=0;
 try{
  globalThis.structuredClone=x=>{
   if(x?.collections?.sessionExecutions?.length>2000)fullCopies++;
   return saved(x);
  };
  const identity=store.getOnboardingAccessSnapshot();
  assert.deepEqual(identity.identity,{role:'coach'});
  assert.equal(identity.applicationAccess.roleChoiceConfirmed,true);
  identity.applicationAccess.authorizedRoles.push('admin');
  assert.deepEqual(store.getOnboardingAccessSnapshot().applicationAccess.authorizedRoles,['coach']);
  const launch=store.getCoachLaunchJourney();
  assert.equal(launch.completedSessionEvidence,true);
  assert.equal(launch.coachId,'coach-1');
  assert.equal(fullCopies,0,'no eager clone during onboarding');
  assert.equal(Object.isFrozen(launch),true);
 }finally{globalThis.structuredClone=saved;}
});
test('U360: Client cannot obtain a Coach milestone and historical data remains unchanged',()=>{
 const state=fixture(48),original=structuredClone(state);
 state.identity={id:'client-1',role:'client',clientId:'client-1'};
 const store=createCanonicalStore(state);
 assert.equal(store.getCoachLaunchJourney(),null);
 assert.deepEqual(store.getState().collections.sessionExecutions,original.collections.sessionExecutions);
});
test('U360: onboarding update is after genuine shell paint, never a blocking route microtask',()=>{
 const s=readFileSync(new URL('../src/m26/onboarding/progressive-onboarding.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
 const qa=readFileSync(new URL('../qa/signature-u26-authenticated-professional-routes.mjs',import.meta.url),'utf8');
 assert.match(s,/function onShellRendered\(\)\{[\s\S]*?scheduleAfterPaint\(\);/u);
 assert.match(s,/postPaintFrame=raf\(\(\)=>\{/u);
 assert.match(s,/postPaintTimer=later\(\(\)=>\{/u);
 assert.match(s,/if\(mounted&&!deferUntilPaint\)render\(\);/u);
 assert.match(s,/launchJourneyProvider\(\)\|\|null/u);
 assert.match(s,/cancelAnimationFrame/u);
 assert.match(s,/clearTimeout/u);
 assert.match(app,/getOnboardingAccessSnapshot\?\.\(\)/u);
 assert.match(app,/launchJourneyProvider:\(\)=>store\.getCoachLaunchJourney\(\)/u);
 assert.match(qa,/\.toBeLessThanOrEqual\(5_000\)/u);
 assert.match(qa,/event\.isTrusted!==true/u);
});
