import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=load('supabase/release-procedures/gx_connected360_report_observations_v1.sql');
const rollback=load('supabase/release-procedures/gx_connected360_report_observations_v1.rollback.sql');
test('report observation proof is internal only; no permission or publication side effects',()=>{
 assert.match(sql,/VOLATILE SECURITY INVOKER SET search_path TO ''/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.m26_gx_connected360_report_observations_v1\(uuid,uuid,text,uuid,bigint,date,date\) FROM PUBLIC,anon,authenticated,service_role/u);
 assert.doesNotMatch(sql,/\b(?:GRANT EXECUTE|INSERT INTO|UPDATE public\.|DELETE FROM|ALTER TABLE|CREATE TABLE)\b/u);
 assert.match(rollback,/DROP FUNCTION .* RESTRICT;/u);
 assert.match(sql,/p_end-p_start>6 OR p_end>=v_today/u);
});
test('source and evidence are separately fenced by exact generation, provider and owner',()=>{
 for(const p of [/pg_try_advisory_xact_lock/u, /a\.grant_id=p_grant AND a\.revocation_cursor=p_cursor/u,/p_provider<>'apple_health' OR a\.scopes=ARRAY\['exerciseSessions'\]::text\[\]/u,/p_provider<>'apple_health' OR l\.scopes=ARRAY\['exerciseSessions'\]::text\[\]/u,/a\.owner_user_id=p_owner AND a\.client_id=p_client AND a\.provider=p_provider/u,/l\.grant_id=p_grant AND l\.revocation_cursor=p_cursor AND 'exerciseSessions'=ANY\(l\.scopes\)/u,/p_cursor IS DISTINCT FROM \(SELECT coalesce\(max\(e\.id\),0\)/u,/w\.grant_id=p_grant AND w\.revocation_cursor=p_cursor AND w\.link_status='unlinked'/u,/w\.observed_started_at<\(\(p_end\+1\)::timestamp AT TIME ZONE 'America\/Santiago'\)/u])assert.match(sql,p);
 assert.ok(sql.indexOf('FOR SHARE;')<sql.indexOf('pg_try_advisory_xact_lock'));
});
test('fixed evidence projection contains only distinct positive dates and sport counts, not raw health data',()=>{
 assert.match(sql,/SELECT DISTINCT \(w\.observed_started_at AT TIME ZONE 'America\/Santiago'\)::date AS day/u);
 assert.match(sql,/CASE WHEN w\.sport='interval_running' THEN 'running' ELSE w\.sport END/u);
 assert.match(sql,/jsonb_array_length\(v_days\)=0/u);
 assert.match(sql,/ORDER BY day/u);assert.match(sql,/ORDER BY sport/u);
 const output=sql.slice(sql.lastIndexOf('RETURN pg_catalog.jsonb_build_object'),sql.indexOf('-- Write-time callers'));
 assert.match(output,/'coverage','observed-only'/u);assert.match(output,/'evidenceSha256',pg_catalog\.encode\(pg_catalog\.sha256/u);
 assert.doesNotMatch(output,/ownerId|clientId|grantId|cursor|distance|heartRate|sourceRecord|deviceId/u);
});

test('snapshot proof is stable and never locks or calls the volatile V53 source helper',()=>{
 const snapshot=sql.slice(sql.indexOf('CREATE FUNCTION private.m26_gx_connected360_report_observations_snapshot_v1'),sql.indexOf('-- Write-time callers'));
 assert.match(snapshot,/STABLE SECURITY INVOKER/u);
 assert.doesNotMatch(snapshot,/FOR (?:SHARE|UPDATE)|pg_.*advisory|m26_v53_apple_exercise_source_state\(/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.m26_gx_connected360_report_observations_snapshot_v1\(uuid,uuid,text,uuid,bigint,date,date\) FROM PUBLIC,anon,authenticated,service_role/u);
});
test('locked writer calls the same snapshot projection after source fence in read committed',()=>{
 const writer=sql.slice(sql.indexOf('-- Write-time callers'));
 assert.match(writer,/VOLATILE SECURITY INVOKER/u);
 assert.match(writer,/current_setting\('transaction_isolation'\) IS DISTINCT FROM 'read committed'/u);
 assert.ok(writer.indexOf('FOR SHARE;')<writer.indexOf('pg_try_advisory_xact_lock'));
 assert.ok(writer.indexOf('pg_try_advisory_xact_lock')<writer.indexOf('RETURN private.m26_gx_connected360_report_observations_snapshot_v1'));
 assert.equal((sql.match(/WITH observed AS/g)||[]).length,1);
 assert.ok(rollback.indexOf('observations_v1(')<rollback.indexOf('observations_snapshot_v1('));
});
