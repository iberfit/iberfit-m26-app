import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/release-procedures/connected360_v51_exercise_storage_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/release-procedures/connected360_v51_exercise_storage_v1.rollback.sql',import.meta.url),'utf8');
test('V51 keeps one protected table and existing source uniqueness; no new writer or gate enabled',()=>{
  assert.match(sql,/M26_V51_V50_REQUIRED/u);
  assert.match(sql,/M26_V51_PROVIDER_SCOPED_READERS_REQUIRED/u);
  assert.match(sql,/relrowsecurity AND relforcerowsecurity/u);
  assert.match(sql,/owner_user_id, client_id, provider, source_record_key/u);
  assert.match(sql,/ADD COLUMN active_seconds numeric,/u);
  assert.match(sql,/provider IN \('health_connect','apple_health'\)/u);
  assert.match(sql,/provider='apple_health' AND sport='swimming'/u);
  assert.match(sql,/active_seconds IS NULL OR/u);
  assert.match(sql,/heart_rate_avg IS NULL AND heart_rate_min IS NULL AND heart_rate_max IS NULL/u);
  assert.doesNotMatch(sql,/CREATE TABLE|CREATE FUNCTION|GRANT |INSERT INTO|UPDATE public\.|DELETE FROM|CREATE INDEX/u);
});
test('V51 rollback is fenced and refuses any information loss',()=>{
  assert.match(rollback,/ACCESS EXCLUSIVE MODE/u);
  assert.match(rollback,/provider <> 'health_connect' OR sport NOT IN/u);
  assert.match(rollback,/OR active_seconds IS NOT NULL/u);
  assert.match(rollback,/M26_V51_ROLLBACK_WRITER_PRESENT/u);
  assert.doesNotMatch(rollback,/DELETE FROM|TRUNCATE |DROP TABLE/u);
});
