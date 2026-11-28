import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/release-procedures/connected360_v53_apple_exercise_authorization_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/release-procedures/connected360_v53_apple_exercise_authorization_v1.rollback.sql',import.meta.url),'utf8');
test('Apple workout consent is separate, disabled and bound to client/session and current source revision',()=>{
  for(const required of [/apple_exercise_enabled boolean NOT NULL DEFAULT false/u,/private\.m26_v49_live_session\(\)/u,/p_confirmed IS DISTINCT FROM true/u,/role::text='client'/u,/membershipStatus/u,/v_cursor<>p_expected_cursor/u,/v_old.grant_id IS DISTINCT FROM p_expected_grant/u,/e.provider IN \('apple_health','\*'\)/u,/l.scopes=ARRAY\['exerciseSessions'\]::text\[\]/u,/M26_V53_EXISTING_SCOPE_CONFLICT/u,/iberfit:wfence:v1:/u,/SECURITY INVOKER SET search_path TO ''/u])assert.match(sql,required);
  assert.doesNotMatch(sql,/CREATE TABLE|SET apple_exercise_enabled\s*=\s*true|INSERT INTO public\.m26_wearable_exercise_evidence/u);
  assert.match(rollback,/M26_V53_ROLLBACK_REQUIRES_DATA_PRESERVATION/u);
  assert.doesNotMatch(rollback,/DELETE FROM|TRUNCATE|DROP TABLE/u);
});

test('passive Apple authorization status never renews a grant and retains CAS inputs',()=>{
 const status=sql.slice(sql.indexOf('CREATE FUNCTION private.m26_v53_apple_exercise_status()'),sql.indexOf('CREATE FUNCTION private.m26_v53_authorize_apple_exercise('));
 const core=sql.slice(sql.indexOf('CREATE FUNCTION private.m26_v53_apple_exercise_source_state('),sql.indexOf('CREATE FUNCTION private.m26_v53_apple_exercise_status()'));
 for(const p of [/pg_try_advisory_xact_lock/u,/private\.m26_v53_apple_client_context\(\)/u,/RETURN private\.m26_v53_apple_exercise_source_state\(v_owner,v_client,v_enabled\)/u])assert.match(status,p);
 for(const p of [/v_old_cursor=v_cursor/u,/v_ledger/u,/connection-blocked/u,/scope-conflict/u,/consent-required/u,/release-disabled/u,/provider='apple_health'/u])assert.match(core,p);
 assert.doesNotMatch(status+core,/\bINSERT INTO\b|\bUPDATE public\b|\bDELETE FROM\b|gen_random_uuid/u);
 assert.doesNotMatch(core,/GRANT EXECUTE ON FUNCTION private\.m26_v53_apple_exercise_source_state/u);
 assert.match(rollback,/DROP FUNCTION public\.m26_wearable_v53_apple_exercise_status_v1\(\)/u);
});
