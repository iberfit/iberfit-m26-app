import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20261025203500_signature_u32_private_coach_occurrence_batch_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/rollbacks/20261025203500_signature_u32_private_coach_occurrence_batch_v1.rollback.sql',import.meta.url),'utf8');
const qa=readFileSync(new URL('../qa/sql/signature_u32_coach_batch_rollback_probe.sql',import.meta.url),'utf8');

test('U32: Coach can only schedule from authorized, published, server-owned source and cycle',()=>{
  assert.match(migration,/CREATE FUNCTION private\.iberfit_u32_create_occurrences_batch_v1\(p_command jsonb\)/u);
  assert.match(migration,/v_role<>'coach' OR NOT public\.iberfit_can_access_client_v26\(v_client\)/u);
  assert.match(migration,/public\.iberfit_canary_enabled_v26\(v_client\)/u);
  assert.match(migration,/v_source\.status<>'disponible'/u);
  assert.match(migration,/v_source\.body->>'deliveryModality'<>'guiada_en_app'/u);
  assert.match(migration,/p\.body->>'endDate'|v_plan\.body->>'endDate'/u);
  assert.match(migration,/WHERE entity_type='planning' AND entity_id=v_plan_id/u);
  assert.match(migration,/v_payload - 'dates' - 'targetClientId' - 'previewConfirmed'/u);
  assert.match(migration,/v_snapshot:=jsonb_build_object\([\s\S]*?'queue',v_source\.body->'blocks'/u);
  assert.match(qa,/U32_UNTRUSTED_BLOCKS_ALLOWED/u);
  assert.match(qa,/U32_OTHER_CLIENT_ALLOWED/u);
  assert.match(qa,/U32_ADMIN_AS_COACH_ALLOWED/u);
});

test('U32: batch idempotency and all-or-none multi-date SQL',()=>{
  assert.match(migration,/pg_advisory_xact_lock\([\s\S]*?'schedule_client:'/u);
  assert.match(migration,/v_request_hash:=encode\(sha256\(convert_to\(p_command::text,'UTF8'\)\),'hex'\)/u);
  assert.match(migration,/v_receipt\.response->>'requestHash' IS DISTINCT FROM v_request_hash/u);
  assert.match(migration,/INSERT INTO public\.command_receipts_v26/u);
  assert.match(migration,/INSERT INTO public\.training_session_occurrences_v1/u);
  assert.match(migration,/created_operation_id[\s\S]*?gen_random_uuid\(\)\);/u);
  assert.match(qa,/U32_PARTIAL_BATCH_PERSISTED/u);
  assert.match(qa,/U32_MODIFIED_REPLAY_ALLOWED/u);
  assert.match(qa,/U32_EXPECTED_THREE_ROWS/u);
  assert.match(qa,/U32_SNAPSHOT_NOT_SERVER_OWNED/u);
});

test('U32: date validation accounts for Santiago DST gaps and duplicated times',()=>{
  assert.match(migration,/v_start:=v_clock AT TIME ZONE 'America\/Santiago'/u);
  assert.match(migration,/U32_DST_NONEXISTENT_LOCAL_TIME/u);
  assert.match(migration,/U32_DST_AMBIGUOUS_LOCAL_TIME/u);
  assert.match(migration,/v_disambiguation='earlier'/u);
  assert.match(migration,/U32_OUTSIDE_CYCLE/u);
  assert.match(migration,/v_time::time/u);
  assert.match(migration,/jsonb_array_length\(v_dates\) NOT BETWEEN 1 AND 52/u);
  assert.match(migration,/EXISTS\(SELECT 1 FROM public\.appointments ap/u);
  assert.match(migration,/EXISTS\(SELECT 1 FROM public\.training_session_occurrences_v1 oc/u);
  assert.match(qa,/U32_CLIENT_APPOINTMENT_CONFLICT_ALLOWED/u);
});

test('U32: database API stays closed; rollback cannot strand a historical batch',()=>{
  assert.match(migration,/SECURITY DEFINER\s+SET search_path TO ''/u);
  assert.match(migration,/REVOKE ALL ON FUNCTION private\.iberfit_u32_create_occurrences_batch_v1\(jsonb\)\s+FROM PUBLIC,anon,authenticated,service_role/u);
  assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.iberfit_execute_command_v26|\bGRANT EXECUTE\b|\bDROP TABLE\b/iu);
  assert.match(rollback,/u32_rollback_requires_no_batch_receipts/u);
  assert.doesNotMatch(rollback,/\bDELETE FROM\b|\bTRUNCATE\b|\bDROP TABLE\b|\bDROP COLUMN\b/iu);
  assert.match(qa,/U32_PRIVATE_EXECUTE_EXPOSED/u);
});
