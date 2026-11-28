import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/release-procedures/connected360_v56_apple_coach_consent_v1.sql',import.meta.url),'utf8');
const v49=readFileSync(new URL('../supabase/release-procedures/connected360_v49_coach_activity_consent_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/release-procedures/connected360_v56_apple_coach_consent_v1.rollback.sql',import.meta.url),'utf8');
function fn(name){const a=sql.indexOf('CREATE FUNCTION private.'+name+'(');assert.ok(a>=0);return sql.slice(a,sql.indexOf('$f$;',sql.indexOf('AS $f$',a)+6));}
test('V56 owner CAS is independent of HC and checks Apple source generation before grant',()=>{
 const s=fn('m26_v56_apple_coach_decision');
 for(const p of [/private\.m26_v53_apple_client_context\(\)/u,/p_expected_revision>=2147483647/u,/p_allow AND p_assignment IS NULL/u,/pg_try_advisory_xact_lock/u,/private\.m26_v53_apple_exercise_source_state\(v_owner,v_client,v_enabled\)/u,/g\.provider='apple_health' AND g\.purpose=p_purpose FOR UPDATE/u,/coach_user_id=p_coach AND provider='apple_health'/u,/ON CONFLICT\(owner_user_id,client_id,coach_user_id,provider,purpose\)/u,/'apple_health',p_purpose/u,/coalesce\(v_old.consent_revision,0\)<>p_expected_revision/u])assert.match(s,p);
 assert.doesNotMatch(s,/health_connect/u);
 assert.ok(s.indexOf('FOR SHARE')<s.indexOf('pg_try_advisory_xact_lock'));
});
test('V56 recipients retain recorded decisions and expose no observation values',()=>{
 const s=fn('m26_v56_apple_coach_recipient_projection');
 assert.match(s,/m26_v49_project_recipients\(v_owner,v_client,v_context,v_auth,v_enabled,v_day,'apple_health',p_purpose\)/u);
 const core=v49.slice(v49.indexOf('CREATE FUNCTION private.m26_v49_project_recipients('),v49.indexOf('REVOKE ALL ON FUNCTION private.m26_v49_project_recipients('));
 for(const p of [/g\.provider=p_provider AND g\.purpose=p_purpose/u,/FULL JOIN decisions/u,/g\.source_grant_id=\(v_auth->>'grantId'\)::uuid/u,/g\.source_cursor=\(v_auth->>'revocationCursor'\)::bigint/u,/LIMIT 21/u])assert.match(core,p);
 assert.match(s,/'provider','apple_health'/u);
 assert.doesNotMatch(s+core,/exercise_evidence|distance_meters|heart_rate/u);
});
test('V56 professional read is role/assurance/assignment/provider scoped and minimized',()=>{
 const s=fn('m26_v56_apple_coach_access')+fn('m26_v56_apple_coach_exercise_days');
 for(const p of [/iberfit_require_privileged_assurance_v65d/u,/private\.m26_v49_live_session/u,/roles'\)\?'admin'/u,/g\.provider='apple_health'/u,/g\.purpose=p_purpose/u,/g\.source_grant_id=\(v_auth->>'grantId'\)::uuid/u,/g\.source_cursor=\(v_auth->>'revocationCursor'\)::bigint/u,/b\.revision=g\.assignment_revision/u,/m26_v49_project_exercise_days\(v_g,v_day\)/u])assert.match(s,p);
 const core=v49.slice(v49.indexOf('CREATE FUNCTION private.m26_v49_project_exercise_days('),v49.indexOf('REVOKE ALL ON FUNCTION private.m26_v49_project_exercise_days('));
 for(const p of [/w\.provider=v_g\.provider/u,/w\.owner_user_id=v_g\.owner_user_id AND w\.client_id=v_g\.client_id/u,/w\.grant_id=v_g\.source_grant_id AND w\.revocation_cursor=v_g\.source_cursor/u,/SELECT DISTINCT \(w\.observed_started_at AT TIME ZONE/u,/w\.observed_ended_at<=pg_catalog\.now\(\)/u])assert.match(core,p);
 assert.doesNotMatch(s+core,/source_record_key|source_app_key|distance_meters|heart_rate|active_seconds/u);
 assert.doesNotMatch(sql,/CREATE TABLE|GRANT SELECT ON TABLE|SET apple_exercise_enabled\s*=\s*true/u);
 assert.doesNotMatch(rollback,/DELETE FROM|DROP TABLE|TRUNCATE|v49_/u);
});
