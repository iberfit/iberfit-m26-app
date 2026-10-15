import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('M44 history SQL hides private object paths and private withdrawal reasons from Client',async()=>{
 const t=await readFile(new URL('../supabase/migrations/20261015145000_m44_report_issued_pdf_history_v1.sql',import.meta.url),'utf8');
 assert.match(t,/v_client:=v_role='cliente'/);
 assert.match(t,/v_report.status='publicado' AND v_report.audience='cliente'/);
 assert.match(t,/is_assigned_coach\(v_report.client_id\)/);
 assert.match(t,/AND \(v_manager OR i.status='issued'\)/);
 assert.match(t,/case when v_manager then i.withdrawn_reason else null end/);
 assert.doesNotMatch(t,/'artifactPath'|'artifactBucket'|'sourceSnapshot'|'issueRequestId'/);
});
