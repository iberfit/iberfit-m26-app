import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260908134500_admin_client_history_fk_set_null_v26.sql', import.meta.url), 'utf8');
const historyTables = [
  'beta_incidents_v16',
  'beta_participants_v16',
  'consent_acceptances_v17',
  'data_subject_requests_v17',
  'device_conflict_trials',
  'incident_register_v17',
];

test('all reviewed historical client FKs use ON DELETE SET NULL', () => {
  for (const table of historyTables) {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`alter table public\\.${escaped}[\\s\\S]*?foreign key \\(client_id\\) references public\\.clients\\(id\\) on delete set null`, 'i');
    assert.match(sql, re, `${table} must preserve its row and null client_id when the client is deleted`);
  }
});

test('migration never cascades or deletes historical client records', () => {
  assert.doesNotMatch(sql, /on delete cascade/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(beta_|consent_|data_subject_|device_conflict_|incident_)/i);
});
