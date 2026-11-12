import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../supabase/release-procedures/',import.meta.url);
const enable=readFileSync(new URL('20261112_m1_u60_prod_guarded_enable.sql',root),'utf8');
const disable=readFileSync(new URL('20261112_m1_u60_prod_guarded_disable.sql',root),'utf8');
const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');

test('M1 U60 is explicitly staged and requires source parity, PostgreSQL fences and M44 before rollout',()=>{
 assert.ok(enable.includes('STAGED, NOT APPLIED'));
 for(const expected of [
  'PRODUCTION','real_data_allowed','production_blocked',
  'supabase_migrations.schema_migrations','u60_dated_execution_update_receipt',
  'u60_typed_execution_fence','pg_get_userbyid','search_path=""',
  'md5(pg_get_functiondef','has_table_privilege','relrowsecurity',
  'U60_PROD_SOURCE_ACL_DRIFT','U60_PROD_ENVIRONMENT_NOT_CERTIFIED',
  'U60_PROD_POST_GRANT_VERIFICATION_FAILED',
  'recent M44 PostgreSQL+Storage restore','exact-SHA authenticated Coach/Client/Coach QA',
 ])assert.ok(enable.includes(expected),'missing prerequisite '+expected);
 assert.ok(enable.includes('BEGIN;')&&enable.includes('COMMIT;'));
 assert.doesNotMatch(enable,/INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE/u);
});

test('M1 U60 production grants exactly two authenticated functions, not raw U36/tables/anon',()=>{
 const grantLines=enable.split('\n').filter(x=>x.startsWith('GRANT EXECUTE ON FUNCTION '));
 assert.deepEqual(grantLines,[
  'GRANT EXECUTE ON FUNCTION public.iberfit_occurrence_api_u60_v1(text,jsonb)',
  'GRANT EXECUTE ON FUNCTION public.iberfit_occurrence_detail_v1(uuid,uuid)',
 ]);
 assert.equal(enable.split('\n').filter(x=>x.trim()==='TO authenticated;').length,2);
 assert.doesNotMatch(enable,/^GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON/mu);
 assert.ok(enable.includes("has_function_privilege('anon'"));
 for(const name of ['public.iberfit_occurrence_api_u60_v1(text,jsonb)',
    'public.iberfit_occurrence_detail_v1(uuid,uuid)']){
  assert.ok(enable.includes(name),'missing grant '+name);
  assert.ok(disable.includes(name),'missing rollback '+name);
  assert.ok(disable.includes('REVOKE EXECUTE ON FUNCTION '+name));
 }
 assert.doesNotMatch(disable,/DROP TABLE|DELETE FROM|TRUNCATE|REVOKE SELECT ON TABLE/u);
});

test('M1 activation remains non-live, production SQL has no user targeting and is never auto-run',()=>{
 assert.ok(app.includes('runtime.qaOnly===true&&runtime.canary===true'));
 assert.ok(app.includes("runtime.projectRef==='gjztkdwfmunnzhtvxrsu'"));
 assert.ok(app.includes('createDatedOccurrenceQaUi'));
 assert.doesNotMatch(enable,/qa\.rc74\.|clientId\s*=|client_id\s*=/iu);
 const workflow=readFileSync(new URL('../.github/workflows/production-promote.yml',import.meta.url),'utf8');
 assert.doesNotMatch(workflow,/m1_u60_prod_guarded_enable|20261112_m1_u60_prod_guarded_enable/u);
});

test('U60 rollback stops before revocation if any dated workout remains active',()=>{
 assert.ok(disable.includes("status='en_curso'"));
 assert.match(disable,/LOCK TABLE public\.training_session_occurrences_v1\s+IN SHARE ROW EXCLUSIVE MODE NOWAIT/u);
 assert.ok(disable.indexOf('LOCK TABLE public.training_session_occurrences_v1')
   <disable.indexOf("status='en_curso'"),
   'the rollback must serialize against new starts BEFORE checking active rows');
 assert.ok(disable.includes('U60_ROLLBACK_ACTIVE_TRAINING_FORBIDDEN'));
 assert.ok(disable.indexOf('U60_ROLLBACK_ACTIVE_TRAINING_FORBIDDEN') <
   disable.indexOf('REVOKE EXECUTE ON FUNCTION'),
   'the active-workout guard must precede both revocations');
 assert.doesNotMatch(disable,/DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE|UPDATE public\./u);
});
