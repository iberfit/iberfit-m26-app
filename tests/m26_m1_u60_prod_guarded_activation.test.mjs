import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../supabase/release-procedures/',import.meta.url);
const enable=readFileSync(new URL('20261112_m1_u60_prod_guarded_enable.sql',root),'utf8');
const disable=readFileSync(new URL('20261112_m1_u60_prod_guarded_disable.sql',root),'utf8');
const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');

test('M1 PROD U60 release is expressly staged and requires exact source, flags, data fences, backup',()=>{
 assert.match(enable,/STAGED, NOT APPLIED/u);
 for(const name of ['PRODUCTION','real_data_allowed','production_blocked',
  'supabase_migrations.schema_migrations','u60_dated_execution_update_receipt',
  'u60_typed_execution_fence','pg_get_userbyid','search_path=""',
  'md5\\(pg_get_functiondef','has_table_privilege','relrowsecurity',
  'U60_PROD_SOURCE_ACL_DRIFT','U60_PROD_ENVIRONMENT_NOT_CERTIFIED',
  'U60_PROD_POST_GRANT_VERIFICATION_FAILED']){
  assert.ok(enable.includes(name.replace('\\',''))||enable.includes(name),name);
 }
 assert.match(enable,/recent M44 PostgreSQL\+Storage restore/u);
 assert.match(enable,/exact-SHA authenticated Coach\/Client\/Coach QA/u);
 assert.match(enable,/BEGIN;[\s\S]*?COMMIT;/u);
 assert.doesNotMatch(enable,/INSERT INTO|UPDATE public\\.|DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE/u);
});

test('M1 U60 production grants exactly two authenticated functions, never raw U36, table or anon',()=>{
 const grants=[...enable.matchAll(/^GRANT EXECUTE ON FUNCTION ([^\\n]+)\\n  TO ([^;]+);/gmu)];
 assert.equal(grants.length,2);
 assert.deepEqual(grants.map(x=>x[1]),[
  'public.iberfit_occurrence_api_u60_v1(text,jsonb)',
  'public.iberfit_occurrence_detail_v1(uuid,uuid)',
 ]);
 assert.ok(grants.every(x=>x[2]==='authenticated'));
 assert.doesNotMatch(enable,/^GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON/mi);
 for(const signature of ['public.iberfit_occurrence_api_u60_v1(text,jsonb)',
  'public.iberfit_occurrence_detail_v1(uuid,uuid)']){
   assert.match(enable,new RegExp(signature.replace(/[().]/g,'\\$&'),'u'));
   assert.match(disable,new RegExp(signature.replace(/[().]/g,'\\$&'),'u'));
 }
 assert.match(enable,/has_function_privilege\\('anon'/u);
 assert.match(disable,/^REVOKE EXECUTE ON FUNCTION public\\.iberfit_occurrence_api_u60_v1/mu);
 assert.match(disable,/^REVOKE EXECUTE ON FUNCTION public\\.iberfit_occurrence_detail_v1/mu);
 assert.doesNotMatch(disable,/DROP TABLE|DELETE FROM|TRUNCATE|REVOKE SELECT ON TABLE/u);
});

test('M1 U60 remains non-live while staged SQL is reviewed: no user/client data or production runtime change',()=>{
 assert.match(app,/runtime\\.qaOnly===true&&runtime\\.canary===true/u);
 assert.match(app,/runtime\\.projectRef==='gjztkdwfmunnzhtvxrsu'/u);
 assert.match(app,/createDatedOccurrenceQaUi/u);
 assert.doesNotMatch(enable,/qa\\.rc74\\.|clientId\\s*=|client_id\\s*=/iu);
 const workflow=readFileSync(new URL('../.github/workflows/production-promote.yml',import.meta.url),'utf8');
 assert.doesNotMatch(workflow,/m1_u60_prod_guarded_enable|20261112_m1_u60_prod_guarded_enable/u);
});
