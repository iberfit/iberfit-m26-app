import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const m=readFileSync(new URL('../supabase/migrations/20261012070000_connected360_v46_production_closed_staging.sql',import.meta.url),'utf8');
const r=readFileSync(new URL('../supabase/rollbacks/20261012070000_connected360_v46_production_closed_staging.rollback.sql',import.meta.url),'utf8');

test('Prod V46 is additive, closed and does not write legacy health data',()=>{
  for(const table of ['m26_wearable_heart_rate_daily_v46','m26_wearable_exercise_evidence_v46']){
    assert.match(m,new RegExp('create table public\\.'+table+' \\('));
    assert.match(m,new RegExp('alter table public\\.'+table+' force row level security'));
    assert.match(m,new RegExp('revoke all on table public\\.'+table));
  }
  assert.match(m,/source_identity_verified boolean not null default false/u);
  assert.match(m,/automatic_sync_certified boolean not null default false/u);
  assert.match(m,/link_status text not null default 'unlinked'/u);
  assert.doesNotMatch(m,/create or replace function|grant execute|create policy/iu);
  assert.doesNotMatch(m,/\b(update|insert|delete|truncate)\s+(?:into|from)?\s*public\./iu);
  assert.match(m,/M26_V46_PRODUCTION_LEGACY_PREREQUISITES_MISSING/u);
  assert.match(m,/M26_V46_PRODUCTION_ALREADY_PRESENT_REVIEW_REQUIRED/u);
});
test('Dormant production rollback refuses deleting existing health measurements',()=>{
  assert.match(r,/M26_V46_PROD_ROLLBACK_HAS_HEALTH_DATA_PRESERVE/u);
  assert.match(r,/M26_V46_PROD_ROLLBACK_WRITER_EXISTS/u);
  assert.match(r,/SELECT 1 FROM public\.m26_wearable_exercise_evidence_v46/u);
  assert.match(r,/SELECT 1 FROM public\.m26_wearable_heart_rate_daily_v46/u);
});
