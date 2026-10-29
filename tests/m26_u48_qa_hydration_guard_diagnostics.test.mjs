import test from 'node:test';
import assert from 'node:assert/strict';
import {assertProductionSnapshot,stateFromBootstrap} from '../src/m26/production-state.js';

const ID='16145839-2e7d-48e2-bf0c-e94325f5c54c';
const CLIENT='57f56a87-d04e-47d5-b1cc-8d4939d7c804';
const SESSION='4d244c01-8966-40f1-8cc7-9e6ec46d1708';
const REF='__iberfitQaCanonicalExecutionSummaryRefV1';
function qaFixture(){
 return {
  environment:'QA',
  user:{id:'a0000000-0000-4000-8000-000000000100',role:'coach'},
  canary:{active:true,scope:'allowlist'},
  data:{clients:[{id:CLIENT}],m26Entities:[],domainEvents:[],
   sessionExecutions:[{id:ID,client_id:CLIENT,session_id:SESSION,
    revision:1,summary:{[REF]:ID}}]},
 };
}
function capture(run){
 const records=[];
 const previous=globalThis.__IBERFIT_M26_QA_STAGE__;
 globalThis.__IBERFIT_M26_QA_STAGE__=stage=>records.push(stage);
 try{run();}finally{globalThis.__IBERFIT_M26_QA_STAGE__=previous;}
 return records;
}
test('Guard reveals only QA Coach byte bucket and compact reference count',()=>{
 const stages=capture(()=>assertProductionSnapshot(qaFixture()));
 assert.ok(stages.includes('rc64-state-wire-refs-present'));
 assert.ok(stages.includes('rc64-state-wire-under16mb'));
 assert.ok(stages.every(s=>!s.includes(ID)&&!s.includes(CLIENT)&&!s.includes(SESSION)));
});
test('Invalid reconstruction is distinguishable from valid envelope without weakening privacy',()=>{
 const stages=capture(()=>assert.throws(
  ()=>stateFromBootstrap(qaFixture()),/U48_QA_CANONICAL_SUMMARY_LINEAGE_CONFLICT/));
 assert.ok(stages.includes('rc64-state-wire-validated'));
 assert.ok(stages.includes('rc64-state-rejected-lineage-conflict'));
 assert.ok(!stages.includes('rc64-state-reconstruction-validated'));
});
test('20MB oversize still fails closed, with a different diagnostic',()=>{
 const snapshot=qaFixture();
 snapshot.data.padding='a'.repeat(20_010_000);
 const stages=capture(()=>assert.throws(
  ()=>stateFromBootstrap(snapshot),/M26_BOOTSTRAP_TOO_LARGE/));
 assert.ok(stages.includes('rc64-state-rejected-too-large'));
 assert.ok(!stages.includes('rc64-state-wire-validated'));
});
test('No size diagnostics are exposed for production snapshots',()=>{
 const snapshot=qaFixture();snapshot.environment='PROD';snapshot.canary.active=false;
 const stages=capture(()=>assert.throws(()=>stateFromBootstrap(snapshot)));
 assert.ok(stages.every(s=>!s.startsWith('rc64-state-wire-over-limit')&&!s.startsWith('rc64-state-wire-under16mb')&&!s.startsWith('rc64-state-wire-16-to-18mb')&&!s.startsWith('rc64-state-wire-18-to-20mb')));
 assert.ok(stages.every(s=>!s.startsWith('rc64-state-wire-refs-')));
});
