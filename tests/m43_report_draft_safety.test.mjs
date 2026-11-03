import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  reportDraftScope,legacyReportDraftScope,restoreReportDraft,reportApprovalDecision,
  isStandaloneTrainingReportDraft,localReportDraftCompatibleWithAssessment,prepareLocalReportDraft,
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
  assert.match(approval,/let baseRevision=remote\.baseRevision/);
  assert.match(approval,/const command=\{\.\.\.prepared,baseRevision\}/);
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
  // Form field is present before the MutationObserver premium enhancement,
  // so early edits and restored drafts cannot lose their selected report type.
  assert.match(route,/name="reportType" value=""/u);
  assert.match(route,/Selecciona primero un informe de entrenamiento con evidencia confirmada/u);
});

test('M44: report draft without IRI remains recoverable under its own client and report identity',async()=>{
  const repo=createMemoryEngagementDraftRepository({ownerId:'coach-m44-training-only'});
  const training={...data('r-training'),assessmentId:null,reportType:'weekly'};
  await repo.save(clientId,reportDraftScope(training.id),training);
  const restored=await restoreReportDraft(repo,clientId,null,training.id);
  assert.equal(restored?.value?.reportType,'weekly');
  assert.equal(restored?.value?.assessmentId,null);
  assert.equal(await restoreReportDraft(repo,'foreign-client',null,training.id),null);
  assert.equal(await restoreReportDraft(repo,clientId,null,'missing'),null);
});
test('M44: the progression form is present even without initial IRI and cannot approve it unsafely',()=>{
  const route=source('src/m26/modules/route-render.js');
  assert.doesNotMatch(route,/const editor=vm\.canManage&&hasTrainingSurface\(vm\.serviceKind\)\?\(iriId\?/);
  assert.match(route,/Selecciona primero un informe de entrenamiento con evidencia confirmada/);
  const code=source('src/m26/app/workflow-controller.js');
  const localSave=code.slice(code.indexOf('  async function saveReportDraft('),code.indexOf('  function queueReportSave('));
  assert.match(localSave,/prepareLocalReportDraft\(raw,\{clientId,entityId:stableId\}\)/u);
  assert.doesNotMatch(localSave,/M26_REPORT_ASSESSMENT_REQUIRED/u);
  assert.match(code,/prepareLocalReportDraft\(raw,\{clientId,entityId:stableId\}\)/u);
  assert.match(source('src/m26/workflows/report-draft-safety.js'),/assessmentId:isStandaloneTrainingReportDraft\(data\)\?null:assessmentId\|\|null/u);
});


test('M44: public.reports content JSONB matches approved report replay without creating duplicate',()=>{
  const approved=buildApproveReportDraftCommand({...data('m44-ack-1'),reportType:'weekly'},0).payload.patch;
  const server={
    id:approved.id,client_id:clientId,revision:2,status:'aprobado',
    report_type:'weekly',title:approved.title,summary:approved.summary,
    content:structuredClone(approved),
  };
  assert.deepEqual(reportApprovalDecision([server],clientId,approved),
    {kind:'already-approved',baseRevision:2});
  assert.deepEqual(reportApprovalDecision([server],clientId,{...approved,coachComment:'Cambio profesional'}),
    {kind:'new-version-required',baseRevision:2});
  assert.deepEqual(reportApprovalDecision([server],clientId,{...approved,evidence:[{label:'Carga',text:'9 kg',source:'sessionExecutions'}]}),
    {kind:'new-version-required',baseRevision:2});
});

test('M44: activitySeries and lineaged source IDs are material in remote acknowledgement',()=>{
  const base={...data('m44-ack-2'),assessmentId:null,reportType:'monthly',
    sourceType:'session_execution_period',sourceId:null,
    activitySeries:[{from:'2026-10-01',to:'2026-10-07',count:2}],
  };
  const payload=buildApproveReportDraftCommand(base,0).payload.patch;
  const server={id:payload.id,client_id:clientId,status:'aprobado',revision:4,content:structuredClone(payload)};
  assert.equal(reportApprovalDecision([server],clientId,payload).kind,'already-approved');
  assert.equal(reportApprovalDecision([server],clientId,{...payload,activitySeries:[{from:'2026-10-01',to:'2026-10-07',count:3}]}).kind,'new-version-required');
  assert.equal(reportApprovalDecision([server],clientId,{...payload,sourceId:'different'}).kind,'new-version-required');
});


test('M44: JSONB reordered object keys do not falsely create a new approved report version',()=>{
  const normalized=buildApproveReportDraftCommand({
    ...data('jsonb-order'),reportType:'weekly',
    evidence:[{label:'Sesiones',text:'2',source:'sessionExecutions',quality:'confirmada'}],
    activitySeries:[{from:'2026-10-01',to:'2026-10-07',count:2}],
  },0).payload.patch;
  const asPgJsonb=value=>Array.isArray(value)?value.map(asPgJsonb)
    :value&&typeof value==='object'
      ?Object.fromEntries(Object.entries(value).reverse().map(([key,val])=>[key,asPgJsonb(val)]))
      :value;
  const server={
    id:normalized.id,client_id:clientId,status:'aprobado',revision:2,
    content:asPgJsonb(normalized),
  };
  assert.deepEqual(reportApprovalDecision([server],clientId,normalized),
    {kind:'already-approved',baseRevision:2});
});


test('P1: untyped training notes autosave locally without IRI and never gain remote approval',async()=>{
  const repo=createMemoryEngagementDraftRepository({ownerId:'coach-p1-untyped-no-iri'});
  const clientId='client-p1',id='draft-p1-1';
  const raw={...data(id,'Evolución preliminar sin IRI'),assessmentId:'',reportType:'',
    summary:'Registro pendiente de verificar',reviewAccepted:'off'};
  const saved=prepareLocalReportDraft(raw,{clientId,entityId:id});
  assert.equal(saved.clientId,clientId);
  assert.equal(saved.assessmentId,null);
  assert.equal(saved.reportType,'');
  assert.equal(saved.reviewAccepted,false);
  await repo.save(clientId,reportDraftScope(id),saved);
  const recovered=await restoreReportDraft(repo,clientId,null,id);
  assert.equal(recovered.value.title,'Evolución preliminar sin IRI');
  assert.equal(recovered.value.summary,'Registro pendiente de verificar');
  const rejected={...saved,reviewAccepted:true};
  assert.throws(()=>buildApproveReportDraftCommand(rejected,0),
    /M26_REPORT_DRAFT_INVALID:reportType/u,'A saved preliminary draft is not remotely approvable');
  assert.equal(await restoreReportDraft(repo,'other-client',null,id),null);
});

test('P1: typed training draft remains independent of any initial IRI before and after confirmation',async()=>{
  const clientId='client-p1',id='report-p1-monthly';
  const repo=createMemoryEngagementDraftRepository({ownerId:'coach-p1-training-iri-isolation'});
  const raw={...data(id,'Monthly training'),reportType:'monthly',assessmentId:'iri-old'};
  const saved=prepareLocalReportDraft(raw,{clientId,entityId:id});
  assert.equal(saved.assessmentId,null,'Training report must not inherit its IRI field');
  assert.equal(isStandaloneTrainingReportDraft(saved),true);
  assert.equal(localReportDraftCompatibleWithAssessment(saved,'iri-new'),true);
  await repo.save(clientId,reportDraftScope(id),saved);
  assert.equal((await restoreReportDraft(repo,clientId,'iri-old',id)).value.assessmentId,null);
  assert.equal((await restoreReportDraft(repo,clientId,'iri-new',id)).value.assessmentId,null);
  assert.equal((await restoreReportDraft(repo,clientId,null,id)).value.reportType,'monthly');
  assert.equal(await restoreReportDraft(repo,'foreign',null,id),null);
});

test('P1: no-IRI preliminary drafts survive IRI arrival but foreign IRI drafts stay isolated',async()=>{
  const clientId='client-p1',repo=createMemoryEngagementDraftRepository({ownerId:'coach-p1-iri-arrival'});
  const noIri=prepareLocalReportDraft({...data('before-iri','Draft before assessment'),assessmentId:'',reportType:''},
    {clientId,entityId:'before-iri'});
  await repo.save(clientId,reportDraftScope('before-iri'),noIri);
  assert.equal(localReportDraftCompatibleWithAssessment(noIri,'new-iri'),true);
  assert.equal((await restoreReportDraft(repo,clientId,'new-iri','before-iri')).value.title,'Draft before assessment');
  const bound=prepareLocalReportDraft({...data('iri-bound'),assessmentId:'iri-A',reportType:''},
    {clientId,entityId:'iri-bound'});
  await repo.save(clientId,reportDraftScope('iri-bound'),bound);
  assert.equal(localReportDraftCompatibleWithAssessment(bound,'iri-B'),false);
  assert.rejects(()=>restoreReportDraft(repo,clientId,'iri-B','iri-bound'),/M43_REPORT_DRAFT_IDENTITY_CONFLICT/u);
  assert.equal((await restoreReportDraft(repo,clientId,'iri-A','iri-bound')).value.assessmentId,'iri-A');
});

test('P1: report selection guard cannot silently default to monthly or publish unverified dates',()=>{
  const controller=source('src/m26/app/workflow-controller.js');
  const save=controller.slice(controller.indexOf('  async function saveReportDraft('),controller.indexOf('  function queueReportSave('));
  assert.doesNotMatch(save,/reportType\s*:\s*['"]monthly['"]/u);
  assert.match(controller,/buildApproveReportDraftCommand\(\{id:stableId,\.\.\.content\},0\)/u);
  const workflow=source('src/m26/workflows/report-workflow.js');
  assert.match(workflow,/premium-evidence-stale/u);
  assert.match(workflow,/premiumEvidenceSignature\(candidate\)/u);
});
