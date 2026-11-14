import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const stem='20261114130000_universal_completed_dated_history_qa';
const forward=readFileSync('supabase/qa-migrations/'+stem+'.sql','utf8');
const reverse=readFileSync('supabase/qa-rollbacks/'+stem+'.rollback.sql','utf8');
const original=readFileSync('supabase/qa-migrations/20261031062000_p0_free_qa_history_visibility_guard_v2.sql','utf8');
const oldParent="AND lower(COALESCE(s.status,s.body->>'status','')) IN ('completado','completada','completed')";
const newParent="AND lower(COALESCE(s.status,s.body->>'status','')) IN ('disponible','completado','completada','completed','cancelada','cancelado','cancelled')";
test('Universal dated history is QA-only, reversible, source-hash guarded, never DML',()=>{
  for(const sql of [forward,reverse]){
    assert.ok(sql.includes('iberfit_system_settings'));
    assert.ok(sql.includes("IS DISTINCT FROM 'QA'"),'unknown environment must fail closed');
    assert.ok(sql.includes('pg_get_functiondef'));
    assert.ok(sql.includes('UNIVERSAL_HISTORY_'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION'));
    assert.ok(sql.includes('FROM PUBLIC,anon'));
    assert.ok(sql.includes('TO authenticated'));
    assert.ok(!sql.includes('DELETE FROM')&&!sql.includes('TRUNCATE')&&!sql.includes('DROP TABLE'));
    assert.ok(!sql.includes('DISABLE ROW LEVEL SECURITY')&&!sql.includes('BYPASSRLS'));
    assert.ok(sql.includes('3a73617648b73eb472af6ce8e9c2ee8e'));
    assert.ok(sql.includes('ae01c1771319b99f0404612a4b84fd2a'));
  }
  assert.ok(forward.includes('free_client_completed_history_demand_qa'));
  assert.ok(forward.includes('EXECUTE replace(v_existing,v_previous,v_extended)'));
  assert.ok(reverse.includes('EXECUTE replace(v_function,v_extended,v_original)'));
});
test('exactly two safe parent-status predicates are changed, not identity, role, privacy or cursor',()=>{
  const originalFunction=original.slice(original.indexOf('CREATE OR REPLACE FUNCTION'));
  assert.equal(originalFunction.split(oldParent).length-1,2);
  assert.equal(originalFunction.includes(newParent),false);
  assert.equal(forward.split(oldParent).length-1,1);
  assert.equal(forward.split(newParent).length-1,1);
  assert.equal(reverse.split(oldParent).length-1,1);
  assert.equal(reverse.split(newParent).length-1,1);
  assert.ok(forward.includes('2*length(v_previous)'));
  assert.ok(reverse.includes('length(v_extended)*2'));
  for(const predicate of [
    'auth.uid() IS NULL',"v_role IS DISTINCT FROM 'cliente'",
    'v_client_id:=public.iberfit_client_id()', 'e.client_id=v_client_id',
    "s.client_id=e.client_id", "s.entity_id = (CASE",
    "s.body->>'clientVisibilityLevel'", "s.body->>'visibleToClient'",
    'FREE_HISTORY_REVISION_CHANGED','FREE_HISTORY_PAGE_TOO_LARGE',
    "INTERVAL '30 minutes'",
  ]) assert.ok(originalFunction.includes(predicate),predicate);
});
