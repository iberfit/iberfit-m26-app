import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20261017220957_p0_rc29_client_internal_events_performance_qa_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/rollbacks/p0_rc29_client_internal_events_performance_v1.rollback.sql',import.meta.url),'utf8');
const withoutComments=(sql)=>sql.replace(/^\s*--[^\n]*$/gmu,'');

test('P0 bootstrap optimization is exact-baseline guarded and touches only rc29',()=>{
  assert.match(migration,/5c565986e5946e768cd84eb0398f76cb/u);
  assert.match(migration,/722040e7807a52a70339277014026833/u);
  assert.equal((migration.match(/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26_rc29\(\)/gu)||[]).length,1);
  assert.equal((migration.match(/CREATE OR REPLACE FUNCTION/gu)||[]).length,1);
  assert.match(migration,/STABLE SECURITY DEFINER/u);
  assert.match(migration,/SET search_path TO ''/u);
  assert.match(migration,/has_function_privilege\('authenticated',oid,'EXECUTE'\)/u);
  assert.match(migration,/has_function_privilege\('service_role',oid,'EXECUTE'\)/u);
  assert.doesNotMatch(withoutComments(migration),/\b(?:DO\s+\$|ALTER\s+ROLE|GRANT\s+|REVOKE\s+|DROP\s+|TRUNCATE\s+|DELETE\s+FROM|UPDATE\s+|INSERT\s+INTO|statement_timeout)\b/iu);
});
test('only Client skips internal domainEvents that the final HTTP projection already discards',()=>{
  const branch="'domainEvents',case when v_role in ('client','cliente') then '[]'::jsonb else coalesce((";
  assert.ok(migration.includes(branch));
  assert.match(migration,/from public\.domain_events_v26/iu);
  assert.match(migration,/e\.entity_type not in \('private_note','intelligence','report'\)/u);
  assert.match(migration,/e\.entity_type not in \('planning','session'\)/u);
  assert.match(migration,/e\.body->>'visibleToClient'/u);
  assert.match(migration,/v_role not in \('client','cliente'\)/u);
  assert.match(migration,/public\.iberfit_can_access_client_v26\(client_id\)/u);
  assert.match(migration,/then '\[\]'::jsonb else coalesce\(\(/u);
  assert.match(migration,/end,\s*'coachAvailability'/u);
  for(const field of ["'iriAssessments'","'reports'","'trainingCycles'","'sessions'","'appointments'","'sessionExecutions'","'m26Entities'","'remoteRevisions'"]){
    assert.ok(migration.includes(field),field+' must remain in canonical bootstrap');
  }
});
test('rollback restores exact previous event projection only from known optimized body',()=>{
  assert.match(rollback,/722040e7807a52a70339277014026833/u);
  assert.match(rollback,/74e56c70254ec7d42b0c17e223472cd0/u);
  assert.match(rollback,/5c565986e5946e768cd84eb0398f76cb/u);
  assert.match(rollback,/'domainEvents',coalesce\(\(/u);
  assert.doesNotMatch(rollback,/'domainEvents',case when v_role/iu);
  assert.match(rollback,/STABLE SECURITY DEFINER/u);
  assert.match(rollback,/SET search_path TO ''/u);
  assert.equal((rollback.match(/CREATE OR REPLACE FUNCTION/gu)||[]).length,1);
});
