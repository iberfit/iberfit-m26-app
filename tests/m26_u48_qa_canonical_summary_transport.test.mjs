import test from 'node:test';
import assert from 'node:assert/strict';
import {compactQaCanonicalExecutionSummaries,expandQaCanonicalExecutionSummaries,
 __qaCanonicalSummaryTransportInternals} from '../src/m26/domain/qa-canonical-summary-transport.js';
import {assertProductionSnapshot,stateFromBootstrap} from '../src/m26/production-state.js';
const ID='16145839-2e7d-48e2-bf0c-e94325f5c54c';
const CLIENT='57f56a87-d04e-47d5-b1cc-8d4939d7c804';
const SESSION='4d244c01-8966-40f1-8cc7-9e6ec46d1708';
const REF=__qaCanonicalSummaryTransportInternals.REF;
function fixture(value='kept'){
 const body={id:ID,clientId:CLIENT,sessionId:SESSION,revision:2,status:'en_curso',
  sourceSnapshot:{title:'QA running'},items:[{exerciseId:'IBF-CARRERA-SUAVE',sets:1}],
  progressSnapshot:{results:{'running:1':{distanceKm:6.5,seconds:2145}},notes:value}};
 return {environment:'QA',canary:{active:true,scope:'allowlist'},
  user:{id:'a0000000-0000-4000-8000-000000000100',role:'coach'},
  data:{clients:[{id:CLIENT}],
   sessionExecutions:[{id:ID,client_id:CLIENT,session_id:SESSION,revision:2,
    execution_status:'activa',summary:structuredClone(body),
    updated_at:'2026-10-28T20:00:00.000Z'}],
   m26Entities:[{entityType:'session_execution',entityId:ID,clientId:CLIENT,
    revision:2,status:'en_curso',body:structuredClone(body),
    updatedAt:'2026-10-28T20:00:00.000Z'}]},
  remoteRevisions:{['session_execution:'+ID]:2}};
}
test('exact duplicate compacts and reconstructs complete summary, with no record lost',()=>{
 const src=fixture(),compact=compactQaCanonicalExecutionSummaries(src);
 assert.deepEqual(compact.data.sessionExecutions[0].summary,{[REF]:ID});
 assertProductionSnapshot(compact);
 assert.deepEqual(expandQaCanonicalExecutionSummaries(compact),src);
 assert.equal(src.data.sessionExecutions[0].summary.progressSnapshot.notes,'kept');
 const vm=stateFromBootstrap(compact);
 const execution=vm.collections.sessionExecutions.find(x=>x.id===ID);
 assert.deepEqual(execution.body.progressSnapshot,src.data.sessionExecutions[0].summary.progressSnapshot);
});
test('existing 20MB guard remains: verified duplicate is reversible',()=>{
 const original=fixture('z'.repeat(10_600_000));
 assert.throws(()=>assertProductionSnapshot(original),/M26_BOOTSTRAP_TOO_LARGE/);
 const compact=compactQaCanonicalExecutionSummaries(original);
 assertProductionSnapshot(compact);
 assert.deepEqual(expandQaCanonicalExecutionSummaries(compact).data.sessionExecutions,
   original.data.sessionExecutions);
});
test('different content, owner or revision is never compressed',()=>{
 for(const mutate of [
  x=>{x.data.m26Entities=[];},
  x=>{x.data.m26Entities[0].clientId=SESSION;},
  x=>{x.data.m26Entities[0].revision=1;},
  x=>{x.data.m26Entities[0].body.progressSnapshot.notes='different';},
  x=>{x.data.sessionExecutions[0].client_id=SESSION;},
  x=>{x.data.sessionExecutions[0].session_id=ID;},
 ]){
  const data=fixture();mutate(data);
  assert.deepEqual(compactQaCanonicalExecutionSummaries(data),data);
 }
});
test('tampered reference fails closed across owners, environments and revisions',()=>{
 for(const mutate of [
  x=>{x.environment='PROD';},
  x=>{x.user.role='client';},
  x=>{x.data.m26Entities=[];},
  x=>{x.data.m26Entities[0].revision=1;},
  x=>{x.data.m26Entities[0].body.clientId=SESSION;},
  x=>{x.data.sessionExecutions[0].summary[REF]=CLIENT;},
  x=>{x.data.sessionExecutions[0].summary.extra=true;},
 ]){
  const compact=compactQaCanonicalExecutionSummaries(fixture());
  mutate(compact);
  assert.throws(()=>expandQaCanonicalExecutionSummaries(compact),/U48_QA_CANONICAL_SUMMARY_/);
 }
});
test('actual hydratePass environment object preserves exact QA Coach reconstruction and CAS',()=>{
 const source=fixture();
 const compact=compactQaCanonicalExecutionSummaries(source);
 const enriched={...compact,environment:{mode:'QA',commandRegistry:[],rc39:{},backendV43:{}},
  user:{...compact.user,authorizedRoles:['coach'],roleChoiceConfirmed:true}};
 assert.deepEqual(expandQaCanonicalExecutionSummaries(enriched).data.sessionExecutions,
  source.data.sessionExecutions);
 const vm=stateFromBootstrap(enriched);
 const execution=vm.collections.sessionExecutions.find(e=>e.id===ID);
 assert.deepEqual(execution.body,source.data.sessionExecutions[0].summary);
 assert.equal(vm.remoteRevisions['session_execution:'+ID],2);
});
test('object-shaped unauthorized environments fail closed despite valid reference',()=>{
 for(const modify of [
  s=>{s.environment={mode:'PROD'};},
  s=>{s.environment={mode:'SYNTHETIC_ONLY'};},
  s=>{s.environment={name:'QA'};},
  s=>{s.environment={mode:'QA'};s.canary.scope='public';},
  s=>{s.environment={mode:'QA'};s.user.role='client';},
 ]){
  const compact=compactQaCanonicalExecutionSummaries(fixture());
  modify(compact);
  assert.throws(()=>expandQaCanonicalExecutionSummaries(compact),
   /U48_QA_CANONICAL_SUMMARY_REF_INVALID/);
 }
});
test('no QA-specific compression in PROD or Client',()=>{
 for(const change of [
  x=>{x.environment='PROD';x.canary.active=false;},
  x=>{x.user.role='client';},
 ]){
  const x=fixture();change(x);
  assert.strictEqual(compactQaCanonicalExecutionSummaries(x),x);
  assert.strictEqual(expandQaCanonicalExecutionSummaries(x),x);
 }
});
