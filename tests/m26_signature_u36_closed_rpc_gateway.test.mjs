import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=readFileSync(new URL('../supabase/migrations/20261025235500_signature_u36_closed_occurrence_rpc_gateway_v1.sql',import.meta.url),'utf8');
const r=readFileSync(new URL('../supabase/rollbacks/20261025235500_signature_u36_closed_occurrence_rpc_gateway_v1.rollback.sql',import.meta.url),'utf8');
const q=readFileSync(new URL('../qa/sql/signature_u36_closed_occurrence_gateway_rollback_probe.sql',import.meta.url),'utf8');
test('U36 public function is staging-only: no anonymous, authenticated or service execution grants',()=>{
  assert.match(m,/CREATE FUNCTION public\.iberfit_occurrence_api_v1/u);
  assert.match(m,/SECURITY DEFINER SET search_path TO ''/u);
  assert.match(m,/auth\.uid\(\)/u);
  assert.match(m,/REVOKE ALL ON FUNCTION public\.iberfit_occurrence_api_v1\(text,jsonb\)[\s\S]*?FROM PUBLIC,anon,authenticated,service_role/u);
  assert.doesNotMatch(m,/\bGRANT EXECUTE\b/u);
  assert.match(q,/U36_QA_PUBLIC_GRANT_DETECTED/u);
});
test('U36 router has a strict whitelist and passes ownership enforcement to audited U31-U34',()=>{
  assert.match(m,/NOT IN \('CALENDARIO','CREAR_LOTE','TRANSICION','CAMBIO'\)/u);
  assert.match(m,/U36_UNTRUSTED_CALENDAR_FILTER/u);
  assert.match(m,/private\.iberfit_u33_occurrence_calendar_v1\(/u);
  assert.match(m,/private\.iberfit_u32_create_occurrences_batch_v1\(/u);
  assert.match(m,/private\.iberfit_u31_occurrence_transition_v1\(/u);
  assert.match(m,/private\.iberfit_u34_coach_occurrence_change_v1\(/u);
  assert.match(q,/U36_QA_CROSS_CLIENT_ALLOWED/u);
  assert.match(q,/U36_QA_ADMIN_BYPASS/u);
  assert.match(q,/U36_QA_UNAUTHENTICATED_ALLOWED/u);
  assert.match(q,/U36_QA_UNLINKED_CLIENT_DRAFT_VISIBLE/u);
});
test('U36 rollback removes wrapper only and retains operations/data',()=>{
  assert.match(r,/DROP FUNCTION IF EXISTS public\.iberfit_occurrence_api_v1/u);
  assert.doesNotMatch(r,/DROP TABLE|DELETE FROM|TRUNCATE/u);
});
