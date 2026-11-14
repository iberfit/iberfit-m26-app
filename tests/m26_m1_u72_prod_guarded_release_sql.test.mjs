import {materializeU72ProductionSql} from '../scripts/release/materialize_u72_prod_sql.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../supabase/release-procedures/'+name,import.meta.url),'utf8');
const install=materializeU72ProductionSql('install');
const rollback=materializeU72ProductionSql('rollback');
const on=read('20261112_m1_u60_prod_guarded_enable.sql');
const off=read('20261112_m1_u60_prod_guarded_disable.sql');
test('M1 U72 production install is exact-source, closed by default and rollbackable',()=>{
 assert.match(install,/M1_U72_PROD_ENVIRONMENT_DENIED/u);
 assert.match(install,/M1_U72_PROD_MUST_BE_CLOSED_AND_DRAINED/u);
 assert.match(install,/M1_U72_PROD_EXECUTION_FENCE_MISSING/u);
 assert.match(install,/M1_U72_PROD_AUTH_ACL_DRIFT/u);
 for(const sql of [install,rollback]){
  assert.doesNotMatch(sql,/has_function_privilege\('PUBLIC'/u,
    'PUBLIC is an ACL grantee, not a Postgres role name');
  assert.match(sql,/aclexplode\(coalesce\(p\.proacl,acldefault\('f',p\.proowner\)\)\)/u);
  assert.match(sql,/acl\.grantee=0 AND acl\.privilege_type='EXECUTE'/u);
 }
 for(const hash of ['5914acf371015a6bbeeaf95f99e056e3','35862b8e4977fcf0c3d611937fe83126','f97d7df4fdd510b63ac1249352273927'])
  assert.ok(install.includes(hash));
 for(const hash of ['1270cf1db8c9a162ccc5736207a258e1','944aaac897289954a9c589292d8faf87','dd1027122e0843b44529cf87dad746b5','65e675f56c67aa8f9ddc4b36f3a9a73d']){
  assert.ok(install.includes(hash));
  assert.ok(rollback.includes(hash));
 }
 assert.match(install,/REVOKE ALL ON FUNCTION private\.iberfit_u72_occurrence_pause_resume_v1/u);
 assert.match(install,/to_regprocedure\('private\.iberfit_u72_occurrence_pause_resume_v1/u);
 assert.match(rollback,/DROP FUNCTION private\.iberfit_u72_occurrence_pause_resume_v1/u);
 assert.match(rollback,/M1_U72_PROD_ROLLBACK_STATE_INVALID/u);
 assert.doesNotMatch(install,/\bDELETE\s+FROM\s+(?:public|auth)\b|\bTRUNCATE\b|\bDROP\s+TABLE\b/iu);
 assert.doesNotMatch(rollback,/\bDELETE\s+FROM\s+(?:public|auth)\b|\bTRUNCATE\b|\bDROP\s+TABLE\b/iu);
});
test('U60 PROD grants require upgraded gateway, no direct private U72 access',()=>{
 for(const sql of [on,off]){
  assert.match(sql,/944aaac897289954a9c589292d8faf87/u);
  assert.doesNotMatch(sql,/5914acf371015a6bbeeaf95f99e056e3/u);
  assert.match(sql,/training_session_occurrences_v1/u);
 }
 assert.match(on,/GRANT EXECUTE ON FUNCTION public\.iberfit_occurrence_api_u60_v1/u);
 assert.doesNotMatch(on,/GRANT EXECUTE ON FUNCTION private\./u);
 assert.match(off,/REVOKE EXECUTE ON FUNCTION public\.iberfit_occurrence_api_u60_v1/u);
});
