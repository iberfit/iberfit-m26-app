import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const root='supabase/qa-';
const migration=read(root+'migrations/20261118015500_p0_free_completed_session_scalar_fast_v1.sql');
const rollback=read(root+'rollbacks/20261118015500_p0_free_completed_session_scalar_fast_v1.rollback.sql');
const enable=read(root+'rollouts/20261118015500_p0_free_completed_session_scalar_fast_v1.enable.sql');
const disable=read(root+'rollouts/20261118015500_p0_free_completed_session_scalar_fast_v1.disable.sql');
const prior='25c8ff090b162f23fd818d12e8eb9843',after='edeb0f40727e033ff0f85721fd6f7b93';
const outerPrior='9c83765e0a36b0144fde2dca4a0cdcba',outerAfter='004eadbeb59ef8e45a74327ce3b66aba';
test('QA-only fast scalar sanitizer is hash-pinned reversible and exactly scoped',()=>{
 for(const script of [migration,rollback]){
  assert.match(script,/IS DISTINCT FROM 'QA'/u);
  assert.match(script,/P0_QA_SCALAR_ANCHOR_NOT_UNIQUE/u);
  assert.match(script,/P0_QA_SCALAR_CANDIDATE_HASH_MISMATCH/u);
  assert.match(script,/P0_QA_SCALAR_POST_DDL_SECURITY_DRIFT/u);
  assert.match(script,/proacl/u);
  assert.match(script,/proowner/u);
  assert.match(script,/proconfig/u);
  assert.match(script,/prosecdef/u);
  assert.match(script,/provolatile/u);
  assert.match(script,/public.iberfit_bootstrap_v26_rc29/u);
  assert.match(script,/public.iberfit_bootstrap_v26\(\)/u);
  assert.match(script,/P0 #1209/u);
  assert.doesNotMatch(script,/\b(?:GRANT|REVOKE|TRUNCATE|DROP TABLE|DELETE FROM public\.domain_entities_v26|UPDATE public\.domain_entities_v26)\b/iu);
  assert.doesNotMatch(script,/pjhmrhejsoofmouedavw|SUPABASE_SERVICE_ROLE_KEY/iu);
 }
 assert.ok(migration.includes(prior)&&migration.includes(after));
 assert.ok(migration.includes(outerPrior)&&migration.includes(outerAfter));
 assert.ok(rollback.includes(prior)&&rollback.includes(after));
 assert.ok(rollback.includes(outerPrior)&&rollback.includes(outerAfter));
});
test('full sanitizer remains fail-closed fallback and latest 12 completed sessions retain all blocks',()=>{
 assert.match(migration,/v_fast_completed_session_scalar := v_defer_completed_blocks/u);
 assert.match(migration,/v_fast_completed_session_scalar then/u);
 assert.match(migration,/else public\.iberfit_m43_client_safe_session_v2\(/u);
 assert.match(migration,/v_keep_completed_sessions/u);
 assert.match(migration,/free_client_completed_session_scalar_fast_v1/u);
 assert.match(migration,/client_completed_history_page_free_v1/u);
 assert.match(migration,/2c0f16829cd8731af964f107969f025a/u);
 assert.match(migration,/34df411a2b9ce5b60635d6db84ecd240/u);
 assert.match(migration,/a254291ca0e199d176b10aefa8b2fd61/u);
 const keys=['id','clientId','cycleId','appointmentId','title','objective','summary',
   'durationMinutes','deliveryModality','deliveryOwnership','clientVisibilityLevel',
   'status','visibleToClient','createdAt','updatedAt','publishedAt','enabledAt','startedAt',
   'completedAt','revision','publishedRevision','startDate','endDate','autoEnabledAfterPublish'];
 for(const k of keys)assert.ok(migration.includes("'"+k+"'"),k);
});
test('rollout is off until explicit QA-only guarded enable, independent and reversible',()=>{
 for(const x of [enable,disable]){
  assert.match(x,/IS DISTINCT FROM 'QA'/u);
  assert.doesNotMatch(x,/pjhmrhejsoofmouedavw|PROD|SUPABASE_SERVICE_ROLE_KEY/u);
 }
 assert.ok(enable.includes(after)&&enable.includes(outerAfter));
 assert.match(enable,/ON CONFLICT\(key\) DO UPDATE SET value=EXCLUDED\.value/u);
 assert.match(enable,/free_client_completed_history_demand_qa/u);
 assert.match(disable,/value='false'::jsonb/u);
 assert.doesNotMatch(disable,/CREATE OR REPLACE FUNCTION/u);
});
