import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/release-procedures/connected360_v50_provider_selective_cleanup_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/release-procedures/connected360_v50_provider_selective_cleanup_v1.rollback.sql',import.meta.url),'utf8');
const tables=["m26_wearable_heart_rate_daily_v46","m26_wearable_exercise_evidence_v46","m26_wearable_daily_health_v47","m26_wearable_v46_consents_prod","m26_wearable_v47_consents_prod"];
test('V50 preserves owner/client lock and requires exact provider except explicit wildcard',()=>{
  assert.match(sql,/iberfit:wfence:v1:/u);
  assert.match(sql,/v_owner is distinct from \(select auth.uid\(\)\)/u);
  assert.match(sql,/if new.action<>'delete' then return new/u);
  assert.match(sql,/if new.provider<>'\*' then return new/u);
  const start=sql.indexOf("if v_provider='*' then");
  const end=sql.indexOf('  return new;',start);
  const branches=sql.slice(start,end).split('  else');
  assert.equal(branches.length,2);
  for(const name of tables){
    assert.ok(branches[0].includes('delete from public.'+name+'\n      where owner_user_id=v_owner and client_id=v_client;'));
    assert.ok(branches[1].includes('delete from public.'+name+'\n      where owner_user_id=v_owner and client_id=v_client and provider=v_provider;'));
  }
  assert.equal((sql.match(/delete from public\./gu)||[]).length,10);
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
