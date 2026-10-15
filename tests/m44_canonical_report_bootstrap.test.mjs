import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=async(path)=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('M44 creates a private report only after server ownership and assigned-coach checks',async()=>{
  const sql=await get('supabase/migrations/20261015141000_m44_report_canonical_draft_bootstrap_v1.sql');
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/iberfit_current_role_v26\(\)/);
  assert.match(sql,/iberfit_can_access_client_v26\(p_client_id\)/);
  assert.match(sql,/is_assigned_coach\(p_client_id\)/);
  assert.match(sql,/security definer set search_path = ''/);
  assert.match(sql,/revoke all on function/);
  assert.match(sql,/grant execute .* to authenticated/);
  assert.match(sql,/status','borrador'/);
  assert.doesNotMatch(sql,/insert into public\.reports[\s\S]*?'publicado'/u);
});
test('M44 rejects reports without confirmed training and stale temporal buckets',async()=>{
  const sql=await get('supabase/migrations/20261015141000_m44_report_canonical_draft_bootstrap_v1.sql');
  assert.match(sql,/execution_status='cerrada_confirmada'/);
  assert.match(sql,/M44_REPORT_CONFIRMED_TRAINING_REQUIRED/);
  assert.match(sql,/M44_REPORT_ACTIVITY_SERIES_STALE/);
  assert.match(sql,/M44_REPORT_ACTIVITY_SERIES_INCOMPLETE/);
  assert.match(sql,/sourceAssessmentId/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/M44_REPORT_VERSION_CONFLICT/);
});
test('M44 approval creates revision one through an authenticated transport, then uses existing command bus',async()=>{
  const app=await get('src/m26/app/application.js');
  const transport=await get('src/m26/supabase-transport.js');
  const controller=await get('src/m26/app/workflow-controller.js');
  assert.match(transport,/iberfit_m44_create_report_draft_v1/);
  assert.match(transport,/createReportDraft,/);
  assert.match(app,/createReportDraft:async\(payload\)/);
  const approval=controller.slice(controller.indexOf('  async function approveReport(){'),controller.indexOf('  async function executeWorkflowAction'));
  assert.match(approval,/if\(remote\.kind==='create'\)/);
  assert.match(approval,/createReportDraft\(\{/);
  assert.match(approval,/baseRevision=1/);
  assert.match(approval,/commandBus\.execute\(command\)/);
  assert.match(approval,/reportDraftScope\(stableId\)/);
  assert.match(approval,/M44_REPORT_CREATE_UNCONFIRMED/);
});
test('M44 training-only approval is enabled only when a confirmed premium candidate is selected',async()=>{
  const route=await get('src/m26/modules/route-render.js');
  const premium=await get('src/m26/workflows/report-workflow.js');
  assert.match(route,/Selecciona primero un informe de entrenamiento con evidencia confirmada/);
  assert.match(premium,/approve\.disabled=false/);
  assert.match(premium,/candidate\.id/);
});


test('M44 server guard rejects absent evidence/role/type fields rather than treating SQL NULL as false',async()=>{
  const sql=await get('supabase/migrations/20261015141000_m44_report_canonical_draft_bootstrap_v1.sql');
  assert.match(sql,/coalesce\(v_role,''\) not in/);
  assert.match(sql,/coalesce\(p_draft->>'periodStart',''\) !~/);
  assert.match(sql,/jsonb_typeof\(p_draft->'evidence'\) is distinct from 'array'/);
  assert.match(sql,/jsonb_typeof\(v_series\) is distinct from 'array'/);
  const report=await get('src/m26/workflows/report-workflow.js');
  assert.match(report,/normalized\.reviewAccepted=true/);
});


test('M44 every canonical draft creation writes a server-side audit event without publishing',async()=>{
  const sql=await get('supabase/migrations/20261015141000_m44_report_canonical_draft_bootstrap_v1.sql');
  assert.match(sql,/insert into public\.domain_events_v26/);
  assert.match(sql,/INFORME_CREAR_BORRADOR_M44/);
  assert.match(sql,/'applied',null,'borrador'/);
  assert.match(sql,/evidenceSignature/);
  assert.doesNotMatch(sql,/'applied',null,'publicado'/);
});
