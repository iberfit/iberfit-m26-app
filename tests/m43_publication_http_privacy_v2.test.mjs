import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261014143500_m43_publication_http_privacy_v2.sql');
const rollback=read('supabase/qa-rollbacks/20261014143500_m43_publication_http_privacy_v2_rollback.sql');
test('M43 protects both canonical and legacy Client publication HTTP objects',()=>{
  for(const name of ['plan','session','block']){
    assert.match(migration,new RegExp('FUNCTION public\\.iberfit_m43_client_safe_'+name+'_v2\\(p_body jsonb\\)'));
    assert.match(migration,new RegExp('REVOKE ALL ON FUNCTION public\\.iberfit_m43_client_safe_'+name+'_v2\\(jsonb\\) FROM PUBLIC,anon,authenticated'));
    assert.match(rollback,new RegExp('DROP FUNCTION IF EXISTS public\\.iberfit_m43_client_safe_'+name+'_v2'));
  }
  assert.match(migration,/safe_plan_v2\(item\)/);
  assert.match(migration,/safe_session_v2\(item\)/);
  assert.match(migration,/safe_plan_v2\(item->'body'\)/);
  assert.match(migration,/safe_session_v2\(item->'body'\)/);
  assert.match(migration,/visibleToClient','true'/);
  assert.match(migration,/clientVisibilityLevel/);
  assert.match(migration,/deliveryOwnership/);
  assert.match(migration,/coach_led/);
  assert.match(migration,/plannedPacePer100M/);
  assert.match(migration,/plannedDistanceKm/);
  assert.match(migration,/jsonb_agg\(public\.iberfit_m43_client_safe_block_v2\(block\) ORDER BY ord\)/);
  assert.match(migration,/IMMUTABLE SET search_path TO ''/);
  assert.doesNotMatch(migration,/\b(?:drop table|truncate table|alter table|disable row level security)\b/iu);
});
test('M43 restores V1 bootstrap and does not mutate any training records on rollback',()=>{
  assert.match(rollback,/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26\(\)/);
  assert.match(rollback,/iberfit_m43_client_safe_execution_v1/);
  assert.doesNotMatch(rollback,/DELETE FROM|TRUNCATE|DROP TABLE/i);
});
