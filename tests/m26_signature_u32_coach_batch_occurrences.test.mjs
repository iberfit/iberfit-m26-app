import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20261025203500_signature_u32_private_coach_occurrence_batch_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/rollbacks/20261025203500_signature_u32_private_coach_occurrence_batch_v1.rollback.sql',import.meta.url),'utf8');
const qa=readFileSync(new URL('../qa/sql/signature_u32_coach_batch_rollback_probe.sql',import.meta.url),'utf8');
const dstQa=readFileSync(new URL('../qa/sql/signature_u32_santiago_dst_rollback_probe.sql',import.meta.url),'utf8');
const fence=readFileSync(new URL('../supabase/migrations/20261025210500_signature_u32_legacy_appointment_writer_fence_v1.sql',import.meta.url),'utf8');
const fenceRollback=readFileSync(new URL('../supabase/rollbacks/20261025210500_signature_u32_legacy_appointment_writer_fence_v1.rollback.sql',import.meta.url),'utf8');
const fenceQa=readFileSync(new URL('../qa/sql/signature_u32_legacy_appointment_race_rollback_probe.sql',import.meta.url),'utf8');
const endToEndQa=readFileSync(new URL('../qa/sql/signature_u32_u31_real_published_three_dates_rollback_probe.sql',import.meta.url),'utf8');

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

test('U32: real QA exercises both Chile DST transitions and rebooking with history retained',()=>{
  assert.match(dstQa,/U32_DST_GAP_ACCEPTED/u);
  assert.match(dstQa,/U32_DST_FOLD_SILENTLY_ACCEPTED/u);
  assert.match(dstQa,/U32_DST_NONEXISTENT_LOCAL_TIME/u);
  assert.match(dstQa,/U32_DST_AMBIGUOUS_LOCAL_TIME/u);
  assert.match(dstQa,/dstDisambiguation','earlier'/u);
  assert.match(dstQa,/dstDisambiguation','later'/u);
  assert.match(dstQa,/2026-04-05 02:30:00\+00/u);
  assert.match(dstQa,/2026-04-05 03:30:00\+00/u);
  assert.match(dstQa,/UPDATE public\.training_session_occurrences_v1 SET status='cancelada',revision=1/u);
  assert.match(dstQa,/U32_DST_NORMAL_TIME_FAILED/u);
});

test('U32: database API stays closed; rollback cannot strand a historical batch',()=>{
  assert.match(migration,/SECURITY DEFINER\s+SET search_path TO ''/u);
  assert.match(migration,/REVOKE ALL ON FUNCTION private\.iberfit_u32_create_occurrences_batch_v1\(jsonb\)\s+FROM PUBLIC,anon,authenticated,service_role/u);
  assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.iberfit_execute_command_v26|\bGRANT EXECUTE\b|\bDROP TABLE\b/iu);
  assert.match(rollback,/u32_rollback_requires_no_batch_receipts/u);
  assert.doesNotMatch(rollback,/\bDELETE FROM\b|\bTRUNCATE\b|\bDROP TABLE\b|\bDROP COLUMN\b/iu);
  assert.match(qa,/U32_PRIVATE_EXECUTE_EXPOSED/u);
});

test('U32: legacy appointment insert, update and UPSERT share batch schedule lock',()=>{
  assert.match(fence,/CREATE FUNCTION private\.iberfit_u32_appointment_writer_fence_v1\(\)/u);
  assert.match(fence,/SECURITY DEFINER\s+SET search_path TO ''/u);
  assert.match(fence,/CREATE TRIGGER u32_appointment_writer_fence\s+BEFORE INSERT OR UPDATE OF client_id,session_id,start_at,end_at,status\s+ON public\.appointments FOR EACH ROW/u);
  assert.match(fence,/hashtextextended\('schedule_client:'\|\|NEW\.client_id::text,0\)/u);
  assert.match(migration,/hashtextextended\('schedule_client:'\|\|v_client::text,0\)/u);
  assert.match(fence,/U32_OCCURRENCE_APPOINTMENT_TIME_CONFLICT/u);
  assert.match(fence,/o\.appointment_id IS NOT NULL AND o\.appointment_id=NEW\.id/u);
  assert.match(fence,/o\.appointment_id IS NULL AND NOT EXISTS\(/u);
  assert.match(fence,/other\.id<>NEW\.id/u);
  assert.match(fence,/REVOKE ALL ON FUNCTION private\.iberfit_u32_appointment_writer_fence_v1\(\)/u);
  assert.match(fenceQa,/U32_CROSS_WRITER_UNRELATED_APPOINTMENT_ACCEPTED/u);
  assert.match(fenceQa,/U32_CROSS_WRITER_DUPLICATE_APPOINTMENT_ACCEPTED/u);
  assert.match(fenceQa,/U32_CROSS_WRITER_DRIFTED_LINK_ACCEPTED/u);
  assert.match(fenceQa,/U32_CROSS_WRITER_OWN_CONFIRM_FAILED/u);
  assert.match(fenceQa,/PERFORM public\.iberfit_persist_entity_v26\(/u);
  assert.match(fenceQa,/U32_CANONICAL_APPOINTMENT_CONFLICT_ACCEPTED/u);
  assert.match(fenceQa,/U32_CANONICAL_APPOINTMENT_PARTIAL_WRITE/u);
  assert.match(fence,/o\.starts_at IS NULL AND o\.ends_at IS NULL/u);
  assert.match(fence,/o\.appointment_id IS DISTINCT FROM NEW\.id/u);
  assert.match(fenceQa,/U32_DATE_ONLY_DUPLICATE_APPOINTMENT_ALLOWED/u);
  assert.match(migration,/U32_DATE_ONLY_ALREADY_HAS_APPOINTMENT/u);
  assert.match(migration,/ap\.session_id=v_session/u);
  assert.match(fenceQa,/U32_DATE_ONLY_ON_PREEXISTING_APPOINTMENT_ALLOWED/u);
  assert.match(fenceQa,/U32_DATE_ONLY_INVERSE_PARTIAL_SAVE/u);
  assert.match(fenceQa,/QA unrelated session on same date/u);
});

test('U32: legacy appointment fencing rollback is fail-closed while active dated occurrences exist',()=>{
  assert.match(fenceRollback,/u32_fence_rollback_requires_no_active_timed_occurrences/u);
  assert.match(fenceRollback,/DROP TRIGGER u32_appointment_writer_fence ON public\.appointments/u);
  assert.match(fenceRollback,/DROP FUNCTION private\.iberfit_u32_appointment_writer_fence_v1\(\)/u);
  assert.doesNotMatch(fenceRollback,/\bDELETE FROM\b|\bTRUNCATE\b|\bDROP TABLE\b|\bDROP COLUMN\b/iu);
});


test('U32/U31 integration: actual published Coach prescription survives first completion and next future weeks',()=>{
  assert.match(endToEndQa,/U32_U31_SERVER_SNAPSHOT_DIFFERS_FROM_PUBLISHED/u);
  assert.match(endToEndQa,/U32_U31_FIRST_PUBLISHED_SET_SAVE_FAILED/u);
  assert.match(endToEndQa,/U32_U31_REAL_PUBLISHED_CLOSURE_FAILED/u);
  assert.match(endToEndQa,/U32_U31_SOURCE_CONSUMED_OR_MIRROR_MISMATCH/u);
  assert.match(endToEndQa,/U32_U31_FUTURE_WEEK_PREMATURE_START_ALLOWED/u);
  assert.match(endToEndQa,/U32_U31_FUTURE_OCCURRENCES_NOT_PRESERVED/u);
  assert.match(endToEndQa,/U32_U31_FIRST_EXECUTION_LOCK_REMAINS/u);
  assert.match(endToEndQa,/U32_U31_REAL_PUBLISHED_3_DATE_LIFECYCLE_AND_FUTURE_GUARD_PASS/u);
});
