import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(
  new URL('../supabase/migrations/20261025194000_signature_u31_private_occurrence_executor_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(
  new URL('../supabase/rollbacks/20261025194000_signature_u31_private_occurrence_executor_v1.rollback.sql',import.meta.url),'utf8');
const rc29Validation=readFileSync(
  new URL('../scripts/run_rc29_validation.mjs',import.meta.url),'utf8');
const probe=readFileSync(
  new URL('../qa/sql/signature_u31_occurrence_atomic_rollback_probe.sql',import.meta.url),'utf8');

test('U31: internal-only function preserves current production v26 dispatcher',()=>{
  assert.match(migration,/CREATE FUNCTION private\.iberfit_u31_occurrence_transition_v1\(p_command jsonb\)/u);
  assert.match(migration,/SECURITY DEFINER\s+SET search_path TO ''/u);
  assert.match(migration,/REVOKE ALL ON FUNCTION private\.iberfit_u31_occurrence_transition_v1\(jsonb\)\s+FROM PUBLIC,anon,authenticated,service_role;/u);
  assert.doesNotMatch(migration,/\bGRANT EXECUTE\b|CREATE OR REPLACE FUNCTION public\.iberfit_execute_command_v26/u);
  assert.doesNotMatch(migration,/CREATE POLICY|ALTER TABLE public\.domain_entities_v26 DISABLE ROW LEVEL SECURITY/u);
});

test('U31: operation ID replay is tied to all identifiers and hashed content',()=>{
  assert.match(migration,/v_request_hash:=encode\(sha256\(convert_to\(p_command::text,'UTF8'\)\),'hex'\)/u);
  assert.match(migration,/v_receipt\.actor_user_id<>v_actor OR v_receipt\.base_revision<>v_base/u);
  assert.match(migration,/v_receipt\.response->>'requestHash' IS DISTINCT FROM v_request_hash/u);
  assert.match(migration,/OPERATION_ID_REUSED/u);
  assert.match(migration,/RETURN \(v_receipt\.response-'requestHash'\)/u);
  assert.match(migration,/INSERT INTO public\.command_receipts_v26/u);
  assert.match(probe,/U31_QA_TAMPERED_RETRY_ACCEPTED/u);
});

test('U31: no Client can start without existing server-side ownership and guided delivery',()=>{
  assert.match(migration,/public\.iberfit_can_access_client_v26\(v_client\)/u);
  assert.match(migration,/public\.iberfit_canary_enabled_v26\(v_client\)/u);
  assert.match(migration,/octet_length\(p_command::text\)>524288/u);
  assert.match(migration,/SOURCE_REVISION_INVALID/u);
  assert.match(migration,/v_role NOT IN \('coach','cliente'\)/u);
  assert.match(migration,/private\.iberfit_training_command_guard_v1/u);
  assert.match(migration,/private\.iberfit_session_delivery_guard_m28/u);
  assert.match(migration,/v_source\.body->>'deliveryModality'<>'guiada_en_app'/u);
  assert.match(migration,/SELECT \* INTO v_appointment FROM public\.appointments[\s\S]*?session_id=v_occ\.session_id AND status='confirmada'/u);
  assert.match(migration,/CONFIRMED_APPOINTMENT_REQUIRED/u);
  assert.match(migration,/ACTIVE_EXECUTION_EXISTS/u);
});

test('U31: lock and CAS prevent simultaneous operations from different devices',()=>{
  assert.match(migration,/hashtextextended\('active_execution_client:'\|\|v_client::text,0\)/u);
  assert.match(migration,/WHERE id=v_occ\.id AND client_id=v_client AND revision=v_occ\.revision/gmu);
  assert.match(migration,/SELECT \* INTO v_execution_state FROM public\.domain_entities_v26[\s\S]*?FOR UPDATE;/u);
  assert.match(migration,/EXECUTION_REVISION_MISMATCH/u);
  assert.match(migration,/public\.active_execution_locks_v26/u);
  assert.match(probe,/U31_QA_CONCURRENT_START_ALLOWED/u);
});

test('U31: per-set progress persists with independent execution CAS and safe replay',()=>{
  assert.match(migration,/OCURRENCIA_GUARDAR_PROGRESO/u);
  assert.match(migration,/v_execution_ack_revision:=v_execution_base\+1/u);
  assert.match(migration,/U31_PROGRESS_CAS_LOST/u);
  assert.match(migration,/U31_PROGRESS_MIRROR_CAS_LOST/u);
  assert.match(migration,/v_next:=v_occ\.revision;[\s\S]*?v_execution_ack_revision:=v_execution_base\+1/u);
  assert.match(migration,/octet_length\(v_results::text\)>262144/u);
  assert.match(probe,/U31_QA_PROGRESS_SAVE_FAILED/u);
  assert.match(probe,/U31_QA_PROGRESS_REPLAY_MUTATION_ACCEPTED/u);
  assert.match(probe,/U31_QA_STALE_DEVICE_PROGRESS_ACCEPTED/u);
  assert.match(probe,/u31-qa-squat:2/u);
});

test('U31: recording one workout never transitions the shared prescription',()=>{
  assert.match(migration,/INSERT INTO public\.session_executions\([\s\S]*?occurrence_id/u);
  assert.match(migration,/INSERT INTO public\.domain_entities_v26/u);
  assert.match(migration,/public\.iberfit_validate_execution_completion_v26\(v_execution_body\)/u);
  assert.match(migration,/U31_MIRROR_EXECUTION_MISSING/u);
  assert.match(migration,/NEVER call iberfit_persist_entity_v26\('session',\.\.\.\) here/u);
  assert.doesNotMatch(migration,/PERFORM public\.iberfit_persist_entity_v26\('session'/u);
  assert.match(probe,/U31_QA_SOURCE_PRESCRIPTION_CONSUMED/u);
  assert.match(probe,/U31_QA_NEXT_DATE_COULD_NOT_START/u);
  assert.match(probe,/U31_QA_INCOMPLETE_SERIES_ACCEPTED/u);
});

test('U31: RC29 CI failure diagnostic reveals numerical budgets without exposing arbitrary stderr',()=>{
  assert.match(rc29Validation,/if\(name==='build'\)/u);
  assert.match(rc29Validation,/meta\?\.budgetOk===false/u);
  assert.match(rc29Validation,/javascriptBytes','javascriptLimit'/u);
  assert.match(rc29Validation,/RC29_BUILD_SOURCE_MISSING\|ENOENT\|ENOSPC\|ENOMEM/u);
  assert.doesNotMatch(rc29Validation,/\+\s*result\.stderr\s*\+/u);
  assert.match(rc29Validation,/RC29_VALIDATION_FAILED/u);
});

test('U31: linked confirmed appointment closes with the execution, cancelled booking never resurrects',()=>{
  assert.match(migration,/SELECT \* INTO v_appointment FROM public\.appointments/u);
  assert.match(migration,/WHERE id=v_occ\.appointment_id AND client_id=v_client/u);
  assert.match(migration,/v_appointment\.status='confirmada'/u);
  assert.match(migration,/v_appointment_domain_revision IS DISTINCT FROM v_appointment\.revision/u);
  assert.match(migration,/U31_APPOINTMENT_REVISION_DRIFT/u);
  assert.match(migration,/PERFORM public\.iberfit_persist_entity_v26\(\s*'appointment'/u);
  assert.match(migration,/v_appointment_completion_state:='preserved_'\|\|v_appointment\.status/u);
  assert.match(migration,/v_appointment_completion_state:='completed'/u);
  assert.match(migration,/'appointmentCompletionState',v_appointment_completion_state/u);
  assert.doesNotMatch(migration,/PERFORM public\.iberfit_persist_entity_v26\(\s*'session'/u);
});

test('U31: audit, staging rollback and QA fail-closed evidence',()=>{
  assert.match(migration,/INSERT INTO public\.command_events_v26/u);
  assert.match(migration,/INSERT INTO public\.domain_events_v26/u);
  assert.match(probe,/U31_QA_DOMAIN_AUDIT_NOT_UNIQUE/u);
  assert.match(rollback,/u31_rollback_requires_no_persisted_commands/u);
  assert.match(rollback,/DROP FUNCTION private\.iberfit_u31_occurrence_transition_v1\(jsonb\)/u);
  assert.doesNotMatch(rollback,/\b(?:DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN)\b/iu);
  assert.doesNotMatch(migration,/\b(?:DELETE FROM public\.domain_entities_v26|UPDATE public\.sessions|ALTER ROLE|GRANT ALL)\b/iu);
  assert.match(probe,/U31_QA_PRIVATE_FUNCTION_EXPOSED/u);
});
