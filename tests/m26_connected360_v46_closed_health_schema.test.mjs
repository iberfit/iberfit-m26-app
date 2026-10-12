import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(
  new URL('../supabase/qa-migrations/20261012035127_connected360_v46_closed_heart_rate_and_workout_qa.sql',import.meta.url),
  'utf8'
);
const match=(value)=>assert.match(sql,value);

test('V46 keeps general heart rate in a distinct per-day table rather than V44 resting HR',()=>{
  match(/create table public\.m26_wearable_heart_rate_daily_v46/u);
  match(/heart_rate_avg numeric/u);
  match(/heart_rate_min numeric/u);
  match(/heart_rate_max numeric/u);
  match(/sample_count integer/u);
  assert.doesNotMatch(sql,/alter table public\.m26_wearable_daily_summaries_v44/u);
  assert.doesNotMatch(sql,/update public\.m26_wearable_daily_summaries_v44/u);
});

test('V46 workout observations retain real source windows, acquisition timestamps and client owner',()=>{
  match(/create table public\.m26_wearable_exercise_evidence_v46/u);
  match(/owner_user_id uuid not null references auth\.users/u);
  match(/client_id uuid not null references public\.clients/u);
  match(/source_record_key text not null/u);
  match(/observed_started_at timestamptz not null/u);
  match(/observed_ended_at timestamptz not null/u);
  match(/acquired_at timestamptz not null/u);
  match(/source_updated_at timestamptz null/u);
  match(/sport text not null/u);
  match(/link_status text not null default 'unlinked'/u);
});

test('V46 staging has FORCE RLS, zero Data API grants, and no production changes',()=>{
  for(const table of ['m26_wearable_heart_rate_daily_v46','m26_wearable_exercise_evidence_v46']){
    match(new RegExp('alter table public\\.'+table+' enable row level security'));
    match(new RegExp('alter table public\\.'+table+' force row level security'));
    match(new RegExp('revoke all on table public\\.'+table));
  }
  assert.doesNotMatch(sql,/grant (?:select|insert|update|delete|execute)/iu);
  assert.doesNotMatch(sql,/create policy/iu);
  assert.doesNotMatch(sql,/create or replace function.*security definer/iu);
  assert.doesNotMatch(sql,/public\.m26_wearable_source_daily_v45\s+drop/u);
  match(/QA-only CLOSED staging/u);
});

test('V46 never infers wearable identity, resting HR, auto-sync certification or linking',()=>{
  match(/source_identity_verified boolean not null default false check \(source_identity_verified = false\)/u);
  match(/automatic_sync_certified boolean not null default false check \(automatic_sync_certified = false\)/u);
  match(/link_status text not null default 'unlinked' check \(link_status='unlinked'\)/u);
  assert.doesNotMatch(sql,/resting_heart_rate numeric/u);
  assert.doesNotMatch(sql,/dataOriginPackage|deviceId|watchSerial/u);
  assert.doesNotMatch(sql,/insert into public\.m26_wearable/u);
});
