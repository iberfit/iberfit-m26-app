import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(
  new URL('../supabase/qa-migrations/20261012031500_connected360_v45_general_heart_rate_fields_qa.sql',import.meta.url),'utf8'
);
const rollback=readFileSync(
  new URL('../supabase/qa-rollbacks/20261012031500_connected360_v45_general_heart_rate_fields_qa.rollback.sql',import.meta.url),'utf8'
);

test('FC general schema is additive QA-only and never aliases resting HR',()=>{
  for(const column of [
    'general_heart_rate_samples','general_heart_rate_min_bpm','general_heart_rate_max_bpm',
  ]) assert.match(migration,new RegExp('ADD COLUMN '+column+' integer NULL','u'));
  assert.match(migration,/general_heart_rate_min_bpm <= general_heart_rate_max_bpm/u);
  assert.match(migration,/general_heart_rate_samples BETWEEN 1 AND 250000/u);
  assert.match(migration,/general_heart_rate_min_bpm BETWEEN 25 AND 300/u);
  assert.match(migration,/general_heart_rate_max_bpm BETWEEN 25 AND 300/u);
  assert.match(migration,/resting_heart_rate IS NOT NULL OR/u);
  assert.match(migration,/workout_minutes IS NOT NULL OR general_heart_rate_samples IS NOT NULL/u);
  assert.doesNotMatch(migration,/^\s*UPDATE\s+public\./imu);
  assert.doesNotMatch(migration,/^\s*(?:GRANT|CREATE\s+POLICY|CREATE\s+FUNCTION)\b/imu);
});

test('QA schema fails closed without base table, forced RLS or closed staging',()=>{
  assert.match(migration,/to_regclass\('public\.m26_wearable_source_daily_v45'\)/u);
  assert.match(migration,/v_rls IS DISTINCT FROM true OR v_force IS DISTINCT FROM true/u);
  assert.match(migration,/has_table_privilege\('anon'/u);
  assert.match(migration,/has_table_privilege\('authenticated'/u);
  assert.match(migration,/IF EXISTS \(SELECT 1 FROM public\.m26_wearable_source_daily_v45 LIMIT 1\)/u);
  assert.match(migration,/^BEGIN;[\s\S]*COMMIT;/mu);
  assert.match(migration,/automatic_sync_certified/u);
});

test('QA rollback blocks any existing FC general data before dropping schema',()=>{
  assert.match(rollback,/IF EXISTS \(/u);
  for(const column of [
    'general_heart_rate_samples','general_heart_rate_min_bpm','general_heart_rate_max_bpm',
  ]) {
    assert.match(rollback,new RegExp(column+' IS NOT NULL','u'));
    assert.match(rollback,new RegExp('DROP COLUMN '+column,'u'));
  }
  assert.match(rollback,/ROLLBACK_DATA_PRESENT/u);
  assert.match(rollback,/ADD CONSTRAINT m26_wearable_source_daily_v45_nonempty_metric/u);
  assert.match(rollback,/DROP CONSTRAINT m26_wearable_source_daily_v45_general_hr_bounds/u);
});
