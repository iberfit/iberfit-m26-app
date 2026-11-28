import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../supabase/release-procedures/'+path,import.meta.url),'utf8');
const v49=read('connected360_v49_coach_activity_consent_v1.sql'),v56=read('connected360_v56_apple_coach_consent_v1.sql'),v58=read('connected360_v58_apple_coach_trends_v1.sql'),rb=read('connected360_v58_apple_coach_trends_v1.rollback.sql');
test('independent purpose and provider keys never inherit a seven-day decision',()=>{
 assert.match(v49,/PRIMARY KEY\(owner_user_id,client_id,coach_user_id,provider,purpose\)/u);
 assert.match(v56,/g\.provider='apple_health' AND g\.purpose=p_purpose FOR UPDATE/u);
 assert.match(v56,/coach_user_id=p_coach AND provider='apple_health' AND purpose=p_purpose/u);
 assert.match(v56,/ON CONFLICT\(owner_user_id,client_id,coach_user_id,provider,purpose\)/u);
 assert.match(v56,/m26_v56_apple_coach_decision\('coaching-apple-exercise-days-v1',p_coach/u);
 assert.match(v58,/m26_v56_apple_coach_decision\('coaching-apple-trends-v1',p_coach/u);
 assert.match(v56,/m26_v56_apple_coach_access\(p_client,'coaching-apple-exercise-days-v1'\)/u);
 assert.match(v58,/m26_v56_apple_coach_access\(p_client,'coaching-apple-trends-v1'\)/u);
 for(const helper of ['m26_v56_apple_coach_decision','m26_v56_apple_coach_recipient_projection','m26_v56_apple_coach_access']){
  assert.match(v56,new RegExp('REVOKE ALL ON FUNCTION private\\.'+helper+'\\([^)]*\\) FROM PUBLIC,anon,authenticated,service_role'));
  assert.doesNotMatch(v56,new RegExp('GRANT EXECUTE ON FUNCTION private\\.'+helper+'\\('));
 }
});
test('Coach longitudinal read exposes counts only from current generation, never owner retained history',()=>{
 for(const pattern of [/p_days NOT IN \(7,28,90,365\)/u,/v_start:=v_end-2\*p_days\+1/u,/w\.owner_user_id=v_g\.owner_user_id AND w\.client_id=p_client AND w\.provider='apple_health'/u,/w\.grant_id=v_g\.source_grant_id AND w\.revocation_cursor=v_g\.source_cursor AND w\.link_status='unlinked'/u,/count\(DISTINCT day\)/u,/coverage','observed-only'/u])assert.match(v58,pattern);
 assert.doesNotMatch(v58,/retainedOnlyDays|active_seconds|distance_meters|heart_rate|source_record_key|CREATE TABLE|CREATE INDEX|GRANT SELECT/u);
 assert.doesNotMatch(rb,/DELETE FROM|DROP TABLE|TRUNCATE|m26_v56_/u);
});
