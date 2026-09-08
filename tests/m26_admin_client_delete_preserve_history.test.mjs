import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260908133000_admin_client_delete_preserve_history_v26.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');

const historyTables = [
  'beta_incidents_v16',
  'beta_participants_v16',
  'consent_acceptances_v17',
  'data_subject_requests_v17',
  'device_conflict_trials',
  'incident_register_v17',
];

test('ADMIN deletion preserves reviewed governance/history tables by detaching client_id', () => {
  for (const table of historyTables) {
    assert.match(sql, new RegExp(`'${table}'`), `${table} must remain in the reviewed history allowlist`);
  }
  assert.match(sql, /update public\.%I set client_id=null where client_id=\$1/i);
  assert.match(sql, /c\.is_nullable='YES'/i);
  assert.match(sql, /historicalRowsDetached/i);
});

test('ADMIN deletion remains fail-closed for schema drift and unknown protected references', () => {
  assert.match(sql, /rc\.delete_rule in \('NO ACTION','RESTRICT'\)/i);
  assert.match(sql, /tc\.table_name<>all\(v_detach_history_tables\)/i);
  assert.match(sql, /IBERFIT_CLIENT_DELETE_PROTECTED_HISTORY/);
  assert.match(sql, /IBERFIT_CLIENT_DELETE_HISTORY_SCHEMA_DRIFT/);
  assert.match(sql, /IBERFIT_CLIENT_DELETE_UNMANAGED_REFERENCE/);
});

test('ADMIN deletion keeps privileged assurance, admin authorization and idempotency', () => {
  assert.match(sql, /iberfit_require_privileged_assurance_v65d\(\)/);
  assert.match(sql, /iberfit_admin_require_v14\(\)/);
  assert.match(sql, /iberfit_admin_mutation_receipts/);
  assert.match(sql, /operation_id=v_operation and actor_user_id=v_actor and command_type=v_type/);
});

test('ADMIN deletion does not delete historical governance rows', () => {
  for (const table of historyTables) {
    const unsafe = new RegExp(`delete\\s+from\\s+public\\.${table}\\b`, 'i');
    assert.doesNotMatch(sql, unsafe, `${table} must never be deleted by the client deletion RPC`);
  }
});
