import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20260924233000_admin_client_delete_plpgsql_foreach_fix_v1.sql', import.meta.url),
  'utf8',
);

const compact = migration.toLowerCase().replace(/\s+/g, '');

test('ADMIN client deletion iterates reviewed table arrays relationally for plpgsql_check', () => {
  assert.ok(compact.includes('forv_tableinselectunnest(v_detach_history_tables)loop'));
  assert.ok(compact.includes('forv_tableinselectunnest(v_cleanup_tables)loop'));
  assert.ok(!compact.includes('foreachv_tableinarray'));
});

test('ADMIN client deletion preserves the reviewed history and cleanup table sets', () => {
  for (const table of [
    'beta_incidents_v16',
    'beta_participants_v16',
    'consent_acceptances_v17',
    'data_subject_requests_v17',
    'device_conflict_trials',
    'incident_register_v17',
  ]) {
    assert.match(migration, new RegExp(`'${table}'`, 'i'));
  }

  for (const table of [
    'appointment_change_requests',
    'client_assignments',
    'client_intake_profiles',
    'iberfit_client_lifecycle_events',
    'iberfit_coach_client_assignments',
    'iberfit_conversation_threads',
    'iberfit_operational_tasks',
    'ai_provider_calls',
    'ai_safety_events',
    'ai_uploads',
    'dm_message_events',
    'dm_threads',
    'replay_events',
    'session_reschedule_events',
  ]) {
    assert.match(migration, new RegExp(`'${table}'`, 'i'));
  }
});

test('ADMIN client deletion keeps fail-closed destructive semantics and privileged assurance', () => {
  const assurance = migration.indexOf('iberfit_require_privileged_assurance_v65d()');
  const adminGate = migration.indexOf('iberfit_admin_require_v14()');

  assert.ok(assurance >= 0);
  assert.ok(adminGate > assurance);
  assert.match(migration, /IBERFIT_CLIENT_DELETE_PROTECTED_HISTORY/i);
  assert.match(migration, /IBERFIT_CLIENT_DELETE_UNMANAGED_REFERENCE/i);
  assert.match(migration, /update public\.%I set client_id=null where client_id=\$1/i);
  assert.match(migration, /delete from public\.%I where client_id::text=\$1/i);
  assert.match(migration, /delete from public\.clients where id=v_client_id/i);
});

test('ADMIN client deletion keeps service-role-only RPC ACL and hardened function metadata', () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(
    migration,
    /revoke all on function public\.iberfit_admin_delete_client_v26\(jsonb,jsonb\) from public,anon,authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.iberfit_admin_delete_client_v26\(jsonb,jsonb\) to service_role/i,
  );
  assert.match(migration, /IBERFIT_ADMIN_CLIENT_DELETE_POSTCHECK_SECURITY/i);
  assert.match(migration, /IBERFIT_ADMIN_CLIENT_DELETE_POSTCHECK_ACL/i);
});
