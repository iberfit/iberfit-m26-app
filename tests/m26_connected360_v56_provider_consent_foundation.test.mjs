import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const v49=read('supabase/release-procedures/connected360_v49_coach_activity_consent_v1.sql');
const v53=read('supabase/release-procedures/connected360_v53_apple_exercise_authorization_v1.sql');
const rb=read('supabase/release-procedures/connected360_v53_apple_exercise_authorization_v1.rollback.sql');
function fn(sql,name){const begin=sql.indexOf('CREATE FUNCTION private.'+name+'(');assert.ok(begin>=0);return sql.slice(begin,sql.indexOf('REVOKE ALL ON FUNCTION private.'+name,begin));}
test('professional ledger separates provider grants and never inherits Health Connect consent',()=>{
 assert.match(v49,/PRIMARY KEY\(owner_user_id,client_id,coach_user_id,provider\)/u);
 assert.match(v49,/\(provider='apple_health' AND purpose='coaching-apple-exercise-days-v1'\)/u);
 const set=fn(v49,'m26_v49_set_coach_consent'),status=fn(v49,'m26_v49_my_coach_consent_status'),recipients=fn(v49,'m26_v49_my_coach_recipients'),read=fn(v49,'m26_v49_coach_exercise_days');
 for(const body of [set,status,recipients,read])assert.match(body,/g\.provider='health_connect'/u);
 assert.match(set,/coach_user_id=p_coach AND provider='health_connect'/u);
 assert.match(set,/ON CONFLICT\(owner_user_id,client_id,coach_user_id,provider\)/u);
 assert.match(set,/'health_connect','coaching-exercise-days-v1'/u);
 assert.match(read,/s\.provider='health_connect'/u);
 assert.match(read,/w\.provider='health_connect'/u);
 const trigger=fn(v49,'m26_v49_invalidate_assignment');
 assert.doesNotMatch(trigger,/provider='health_connect'/u);
 assert.match(v49,/FORCE ROW LEVEL SECURITY/u);
});
test('Apple source generation check stays private, exact owner/client, exercise-only and revocation-bound',()=>{
 const core=fn(v53,'m26_v53_apple_exercise_source_state'),status=fn(v53,'m26_v53_apple_exercise_status');
 assert.match(core,/SECURITY INVOKER SET search_path TO ''/u);
 assert.match(core,/e\.owner_user_id=p_owner AND e\.client_id=p_client AND e\.provider IN \('apple_health','\*'\)/u);
 assert.match(core,/l\.owner_user_id=p_owner AND l\.client_id=p_client AND l\.provider='apple_health'/u);
 assert.match(core,/v_old_cursor=v_cursor/u);
 assert.match(core,/c\.status IN \('paused','revoked','disconnected'\)/u);
 assert.match(core,/v_old_scopes IS DISTINCT FROM ARRAY\['exerciseSessions'\]/u);
 assert.match(v53,/REVOKE ALL ON FUNCTION private\.m26_v53_apple_exercise_source_state\(uuid,uuid,boolean\) FROM PUBLIC,anon,authenticated,service_role/u);
 assert.doesNotMatch(v53,/GRANT EXECUTE ON FUNCTION private\.m26_v53_apple_exercise_source_state/u);
 assert.ok(status.indexOf('pg_try_advisory_xact_lock')<status.indexOf('RETURN private.m26_v53_apple_exercise_source_state'));
 assert.ok(status.indexOf('IF private.m26_v53_apple_client_context() IS DISTINCT FROM v_client')<status.indexOf('RETURN private.m26_v53_apple_exercise_source_state'));
 assert.ok(rb.indexOf('DROP FUNCTION private.m26_v53_apple_exercise_status();')<rb.indexOf('DROP FUNCTION private.m26_v53_apple_exercise_source_state'));
});
