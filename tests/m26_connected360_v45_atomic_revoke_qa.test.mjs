import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeMigration,findCreatedTables} from '../scripts/ci/check_migration_security_policy.mjs';

const sql=readFileSync(new URL('../supabase/qa-migrations/20261009223143_connected360_v45_atomic_revoke_erase_qa.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261009223143_connected360_v45_atomic_revoke_erase_qa.rollback.sql',import.meta.url),'utf8');
const revokeStart=sql.indexOf('create or replace function public.m26_wearable_revoke_v44');
const revokeEnd=sql.indexOf('create or replace function public.m26_wearable_v45_block_unverified_write_qa_v1');
const revoke=sql.slice(revokeStart,revokeEnd);
test('QA-only migration does not add tables or bypass repository policy',()=>{
  assert.deepEqual(findCreatedTables(sql),[]);
  assert.deepEqual(analyzeMigration(sql),[]);
  assert.ok(revokeStart>=0&&revokeEnd>revokeStart);
  assert.doesNotMatch(sql,/\b(?:truncate|drop table|create policy|grant\s+insert\s+on\s+public\.m26_wearable_source_daily_v45)\b/iu);
});
test('v44 revocation gets owner-client advisory lock before modifying connection',()=>{
  const lock=revoke.indexOf('pg_advisory_xact_lock(');
  const modify=revoke.indexOf('update public.m26_wearable_connections_v44');
  assert.ok(lock>=0&&modify>lock);
  assert.match(revoke,/iberfit:wfence:v1:/u);
  assert.match(revoke,/p_delete_data, false/u);
  assert.match(revoke,/m26_wearable_consents_v44/u);
});
test('v45 imports remain impossible including via service role until a separately approved writer',()=>{
  assert.match(sql,/M26_CONNECTED360_V45_INGEST_UNCERTIFIED/u);
  assert.match(sql,/before insert or update on public\.m26_wearable_source_daily_v45/iu);
  assert.match(sql,/security invoker set search_path=''/iu);
  assert.doesNotMatch(sql,/grant execute on function public\.m26_wearable_v45_/iu);
});
test('deleting own-source consent and wildcard revoke clear v45 in same transaction',()=>{
  assert.match(sql,/tg_table_name='m26_wearable_consents_v44'/u);
  assert.match(sql,/new\.action<>'delete'/u);
  assert.match(sql,/tg_table_name='m26_wearable_revocation_events_v2'/u);
  assert.match(sql,/new\.provider<>'\*'/u);
  assert.match(sql,/owner_user_id=v_owner and client_id=v_client and provider=v_provider/u);
  assert.match(sql,/owner_user_id=v_owner and client_id=v_client;/u);
  assert.match(sql,/when \(new\.action='delete'\)/u);
  assert.match(sql,/when \(new\.provider='\*'\)/u);
  assert.match(sql,/iberfit:wfence:v1:/u);
  assert.match(sql,/security definer set search_path=''/u);
  assert.match(sql,/revoke all on function public\.m26_wearable_v45_cleanup_after_revoke_qa_v1\(\)\s+from public,anon,authenticated/iu);
});
test('rollback refuses loss and retains v45 write blocker',()=>{
  assert.match(rollback,/ROLLBACK_NONEMPTY_FORBIDDEN/u);
  assert.match(rollback,/exists\(select 1 from public\.m26_wearable_source_daily_v45 limit 1\)/iu);
  assert.match(rollback,/KEEP the fail-closed v45 write blocker/u);
  assert.match(rollback,/drop trigger m26_wearable_v45_cleanup_on_global_revoke_qa_v1/iu);
  assert.doesNotMatch(rollback,/drop trigger m26_wearable_v45_block_unverified_write_qa_v1/iu);
  assert.doesNotMatch(rollback,/\bdrop table\b|\btruncate\b|\bcascade\b/iu);
});
