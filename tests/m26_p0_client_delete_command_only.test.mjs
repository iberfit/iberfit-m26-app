import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20261107142000_p0_client_delete_command_only_acl.sql',import.meta.url),
  'utf8',
);
const gate = await readFile(
  new URL('../scripts/remote-gates/qa_client_delete_acl_denial.mjs',import.meta.url),
  'utf8',
);
const workflow = await readFile(
  new URL('../.github/workflows/qa-real-write-cert.yml',import.meta.url),
  'utf8',
);
const executable=migration.replace(/--[^\n]*/gu,'').replace(/\s+/gu,' ');

test('P0 closes direct DELETE through ACL and adds an independent restrictive deny policy',()=>{
  assert.match(executable,/REVOKE DELETE ON TABLE public\.clients FROM PUBLIC,\s*anon,\s*authenticated/i);
  assert.match(executable,/CREATE POLICY clients_direct_delete_deny_v1\s+ON public\.clients AS RESTRICTIVE FOR DELETE\s+TO authenticated USING \(false\)/i);
  assert.doesNotMatch(executable,/DROP\s+POLICY/i);
  assert.match(executable,/NOT pg_catalog\.has_table_privilege\('anon','public\.clients','DELETE'\)/i);
  assert.match(executable,/NOT pg_catalog\.has_table_privilege\('authenticated','public\.clients','DELETE'\)/i);
  assert.match(executable,/permissive='RESTRICTIVE'/i);
  assert.match(executable,/IN \('false','\(false\)'\)/i);
});

test('P0 preserves privileged deletion, non-destructive reads and service-role contract',()=>{
  assert.match(executable,/to_regprocedure\('public\.iberfit_admin_delete_client_v26\(jsonb,jsonb\)'\)/i);
  assert.match(executable,/p\.prosecdef/);
  assert.match(executable,/to_regprocedure\('public\.iberfit_admin_execute_v14\(jsonb\)'\)/i);
  assert.match(executable,/has_function_privilege\(\s*'service_role'/i);
  assert.match(executable,/has_table_privilege\('service_role','public\.clients','DELETE'\)/i);
  assert.match(executable,/has_table_privilege\('authenticated','public\.clients','SELECT'\)/i);
  assert.doesNotMatch(executable,/\b(?:UPDATE|DELETE FROM|INSERT INTO|TRUNCATE)\s+public\.clients\b/i);
  assert.doesNotMatch(executable,/\bALTER\s+TABLE\b|\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(executable,/\bCASCADE\b/i);
});

test('QA negative gate is constrained to a non-existing synthetic ID and project QA',()=>{
  assert.match(gate,/gjztkdwfmunnzhtvxrsu/);
  assert.match(gate,/M26_QA_ONLY/);
  assert.match(gate,/00000000-0000-0000-0000-000000000000/);
  assert.match(gate,/status\s*!==\s*403/);
  assert.match(gate,/42501/);
  assert.match(gate,/roleName/);
  assert.doesNotMatch(gate,/pjhmrhejsoofmouedavw|service[_-]?role/iu);
});

test('real authenticated Coach and Client QA denial runs in the existing consolidated gate',()=>{
  assert.match(workflow,/Verify P0 client deletion is denied by database ACL/u);
  assert.match(workflow,/node scripts\/remote-gates\/qa_client_delete_acl_denial\.mjs/u);
  assert.match(workflow,/M26_QA_COACH_EMAIL/);
  assert.match(workflow,/M26_QA_CLIENT_A_EMAIL/);
  assert.match(workflow,/m26-canary-readonly/);
});
