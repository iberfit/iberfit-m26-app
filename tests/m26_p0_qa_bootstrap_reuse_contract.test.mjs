import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/qa-migrations/20261110163500_p0_qa_bootstrap_sanitized_projection_reuse.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261110163500_p0_qa_bootstrap_sanitized_projection_reuse.rollback.sql',import.meta.url),'utf8');
const body=migration.replace(/^--.*$/gm,'');
const undo=rollback.replace(/^--.*$/gm,'');

test('P0 QA migration requires the exact original source and environment',()=>{
  assert.ok(body.includes('63314af30e0e38682a84991847a9d97e'));
  assert.ok(body.includes("s.value#>>'{}'='QA'"));
  assert.ok(body.includes('CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26()'));
  assert.ok(body.includes('STABLE SECURITY DEFINER'));
  assert.ok(body.includes("SET search_path TO ''"));
});

test('QA-only synthetic optimization fails back to the original full sanitizer on drift',()=>{
  assert.ok(body.includes('qa.rc74.client-a@iberfit.cl'));
  assert.ok(body.includes('qa.rc74.client-b@iberfit.cl'));
  assert.ok(body.includes('if NOT ('));
  assert.ok(body.includes("v_payload:=jsonb_set(v_payload,'{data,m26Entities}'"));
  assert.ok(body.includes("v_payload:=jsonb_set(v_payload,'{data,sessionExecutions}'"));
  const pins=['iberfit_bootstrap_v26_rc29','iberfit_bootstrap_v26_pre_v65e',
    'iberfit_bootstrap_v26_pre_person_service_v1',
    'iberfit_m43_client_safe_execution_v1','iberfit_m43_client_safe_session_v2',
    'iberfit_m43_client_safe_plan_v2','iberfit_m43_client_scalar_fields_v1',
    'iberfit_m43_client_safe_block_v2'];
  for(const fn of pins)assert.ok(body.includes("pg_get_functiondef('public."+fn),fn);
});

test('rollback is QA-only source-pinned and restores the original full code',()=>{
  assert.ok(undo.includes('243c5df0f05cb35fffd3cf777a5932c5'));
  assert.ok(undo.includes("s.value#>>'{}'='QA'"));
  assert.ok(undo.includes('CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26()'));
  assert.ok(!undo.includes('if NOT ('));
  for(const s of [body,undo]){
    assert.doesNotMatch(s,/\b(?:GRANT|REVOKE|INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER TABLE)\b/i);
  }
});
