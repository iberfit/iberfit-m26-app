import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migration=path.join(process.cwd(),'supabase','migrations','20260831201000_audit360_optimize_auth_rls_initplan.sql');
const sql=fs.readFileSync(migration,'utf8');

const policies=[
  'm26_audit_read_v43',
  'm26_measurements_write_v43',
  'm26_messages_insert_v43',
  'm26_session_drafts_read_v431',
  'm26_session_drafts_insert_v431',
  'm26_session_drafts_update_v431',
  'm26_session_drafts_delete_v431',
  'm26_telemetry_events_insert_v59',
  'm26_plans_write_v43',
  'm26_sessions_write_v43',
  'm26_wearable_connections_delete_v44',
  'm26_wearable_connections_insert_v44',
  'm26_wearable_connections_update_v44',
  'm26_wearable_consents_insert_v44',
  'm26_wearable_summaries_insert_v44',
  'm26_wearable_summaries_update_v44',
];

test('AUDIT360 optimiza todas las políticas RLS detectadas sin recrearlas',()=>{
  for(const policy of policies){
    assert.match(sql,new RegExp(`alter\\s+policy\\s+${policy}\\b`,'i'),`Falta ${policy}`);
  }
  assert.doesNotMatch(sql,/drop\s+policy/i);
  assert.doesNotMatch(sql,/create\s+policy/i);
});

test('AUDIT360 no deja auth.uid() evaluado directamente por fila',()=>{
  const allCalls=sql.match(/auth\.uid\(\)/g)??[];
  const cachedCalls=sql.match(/\(select\s+auth\.uid\(\)\)/gi)??[];
  assert.ok(allCalls.length>=policies.length);
  assert.equal(cachedCalls.length,allCalls.length);
});
