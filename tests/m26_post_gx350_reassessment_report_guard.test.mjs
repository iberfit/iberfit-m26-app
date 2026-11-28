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


import {validateReportDraft,normalizeReportDraft,buildApproveReportDraftCommand} from '../src/m26/workflows/report-workflow.js';
const approvalDraft={id:'report-1',clientId:'client-1',assessmentId:'iri-1',reportType:'monthly',title:'Informe de seguimiento',periodStart:'2026-10-01',periodEnd:'2026-10-31',summary:'Actividad confirmada',conclusions:'Revisión profesional',recommendations:'Mantener seguimiento',reviewAccepted:true};
const reportRow={label:'Actividad registrada',text:'Cinco días observados',source:'sessionExecutions',quality:'confirmada'};
test('Report approval rejects reserved Connected360 evidence before normalization, including overflow rows',()=>{
 for(const type of ['iri','post-session','weekly','monthly','quarterly','year-in-iberfit',undefined]){
  const draft={...approvalDraft,reportType:type,evidence:[reportRow]};
  assert.equal(validateReportDraft(draft).ok,true);
  assert.equal(normalizeReportDraft(draft).evidence[0].source,'sessionExecutions');
  for(const source of ['connected360:apple-coach-trends','  CONNECTED360:health-connect','\tConnected360:future-source','\nconnected360:']){
   for(const evidence of [[{...reportRow,source}],[...Array(12).fill(reportRow),{...reportRow,source}]]){
    const blocked={...draft,evidence};
    assert.ok(validateReportDraft(blocked).errors.includes('device-publication-not-authorized'));
    assert.throws(()=>normalizeReportDraft(blocked),/device-publication-not-authorized/u);
    assert.throws(()=>buildApproveReportDraftCommand(blocked),/device-publication-not-authorized/u);
   }
  }
 }
});
test('Reassessment preview cannot become a remote approval command through the normalizer',()=>{
 const preview={...approvalDraft,reportType:'reassessment',assessmentId:null,previewOnly:true,official:false,evidence:[{...reportRow,source:'gx-professional:11111111-1111-4111-8111-111111111111:1'}]};
 for(const draft of [preview,{...preview,previewOnly:false,official:true},{...preview,evidence:[]}]){
  assert.ok(validateReportDraft(draft).errors.includes('reassessment-preview-only'));
  assert.throws(()=>buildApproveReportDraftCommand(draft),/reassessment-preview-only/u);
 }
});
