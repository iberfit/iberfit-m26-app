import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/qa-migrations/20261110163500_p0_qa_bootstrap_sanitized_projection_reuse.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261110163500_p0_qa_bootstrap_sanitized_projection_reuse.rollback.sql',import.meta.url),'utf8');
const stripComments=s=>s.replace(/^--.*$/gm,'');
const body=stripComments(migration);

test('P0 QA bootstrap optimization is source-pinned to the exact old function',()=>{
  assert.match(body,/63314af30e0e38682a84991847a9d97e/);
  assert.match(body,/iberfit_system_settings/);
  assert.match(body,/value#>>'\\{\\}'='QA'/);
  assert.match(body,/public\\.iberfit_bootstrap_v26\\(\\)/);
  assert.match(body,/STABLE SECURITY DEFINER/);
  assert.match(body,/SET search_path TO ''/);
});
test('P0 fast path cannot touch normal clients, admins or PROD and retains original sanitizer fallback',()=>{
  assert.match(body,/qa\\.rc74\\.client-a@iberfit\\.cl/);
  assert.match(body,/qa\\.rc74\\.client-b@iberfit\\.cl/);
  assert.match(body,/if NOT \\(/);
  assert.match(body,/v_payload:=jsonb_set\\(v_payload,'\\{data,m26Entities\\}'/);
  for(const f of ['iberfit_bootstrap_v26_rc29','iberfit_bootstrap_v26_pre_v65e','iberfit_bootstrap_v26_pre_person_service_v1','iberfit_m43_client_safe_execution_v1','iberfit_m43_client_safe_session_v2','iberfit_m43_client_safe_plan_v2','iberfit_m43_client_scalar_fields_v1','iberfit_m43_client_safe_block_v2'])assert.ok(body.includes("pg_get_functiondef('public."+f));
  assert.match(body,/v_payload:=jsonb_set\\(v_payload,'\\{data,sessionExecutions\\}'/);
});
test('P0 is ACL/schema/data inert and rollback restores full sanitizer exactly',()=>{
  const both=[body,stripComments(rollback)].join('\\n');
  assert.doesNotMatch(both,/\\b(?:GRANT|REVOKE|INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER TABLE)\\b/i);
  assert.match(rollback,/9b0a3c67c0bc24b3877836dbc0f36235/);
  assert.match(rollback,/63314af30e0e38682a84991847a9d97e|CREATE OR REPLACE FUNCTION public\\.iberfit_bootstrap_v26/);
  assert.doesNotMatch(stripComments(rollback),/if NOT \\(/);
});
