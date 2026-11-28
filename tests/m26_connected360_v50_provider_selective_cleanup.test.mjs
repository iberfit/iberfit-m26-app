import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/release-procedures/connected360_v50_provider_selective_cleanup_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/release-procedures/connected360_v50_provider_selective_cleanup_v1.rollback.sql',import.meta.url),'utf8');
const tables=["m26_wearable_heart_rate_daily_v46","m26_wearable_exercise_evidence_v46","m26_wearable_daily_health_v47","m26_wearable_v46_consents_prod","m26_wearable_v47_consents_prod"];
test('V50 preserves owner/client lock and requires exact provider except explicit wildcard',()=>{
  assert.match(sql,/28bb4b1e77b2d64e2c579e2eeb50eb23/u);
  assert.match(sql,/5f8d8f5e93d9a09bc66d2af8f1a88bad/u);
  assert.match(sql,/d:=replace\(d,prior,target\)/u);
  assert.match(sql,/replace\(deletes,'client_id=v_client;','client_id=v_client and provider=v_provider;'\)/u);
  for(const name of tables)assert.ok(sql.includes("'"+name+"'"));
  assert.match(sql,/if v_provider='\*' then/u);
  assert.match(rollback,/d:=replace\(d,target,prior\)/u);
  assert.match(rollback,/chr\(13\)\|\|chr\(10\)/u);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.m26_wearable_v46_cleanup/u);
  assert.doesNotMatch(sql,/ALTER TABLE|DROP TABLE|TRUNCATE|GRANT EXECUTE/u);
});
test('V50 rollback refuses widened schema and does not erase data',()=>{
  assert.match(rollback,/M26_V50_ROLLBACK_CANDIDATE_DRIFT/u);
  assert.match(rollback,/M26_V50_ROLLBACK_MULTIPROVIDER_SCHEMA/u);
  assert.match(rollback,/c\.convalidated/u);
  for(const name of tables)assert.ok(rollback.includes("c.conrelid='public."+name+"'::regclass"));
  assert.doesNotMatch(rollback,/^\s*(DELETE FROM|TRUNCATE|DROP TABLE)/mu);
  assert.match(rollback,/M26_V50_ROLLBACK_BASELINE_DRIFT/u);
});
