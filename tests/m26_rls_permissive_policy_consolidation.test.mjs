import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(
  new URL('../supabase/migrations/20260911135900_rls_permissive_policy_consolidation_v1.sql',import.meta.url),
  'utf8',
);

test('duplicate INSERT policies are consolidated with explicit OR semantics',()=>{
  assert.match(source,/profiles_insert_authorized/);
  assert.match(source,/client_timeline_insert_authorized/);
  assert.match(source,/clients_insert_authorized/);
  assert.match(source,/is_assigned_coach\(client_id\)[\s\S]*or[\s\S]*iberfit_role/i);
  assert.match(source,/iberfit_current_role\(\)[\s\S]*=\s*'admin'[\s\S]*or[\s\S]*iberfit_role\(\)[\s\S]*=\s*'coach'/i);
});

test('ALL write policies are split so SELECT has one permissive policy',()=>{
  for(const oldName of [
    'm26_measurements_write_v43',
    'm26_plans_write_v43',
    'm26_sessions_write_v43',
  ]){
    assert.match(source,new RegExp(`drop policy if exists ${oldName}`,'i'));
  }
  for(const stem of ['measurements','plans','sessions']){
    assert.match(source,new RegExp(`m26_${stem}_insert_v43`,'i'));
    assert.match(source,new RegExp(`m26_${stem}_update_v43`,'i'));
    assert.match(source,new RegExp(`m26_${stem}_delete_v43`,'i'));
  }
});

test('write checks preserve actor ownership and coach/client scope',()=>{
  assert.match(source,/created_by = \(select auth\.uid\(\)\)/i);
  assert.match(source,/public\.is_assigned_coach\(client_id\)/i);
  assert.match(source,/client_id = public\.iberfit_client_id\(\)/i);
});

test('migration fails closed if duplicate permissive policies remain',()=>{
  assert.match(source,/pg_catalog\.pg_policies/i);
  assert.match(source,/having count\(\*\)>1/i);
  assert.match(source,/IBERFIT_MULTIPLE_PERMISSIVE_POLICIES_REMAIN/i);
});
