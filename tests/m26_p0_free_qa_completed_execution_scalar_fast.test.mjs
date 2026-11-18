import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const n='20261118032000_p0_free_completed_execution_scalar_fast_v1';
const read=(part,suffix)=>readFileSync('supabase/qa-'+part+'/'+n+'.'+suffix,'utf8');
const migration=read('migrations','sql'),rollback=read('rollbacks','rollback.sql'),
 enable=read('rollouts','enable.sql'),disable=read('rollouts','disable.sql');
test('P0 execution projection is QA-only hash-pinned and reverses without permission drift',()=>{
 for(const s of [migration,rollback]){
  for(const v of ["IS DISTINCT FROM 'QA'",'P0_QA_EXEC_SOURCE_DRIFT',
   'P0_QA_EXEC_ANCHOR_NOT_UNIQUE','P0_QA_EXEC_CANDIDATE_HASH_MISMATCH',
   'P0_QA_EXEC_POST_DDL_SECURITY_DRIFT','proacl','proowner','proconfig',
   'prosecdef','provolatile','search_path=""','edeb0f40727e033ff0f85721fd6f7b93','2dd44be13127df848e335c33febfd183','004eadbeb59ef8e45a74327ce3b66aba','e460264e965db3688709101bc30e10fa'])
   assert.ok(s.includes(v),v);
  assert.doesNotMatch(s,/\b(?:GRANT|REVOKE|TRUNCATE|DROP TABLE|DELETE FROM public\.domain_entities_v26)\b/iu);
  assert.doesNotMatch(s,/pjhmrhejsoofmouedavw|SUPABASE_SERVICE_ROLE_KEY/u);
 }
});
test('completed executions retain full original fallback, visibility and scalar fields',()=>{
 for(const v of ['v_fast_completed_execution_scalar := v_defer_completed_execution_details',
  'v_fast_completed_execution_scalar then','else public.iberfit_m43_client_safe_execution_v1(',
  'v_newrc:=replace(replace(replace(v_rc,v_d,v_e),v_h,v_i),v_a,v_b);',
  '29f09c54467ac50aaa91bce79ebe5680','34df411a2b9ce5b60635d6db84ecd240',
  'a254291ca0e199d176b10aefa8b2fd61','remoteConfirmedAt','currentSetIndex',
  'planSnapshot','sourceSnapshot','feedback','results'])assert.ok(migration.includes(v),v);
});
test('opt-in only after QA preflight and independent kill switch',()=>{
 assert.doesNotMatch(migration,/INSERT INTO public\.iberfit_system_settings/u);
 assert.match(enable,/ON CONFLICT\(key\) DO UPDATE SET value=EXCLUDED\.value/u);
 assert.ok(enable.includes("IS DISTINCT FROM 'QA'"));
 assert.ok(disable.includes("value='false'::jsonb"));
 assert.doesNotMatch(disable,/CREATE OR REPLACE FUNCTION|GRANT|REVOKE/u);
});
