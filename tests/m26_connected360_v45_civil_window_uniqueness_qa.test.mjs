import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/qa-migrations/20261010235500_connected360_v45_civil_window_dedupe_qa.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261010235500_connected360_v45_civil_window_dedupe_qa.rollback.sql',import.meta.url),'utf8');

test('one source may have separate civil-day windows without inventing sensor identity',()=>{
  assert.match(migration,/create unique index m26_wearable_source_daily_v45_source_civil_window_uq/u);
  assert.match(migration,/owner_user_id,client_id,provider,record_date,source_key,aggregation_time_zone/u);
  assert.match(migration,/nulls not distinct/u);
  assert.match(migration,/NOT the physical sensor timezone/u);
  assert.doesNotMatch(migration,/source_time_zone\s*[,)]=|coalesce\s*\(\s*source_time_zone/iu);
});
test('QA migration swaps indexes atomically and maintains health-data security perimeter',()=>{
  assert.match(migration,/begin;[\s\S]*lock table public\.m26_wearable_source_daily_v45 in share row exclusive mode;/u);
  assert.ok(migration.indexOf('create unique index')<migration.indexOf('drop index'));
  assert.match(migration,/drop index public\.m26_wearable_source_daily_v45_known_source_uq;/u);
  assert.match(migration,/drop index public\.m26_wearable_source_daily_v45_unknown_source_uq;/u);
  assert.doesNotMatch(migration,/\b(truncate|delete from|insert into|update public\.|disable trigger|create policy|grant\s+(?:insert|update|delete)|security definer)\b/iu);
  assert.equal(existsSync(new URL('../supabase/migrations/20261010235500_connected360_v45_civil_window_dedupe_qa.sql',import.meta.url)),false);
});
test('rollback cannot erase data and restores original uniqueness before any index removal',()=>{
  assert.match(rollback,/begin;[\s\S]*commit;\s*$/u);
  assert.ok(rollback.indexOf('create unique index')<rollback.indexOf('drop index'));
  assert.match(rollback,/where source_key is not null/u);
  assert.match(rollback,/where source_key is null/u);
  assert.doesNotMatch(rollback,/\b(delete from|truncate|drop table|cascade)\b/iu);
});
