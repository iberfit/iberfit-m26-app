import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/release-procedures/gx_reassessment_report_guard_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/release-procedures/gx_reassessment_report_guard_v1.rollback.sql',import.meta.url),'utf8');
test('reassessment is a mandatory marker at existing report and PDF guards',()=>{
 for(const pattern of [/gx_reassessment_type_consistency/u,/coalesce\(p_body->>'reportType'='reassessment',false\) OR EXISTS/u,/IF p_body->>'reportType'='reassessment' THEN RETURN private\.iberfit_gx_reassessment_body_current_v1/u,/gx326_report_evidence_guard/u,/gx326_issuance_evidence_guard/u])assert.match(sql,pattern);
});
test('reassessment needs live canonical comparisons, distinct labels and exact date envelope',()=>{
 for(const pattern of [/jsonb_array_length\(p_body->'evidence'\) NOT BETWEEN 1 AND 12/u,/private\.iberfit_gx_report_evidence_current_v1\(p_client,start_day,end_day,r\) IS DISTINCT FROM true/u,/\(r->>'label'\)=ANY\(labels\)/u,/first_day<start_day OR last_day>end_day/u,/earliest IS NOT DISTINCT FROM start_day AND latest IS NOT DISTINCT FROM end_day/u,/sourceAssessmentId/u,/activitySeries/u])assert.match(sql,pattern);
 assert.ok(sql.indexOf('IF private.iberfit_gx_report_evidence_current_v1')<sql.indexOf("first_day:=left(r->>'text'"));
 assert.doesNotMatch(sql,/CREATE TABLE|INSERT INTO|DELETE FROM|GRANT EXECUTE ON FUNCTION private\.iberfit_gx_reassessment_body_current_v1/u);
});
test('rollback stops after reevaluation data exists, without deleting data',()=>{
 assert.match(rollback,/GX_REASSESSMENT_ROLLBACK_REQUIRES_RETAINED_HISTORY_PLAN/u);
 assert.doesNotMatch(rollback,/DROP TABLE|DELETE FROM|TRUNCATE/u);
});

test('Connected360 structured evidence is reserved and denied at shared report and PDF guard',()=>{
 assert.match(sql,/LIKE 'gx-professional:%'\) OR EXISTS[\s\S]*?LIKE 'connected360:%'/u);
 const body=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION private.iberfit_gx_report_body_current_v1'));
 assert.match(body,/LIKE 'connected360:%'\) THEN RETURN false; END IF;/u);
 assert.ok(body.indexOf("LIKE 'connected360:%'")<body.indexOf("IF NOT private.iberfit_gx_report_body_has_refs_v1"));
 assert.match(sql,/public\.reports r WHERE EXISTS[\s\S]*?LIKE 'connected360:%'/u);
 assert.match(sql,/public\.iberfit_evolution_report_issuances_v1 r WHERE EXISTS[\s\S]*?LIKE 'connected360:%'/u);
});
