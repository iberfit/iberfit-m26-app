import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  reportDraftScope,legacyReportDraftScope,restoreReportDraft,reportApprovalDecision,
} from '../src/m26/workflows/report-draft-safety.js';
import {createMemoryEngagementDraftRepository} from '../src/m26/engagement/activity-drafts.js';
import {buildApproveReportDraftCommand} from '../src/m26/workflows/report-workflow.js';

const clientId='client-1',assessmentId='iri-1';
const data=(id,title='Informe IBERFIT')=>({
  id,entityId:id,clientId,assessmentId,title,
  periodStart:'2026-09-01',periodEnd:'2026-10-13',
  summary:'Avanza.',conclusions:'Mejora.',recommendations:'Progresar.',
  reviewAccepted:true,
});
const source=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('M43: valid entity scopes are safe, unique, and never use the legacy assessment-only key',()=>{
  const a=reportDraftScope('11111111-1111-4111-8111-111111111111');
  const b=reportDraftScope('22222222-2222-4222-8222-222222222222');
  assert.notEqual(a,b);
  assert.match(a,/^report-approval-[a-zA-Z0-9._-]+$/);
  assert.ok(a.length<=80);
  assert.notEqual(reportDraftScope('a:b'),reportDraftScope('a_3ab'));
  assert.throws(()=>reportDraftScope('../'+'../secret'),/M43_REPORT_DRAFT_ID_INVALID/);
  assert.throws(()=>reportDraftScope('a'.repeat(75)),/M43_REPORT_DRAFT_SCOPE_TOO_LONG/);
});

test('M43: two reports for the same client and assessment survive independent saves',async()=>{
  const repo=createMemoryEngagementDraftRepository({ownerId:'coach-m43'});
  const a=data('r-weekly','Informe semanal'),b=data('r-monthly','Informe mensual');
  await repo.save(clientId,reportDraftScope(a.id),a);
  await repo.save(clientId,reportDraftScope(b.id),b);
  assert.equal((await restoreReportDraft(repo,clientId,assessmentId,a.id)).value.title,'Informe semanal');
  assert.equal((await restoreReportDraft(repo,clientId,assessmentId,b.id)).value.title,'Informe mensual');
  await repo.remove(clientId,reportDraftScope(a.id));
  assert.equal((await restoreReportDraft(repo,clientId,assessmentId,b.id)).value.title,'Informe mensual');
  assert.equal(await restoreReportDraft(repo,clientId,assessmentId,a.id),null);
});

test('M43: restore legacy assessment scope without deleting, overwriting or taking another report',async()=>{
  const repo=createMemoryEngagementDraftRepository({ownerId:'coach-m43-legacy'});
  const legacy=data('old-report','Histórico');
  const legacyScope=legacyReportDraftScope(assessmentId);
  await repo.save(clientId,legacyScope,legacy);
  assert.equal((await restoreReportDraft(repo,clientId,assessmentId,legacy.id)).value.title,'Histórico');
  await repo.save(clientId,reportDraftScope('new-report'),data('new-report','Nuevo'));
  assert.equal((await restoreReportDraft(repo,clientId,assessmentId,'new-report')).value.title,'Nuevo');
  assert.equal((await restoreReportDraft(repo,clientId,assessmentId,'old-report')).value.title,'Histórico');
  assert.ok(await repo.load(clientId,legacyScope),'legacy is preserved until a proven same-identity migration');
});

test('M43: same owner cannot list client prefixes that look like another client',async()=>{
  const repo=createMemoryEngagementDraftRepository({ownerId:'coach-scope'});
  await repo.save('client','planning-cycle',{id:'a'});
  await repo.save('client:private','planning-cycle',{id:'b'});
  assert.deepEqual((await repo.list('client')).map(x=>x.value.id),['a']);
});

test('M43: the remote decision distinguishes first creation, draft update, ACK replay, diverged approved and foreign clients',()=>{
  const normalized=buildApproveReportDraftCommand(data('report-1'),0).payload.patch;
  assert.deepEqual(reportApprovalDecision([],clientId,normalized),{kind:'create',baseRevision:0});
  const draft={id:'report-1',clientId,revision:7,status:'borrador',body:normalized};
  assert.deepEqual(reportApprovalDecision([draft],clientId,normalized),{kind:'update-draft',baseRevision:7});
  const approved={...draft,status:'aprobado',revision:8};
  assert.deepEqual(reportApprovalDecision([approved],clientId,normalized),{kind:'already-approved',baseRevision:8});
  assert.deepEqual(reportApprovalDecision([approved],clientId,{...normalized,summary:'Cambio importante'}),{kind:'new-version-required',baseRevision:8});
  assert.deepEqual(reportApprovalDecision([{...approved,body:{...normalized,coachComment:'Decisión A'}}],clientId,{...normalized,coachComment:'Decisión B'}),{kind:'new-version-required',baseRevision:8});
  assert.deepEqual(reportApprovalDecision([{...approved,body:{...normalized,evidenceSignature:'signature-older'}}],clientId,{...normalized,evidenceSignature:'signature-new'}),{kind:'new-version-required',baseRevision:8});
  assert.deepEqual(reportApprovalDecision([{...approved,body:{...normalized,evidence:[{label:'Distancia',text:'5 km',source:'running'}]}}],clientId,{...normalized,evidence:[{label:'Distancia',text:'6 km',source:'running'}]}),{kind:'new-version-required',baseRevision:8});
  assert.throws(()=>reportApprovalDecision([{...draft,clientId:'other'}],clientId,normalized),/M43_REPORT_REMOTE_CLIENT_CONFLICT/);
  assert.throws(()=>reportApprovalDecision([{...draft,revision:null}],clientId,normalized),/M43_REPORT_REMOTE_REVISION_UNKNOWN/);
  assert.throws(()=>reportApprovalDecision([{...draft,status:'desconocido'}],clientId,normalized),/M43_REPORT_REMOTE_STATUS_UNSUPPORTED/);
});

test('M43: controller guards remote approval with a fresh revision and checks acknowledgement before cleanup',()=>{
  const code=source('src/m26/app/workflow-controller.js');
  const approval=code.slice(code.indexOf('  async function approveReport(){'),code.indexOf('  async function executeWorkflowAction'));
  assert.match(approval,/refreshState\(\{reason:'report-approval-revision-preflight'\}\)/);
  assert.match(approval,/reportApprovalDecision\(store\.getState\(\)\.collections\?\.reports/);
  assert.match(approval,/baseRevision:remote\.baseRevision/);
  assert.match(approval,/remote\.kind==='already-approved'/);
  assert.match(approval,/remote\.kind==='new-version-required'/);
  assert.match(approval,/refreshAndFind\('reports',stableId,clientId/);
  assert.match(approval,/draftRepository\?\.remove\?\.\(clientId,reportDraftScope\(stableId\)\)/);
  assert.doesNotMatch(approval,/buildApproveReportDraftCommand\(\{id:stableId,\.\.\.content\},0\)[\s\S]*?commandBus\.execute\(prepared\)/);
  assert.match(code,/updateReportDraftChoices\(form,\{restoreSingle:true\}\)/);
  assert.match(code,/onBeforeReportSwitch/);
  const app=source('src/m26/app/application.js');
  assert.match(app,/workflow=createWorkflowController\(\{root,store,commandBus,catalog,mediaMap,draftRepository,refreshState:hydrate,/);
  assert.match(code,/if\(event\.target\.closest\?\.\('\[data-report-draft-choice\]'\)\)return;/);
});

test('M43: premium candidate begins a new report identity and Coach sees a recovery picker',()=>{
  const report=source('src/m26/workflows/report-workflow.js');
  const method=report.slice(report.indexOf('function prefillPremiumReport'),report.indexOf('export function installPremiumReportUi'));
  assert.ok(method.indexOf("setReportFormValue(form,'entityId','')")<method.indexOf("setReportFormValue(form,'reportType',candidate.id)"));
  assert.match(report,/m26:report-before-switch/);
  const route=source('src/m26/modules/route-render.js');
  assert.match(route,/data-report-draft-choice/);
  assert.match(route,/Preparar un informe nuevo/);
});
