import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(
  new URL(
    '../supabase/migrations/20260909074000_exercise_custom_creation_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('custom exercise RPC is narrow SECURITY DEFINER and Coach/Admin only',()=>{
  assert.match(source,/create or replace function public\.iberfit_create_custom_exercise_v1/);
  assert.match(source,/security definer/i);
  assert.match(source,/set search_path=''/i);
  assert.match(source,/v_role not in \('coach','admin'\)/);
  assert.match(source,/v_actor is null/);
});

test('custom exercise enters the existing catalog as active pending review',()=>{
  assert.match(source,/insert into public\.exercise_catalog/);
  assert.match(source,/'IBERFIT_COACH_CUSTOM'/);
  assert.match(source,/'sin_media'/);
  assert.match(source,/'pendiente'/);
  assert.match(source,/\n\s*true,\n\s*1,\n\s*false/);
  assert.doesNotMatch(source,/create table/i);
  assert.doesNotMatch(source,/create policy/i);
});

test('RPC rejects visible duplicate names and serializes concurrent attempts',()=>{
  assert.match(source,/pg_advisory_xact_lock/);
  assert.match(source,/e\.active=true/);
  assert.match(source,/e\.review_status <> 'retirado'/);
  assert.match(source,/IBERFIT_EXERCISE_NAME_DUPLICATE/);
});

test('custom creation exposes only EXECUTE to authenticated callers',()=>{
  assert.match(source,/revoke all[\s\S]*from public;/i);
  assert.match(source,/revoke execute[\s\S]*from anon;/i);
  assert.match(source,/grant execute[\s\S]*to authenticated;/i);
  assert.doesNotMatch(source,/grant\s+insert[\s\S]*exercise_catalog/i);
});
