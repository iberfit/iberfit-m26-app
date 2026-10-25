import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20261025223000_signature_u33_private_role_calendar_projection_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/rollbacks/20261025223000_signature_u33_private_role_calendar_projection_v1.rollback.sql',import.meta.url),'utf8');
const qa=readFileSync(new URL('../qa/sql/signature_u33_role_calendar_projection_rollback_probe.sql',import.meta.url),'utf8');

test('U33: private paginated role-scoped calendar projection has no API grants',()=>{
  assert.match(migration,/CREATE FUNCTION private\.iberfit_u33_occurrence_calendar_v1/u);
  assert.match(migration,/STABLE SECURITY DEFINER SET search_path TO ''/u);
  assert.match(migration,/v_role NOT IN \('coach','cliente'\)/u);
  assert.match(migration,/public\.iberfit_can_access_client_v26\(p_client_id\)/u);
  assert.match(migration,/public\.iberfit_canary_enabled_v26\(p_client_id\)/u);
  assert.match(migration,/REVOKE ALL ON FUNCTION private\.iberfit_u33_occurrence_calendar_v1/u);
  assert.doesNotMatch(migration,/\bGRANT EXECUTE\b|CREATE OR REPLACE FUNCTION public\./iu);
});
test('U33: clients cannot view unconfirmed or unlinked occurrences, source snapshots remain private',()=>{
  assert.match(migration,/o\.status IN \('confirmada','en_curso','completada','cancelada'\)/u);
  assert.match(migration,/ap\.id IS NOT NULL/u);
  assert.match(migration,/source\.status='disponible'/u);
  assert.match(migration,/source\.body->>'visibleToClient'='true'/u);
  assert.match(migration,/LIMIT p_limit \+ 1/u);
  assert.match(migration,/\(o\.local_date,o\.id\)>\(p_after_date,p_after_id\)/u);
  assert.doesNotMatch(migration,/jsonb_build_object\([\s\S]*?'prescriptionSnapshot',|jsonb_build_object\([\s\S]*?'publishedSnapshot',/u);
  assert.match(qa,/U33_QA_CLIENT_SAW_UNCONFIRMED_DRAFT/u);
  assert.match(qa,/U33_QA_CLIENT_CROSS_SCOPE_ALLOWED/u);
  assert.match(qa,/U33_QA_CURSOR_NEXT_FAILED/u);
  assert.match(qa,/U33_QA_ADMIN_ALLOWED_WITHOUT_POLICY/u);
});
test('U33: rollback only removes private projection, never training data',()=>{
  assert.match(rollback,/DROP FUNCTION IF EXISTS private\.iberfit_u33_occurrence_calendar_v1/u);
  assert.doesNotMatch(rollback,/DROP TABLE|DELETE FROM|TRUNCATE|DROP POLICY/iu);
});
