import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=()=>readFileSync('supabase/migrations/20261008170000_connected360_revocation_fence_v1.sql','utf8');
const app=()=>readFileSync('src/m26/wearables/remote-sync.js','utf8');

test('Connected 360 migration is a one-shot additive change: no DROP, no anonymous DO and no removed health records',()=>{
  const source=sql().toLowerCase();
  assert.match(source,/begin;/u);
  assert.match(source,/commit;/u);
  assert.match(source,/create table if not exists public\.m26_wearable_revocation_fence_v1/u);
  assert.match(source,/create or replace function public\.m26_wearable_delete_all_v44/u);
  assert.doesNotMatch(source,/\bdrop\s+(table|function|policy|trigger|schema)\b/u);
  assert.doesNotMatch(source,/\bdo\s+\$/u);
  assert.doesNotMatch(source,/\btruncate\s/u);
  assert.doesNotMatch(source,/delete from public\.m26_wearable_daily_summaries_v44[\s\S]*?where status=/u);
});

test('Fence table has restricted RLS and cannot be disabled by an authenticated user',()=>{
  const source=sql();
  assert.match(source,/alter table public\.m26_wearable_revocation_fence_v1 enable row level security/u);
  assert.match(source,/revoke all on public\.m26_wearable_revocation_fence_v1 from public,anon,authenticated/u);
  assert.match(source,/grant select,insert on public\.m26_wearable_revocation_fence_v1 to authenticated/u);
  assert.doesNotMatch(source,/grant\s+(?:all|update|delete)[^\n]*m26_wearable_revocation_fence_v1 to authenticated/iu);
  assert.match(source,/owner_user_id=\(select auth\.uid\(\)\)/u);
  assert.match(source,/client_id=public\.iberfit_client_id\(\)/u);
  assert.match(source,/constraint m26_wearable_revocation_fence_v1_pk primary key/u);
});

test('Every summary and connection write races against the same client-level advisory lock',()=>{
  const source=sql();
  assert.match(source,/pg_catalog\.pg_advisory_xact_lock/u);
  assert.match(source,/iberfit:wfence:v1:/u);
  for(const name of ['m26_wearable_connections_fence_v1','m26_wearable_summaries_fence_v1','m26_wearable_consents_fence_v1']){
    assert.match(source,new RegExp('create trigger '+name,'u'));
  }
  assert.match(source,/m26_wearable_daily_summaries_v44'[^\n]*\n(?:.*\n){1,9}?\s*v_check_write:=true/u);
  assert.match(source,/v_log_revocation:=new\.action in \('revoke','delete'\)/u);
  assert.match(source,/v_log_revocation:=new\.status='revoked'/u);
  assert.match(source,/f\.provider in \(v_source,'\*'\)/u);
  assert.match(source,/M26_CONNECTED360_CONSENT_REVOKED/u);
  assert.doesNotMatch(source,/tg_table_name='m26_wearable_consents_v44'\s+and tg_op=/u);
});

test('Delete all fences client globally even if there were never any remote records',()=>{
  const source=sql();
  const procedure=source.slice(source.lastIndexOf('create or replace function public.m26_wearable_delete_all_v44'));
  const write=procedure.indexOf("values(auth.uid(),v_client_id,'*')");
  const deleteData=procedure.indexOf('delete from public.m26_wearable_daily_summaries_v44');
  assert.ok(write>0&&deleteData>write);
  assert.match(procedure,/public\.iberfit_require_privileged_assurance_v65d\(\)/u);
  assert.match(procedure,/auth\.uid\(\) is null/u);
  assert.match(procedure,/where owner_user_id=auth\.uid\(\) and client_id=v_client_id/u);
  assert.match(procedure,/insert into public\.m26_wearable_consents_v44/u);
});

test('Local queue never stages new work after a pending revoke or delete',()=>{
  const source=app();
  assert.match(source,/const blockedProviders=new Set\(\)/u);
  assert.match(source,/let deleteRequested=false/u);
  assert.match(source,/function serialize\(task\)/u);
  assert.match(source,/blockedProviders\.add\(safeSource\)/u);
  assert.match(source,/if\(deleteRequested\|\|blockedProviders\.has\(source\)\)/u);
  assert.match(source,/if\(deleteRequested\|\|blockedProviders\.has\(safeSource\)\)/u);
  assert.match(source,/deleteRequested=true/u);
  assert.match(source,/return serialize\(\(\)=>flushUnlocked\(params\)\)/u);
});
