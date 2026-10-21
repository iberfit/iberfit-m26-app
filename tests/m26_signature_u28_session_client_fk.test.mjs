import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261021013000_signature_session_client_composite_fk_v1.sql',import.meta.url),'utf8');
const normalized=sql.replace(/\s+/gu,' ').toLowerCase();
const has=(fragment)=>normalized.includes(fragment.toLowerCase());

test('SIGNATURE U28: ownership baseline refuses pre-existing cross-client links',()=>{
  assert.ok(has('a.client_id is distinct from s.client_id'));
  assert.ok(has('e.client_id is distinct from s.client_id'));
  assert.ok(has('as u28_cross_client_data_guard'));
  assert.ok(sql.indexOf('u28_cross_client_data_guard')<sql.indexOf('ALTER TABLE public.sessions\n  ADD CONSTRAINT'));
});

test('SIGNATURE U28: both materialized relationships enforce composite ownership',()=>{
  assert.ok(has('unique (id, client_id)'));
  assert.ok(has('foreign key (session_id, client_id) references public.sessions (id, client_id)'));
  assert.equal((normalized.match(/foreign key \(session_id, client_id\)/gu)||[]).length,2);
  assert.ok(has('on delete set null (session_id) not valid'));
  assert.ok(has('on delete cascade not valid'));
  assert.ok(has('validate constraint appointments_session_client_integrity_u28_fkey'));
  assert.ok(has('validate constraint session_executions_session_client_integrity_u28_fkey'));
});

test('SIGNATURE U28: no session-less appointment or existing schema capability is removed',()=>{
  assert.ok(has('match simple'));
  assert.ok(has('begin;'));
  assert.ok(has('commit;'));
  assert.ok(has("set local lock_timeout = '5s'"));
  assert.ok(has('as u28_legacy_delete_semantics_guard'));
  assert.ok(!/\b(drop\s+table|truncate|update\s+public\.\w+|delete\s+from|disable\s+row\s+level\s+security)\b/iu.test(sql.replace(/^--.*$/gmu,'')));
});
