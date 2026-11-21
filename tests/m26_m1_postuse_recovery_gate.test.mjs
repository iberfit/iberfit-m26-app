import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {certifyM1PostuseIntegrity,runLiveM1PostuseGate,SQL}
 from '../scripts/release/m1_postuse_recovery_gate.mjs';
const QA={report:{
 schema:'iberfit.m1.postuse.recovery.v1',environment:'QA',
 u72Installed:true,u60Authenticated:true,u60Anonymous:false,rls:true,
 counts:{total:52,autonomous_published:4,autonomous_completed:2,
 active:0,completed:26,missing_execution_id:0,execution_drift:0,
 dated_history:26,orphan_dated:0,active_locks:0}}};
const PROD={report:{...QA.report,environment:'PRODUCTION',
 u72Installed:false,u60Authenticated:false,
 counts:{...QA.report.counts,total:0,autonomous_published:0,autonomous_completed:0,
 active:0,completed:0,dated_history:0}}};
test('real QA history forces forward-only preservation, not rollback',()=>{
 const v=certifyM1PostuseIntegrity([QA],'QA');
 assert.equal(v.recoveryMode,'FORWARD_ONLY_PRESERVE_HISTORY');
 assert.equal(v.autonomousCompleted,2);
 assert.equal(v.productionMutationAuthorized,false);
 assert.equal(v.rollbackAuthorized,false);
 assert.equal(v.fullPlatformRecoveryCertified,false);
});
test('pre-use PROD baseline cannot auto-authorize rollback or PROD',()=>{
 const v=certifyM1PostuseIntegrity([PROD],'PRODUCTION');
 assert.equal(v.recoveryMode,'PRE_USE_CANDIDATE_ONLY');
 assert.equal(v.rollbackAuthorized,false);
});
test('every important corruption and security drift fails closed',()=>{
 for(const delta of [
  {counts:{execution_drift:1}},{counts:{orphan_dated:1}},
  {counts:{missing_execution_id:1}},{counts:{autonomous_published:53}},
  {counts:{autonomous_completed:5}},{counts:{dated_history:60}},
  {counts:{active:-1}},{counts:{total:Infinity}},{rls:false},
  {u60Anonymous:true},{u72Installed:false},{environment:'OTHER'}]){
  const r={...QA.report,...delta,
   counts:{...QA.report.counts,...(delta.counts||{})}};
  assert.throws(()=>certifyM1PostuseIntegrity([{report:r}],'QA'),/M1_POSTUSE_/u);
 }
 for(const data of [[],[QA,QA],{},[{report:{}}]])
  assert.throws(()=>certifyM1PostuseIntegrity(data,'QA'),/M1_POSTUSE_/u);
});
test('SQL is read-only, aggregate-only, no customer identifiers',()=>{
 assert.match(SQL,/^WITH x AS \(/mu);
 assert.match(SQL,/SELECT jsonb_build_object\(/u);
 assert.match(SQL,/domain_entities_v26/u);
 assert.match(SQL,/active_execution_locks_v26/u);
 assert.doesNotMatch(SQL,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|GRANT|REVOKE|CREATE|DROP)\b/iu);
 assert.doesNotMatch(SQL,/\b(?:email|password|refresh_token|phone)\b/iu);
});
test('live gate only hits the exact PROD read-only endpoint',async()=>{
 let seen;
 const fetcher=async(url,opts)=>{seen={url,opts};return {ok:true,json:async()=>[PROD]};};
 const v=await runLiveM1PostuseGate({token:'dummy-test-token-12345',fetcher});
 assert.equal(v.ok,true);
 assert.equal(seen.url,'https://api.supabase.com/v1/projects/pjhmrhejsoofmouedavw/database/query/read-only');
 assert.equal(seen.opts.redirect,'error');
 assert.equal(seen.opts.method,'POST');
 assert.deepEqual(JSON.parse(seen.opts.body),{query:SQL});
 await assert.rejects(()=>runLiveM1PostuseGate({token:'',fetcher}),/M1_POSTUSE_/u);
 await assert.rejects(()=>runLiveM1PostuseGate({token:'dummy-test-token-12345',
  project:'gjztkdwfmunnzhtvxrsu',fetcher}),/M1_POSTUSE_/u);
});
test('the CLI cannot execute outside protected release',()=>{
 const v=spawnSync(process.execPath,['scripts/release/m1_postuse_recovery_gate.mjs'],{
  timeout:3000,encoding:'utf8',
  env:{PATH:process.env.PATH,GITHUB_ACTIONS:'false',
   PROD_SUPABASE_REF:'pjhmrhejsoofmouedavw',U60_RELEASE_ACTIVE:'true'}});
 assert.notEqual(v.status,0);
 assert.match(v.stderr,/M1_POSTUSE_PROTECTED_RELEASE_CONTEXT_REQUIRED/u);
 assert.equal(v.stdout,'');
});

test('production active release runs the exact post-use audit before backup gate',()=>{
 const workflow=readFileSync('.github/workflows/production-promote.yml','utf8');
 const backend=workflow.indexOf('Certify independently active SQL U72 U60 Coach and Edge');
 const postuse=workflow.indexOf('Certify M1 post-use integrity and forward-only recovery boundary');
 const backup=workflow.indexOf('Certify recent recoverable recovery point for M44');
 assert.ok(backend>0&&postuse>backend&&backup>postuse);
 const area=workflow.slice(postuse,backup);
 assert.match(area,/env\.U60_RELEASE_ACTIVE == 'true'/u);
 assert.match(area,/node scripts\/release\/m1_postuse_recovery_gate\.mjs/u);
 assert.doesNotMatch(area,/supabase db push|apply_migration|GRANT EXECUTE/u);
});
