import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const path=new URL('../qa/signature-u37/webauthn-gated-core-and-history.qa.sql',import.meta.url);
const sql=readFileSync(path,'utf8');
const preflight=readFileSync(new URL('../qa/signature-u37/verify-webauthn-rpc-roles.qa.sql',import.meta.url),'utf8');

test('U37 SQL is QA-only, baseline-pinned, append-only and migration-independent',()=>{
  assert.match(sql,/s\.value#>>'\{\}'='QA'/gu);
  for(const hash of [
    'ce0cbff2a99e28bff593132a350de595',
    '7416e0d52d6fa069cf467e95420d4034',
    'f7f30204f8e84e1d5c9fe43331b7f0c8',
    'aedea9df3d4986496626e10318628c41',
  ])assert.ok(sql.includes(hash),'pinned source signature');
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26\(\)/iu);
  assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDELETE\s+FROM\b|\bALTER\s+ROLE\b|\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/iu);
});

test('U37 both privileged RPCs re-enforce server role and actual WebAuthn verification',()=>{
  assert.equal((sql.match(/PERFORM public\.iberfit_require_privileged_assurance_v65d\(\)/giu)||[]).length,3);
  // One assertion is inherited from the original pre_person_service chain,
  // plus explicit enforcement at both exposed RPC entrypoints.
  assert.equal((sql.match(/v_role NOT IN \('coach','admin'\)/gu)||[]).length,2);
  assert.equal((sql.match(/v_assurance->>'iberfitAssurance' IS DISTINCT FROM 'verified'/gu)||[]).length,2);
  assert.equal((sql.match(/v_assurance->>'privileged'/gu)||[]).length,2);
  assert.equal((sql.match(/IF auth\.uid\(\) IS NULL THEN/gu)||[]).length>=2,true);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26_core_u37_qa\(\)/u);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.iberfit_privileged_history_page_u37_qa\(/u);
});

test('U37 keeps private SQL uncallable, only authenticated can EXECUTE QA wrappers',()=>{
  assert.equal((sql.match(/REVOKE ALL ON FUNCTION private\./gu)||[]).length,5);
  assert.equal((sql.match(/GRANT EXECUTE ON FUNCTION public\./gu)||[]).length,2);
  assert.equal((sql.match(/FROM PUBLIC,anon,authenticated,service_role;/gu)||[]).length,7);
  assert.doesNotMatch(sql,/TO anon|TO service_role|TO PUBLIC/iu);
  assert.match(preflight,/has_function_privilege\('anon','public\.iberfit_bootstrap_v26_core_u37_qa/iu);
  assert.match(preflight,/U37_CLIENT_CORE_ALLOWED/iu);
  assert.match(preflight,/U37_ANON_HISTORY_ALLOWED/iu);
});

test('U37 web-facing paging delegates to the validated U35 bounded and scoped implementation',()=>{
  for(const token of [
    'private.iberfit_history_page_internal_u37_qa',
    'public.iberfit_can_access_client_v26(p_client_id) is not true',
    'p_limit<1 or p_limit>32',
    'U35_HISTORY_SNAPSHOT_CHANGED_RESTART',
    'p_expected_count is not null and v_total<>p_expected_count',
    "'remoteRevisions',v_revisions",
  ])assert.ok(sql.includes(token),token);
  assert.doesNotMatch(sql,/\bEXECUTE\s+format\(/iu);
});
