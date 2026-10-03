import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createIriReportGovernanceService,IRI_REPORT_EMISSION_FUNCTION} from '../src/m26/workflows/iri-external-report-controller.js';

const QA_RUNTIME=Object.freeze({
  enabled:true,
  qaOnly:true,
  projectRef:'gjztkdwfmunnzhtvxrsu',
  url:'https://gjztkdwfmunnzhtvxrsu.supabase.co',
  publishableKey:'test-publishable-key',
  version:'test',
});

test('IRI report governance uses a dedicated authenticated emission broker',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify({
      ok:true,
      issuanceId:'11111111-1111-4111-8111-111111111111',
      documentId:'22222222-2222-4222-8222-222222222222',
      assessmentId:'33333333-3333-4333-8333-333333333333',
      audience:'cliente',
      version:1,
      artifactSha256:'a'.repeat(64),
      sourceSha256:'b'.repeat(64),
      signedUrl:'https://gjztkdwfmunnzhtvxrsu.supabase.co/storage/v1/object/sign/iberfit-iri-issued-reports/x?token=signed',
      expiresIn:120,
    }),{status:200,headers:{'content-type':'application/json'}});
  };
  const service=createIriReportGovernanceService({runtime:QA_RUNTIME,fetchImpl});
  const result=await service.issue('token',{assessmentId:'33333333-3333-4333-8333-333333333333',audience:'client'});
  assert.equal(result.version,1);
  assert.equal(result.audience,'cliente');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,`https://gjztkdwfmunnzhtvxrsu.supabase.co${IRI_REPORT_EMISSION_FUNCTION}`);
  assert.match(String(calls[0].options.headers.authorization),/^Bearer /u);
  assert.deepEqual(JSON.parse(calls[0].options.body),{
    action:'issue',
    assessmentId:'33333333-3333-4333-8333-333333333333',
    audience:'cliente',
  });
});

test('IRI report governance rejects signed URLs outside the active Supabase project',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({
    ok:true,
    issuanceId:'11111111-1111-4111-8111-111111111111',
    documentId:'22222222-2222-4222-8222-222222222222',
    assessmentId:'33333333-3333-4333-8333-333333333333',
    audience:'cliente',
    version:1,
    artifactSha256:'a'.repeat(64),
    sourceSha256:'b'.repeat(64),
    signedUrl:'https://evil.example/report.pdf',
    expiresIn:120,
  }),{status:200,headers:{'content-type':'application/json'}});
  const service=createIriReportGovernanceService({runtime:QA_RUNTIME,fetchImpl});
  await assert.rejects(
    ()=>service.issue('token',{assessmentId:'33333333-3333-4333-8333-333333333333',audience:'client'}),
    /M26_IRI_REPORT_SIGNED_URL_INVALID/u,
  );
});

test('IRI report history never invents privileged fields for client-safe payloads',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({
    ok:true,
    assessmentId:'33333333-3333-4333-8333-333333333333',
    manager:false,
    items:[{
      issuanceId:'11111111-1111-4111-8111-111111111111',
      documentId:'22222222-2222-4222-8222-222222222222',
      assessmentId:'33333333-3333-4333-8333-333333333333',
      audience:'cliente',
      version:2,
      templateVersion:'m26-iri-report-premium-v2',
      engineVersion:'iri-document-governance-2026.10-v1',
      sourceRevision:9,
      artifactSha256:null,
      artifactSizeBytes:12000,
      issuedBy:null,
      issuedAt:'2026-10-03T20:00:00Z',
      withdrawn:false,
      sourceSnapshot:{mustNeverReachBrowser:true},
    }],
  }),{status:200,headers:{'content-type':'application/json'}});
  const service=createIriReportGovernanceService({runtime:QA_RUNTIME,fetchImpl});
  const history=await service.history('token',{assessmentId:'33333333-3333-4333-8333-333333333333'});
  assert.equal(history.manager,false);
  assert.equal(history.items[0].artifactSha256,null);
  assert.equal('sourceSnapshot' in history.items[0],false);
});

test('document-governance migration creates final client-safe immutable state without destructive migration SQL',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20261003213000_iri_document_governance_v1.sql',import.meta.url),'utf8');
  assert.doesNotMatch(sql,/iri_report_issuance_read_client_v1/u);
  assert.doesNotMatch(sql,/iri_issued_object_read_client_v1/u);
  assert.doesNotMatch(sql,/\\bDROP\\s+POLICY\\b/iu);
  assert.doesNotMatch(sql,/\\bDROP\\s+TRIGGER\\b/iu);
  assert.doesNotMatch(sql,/\\bDO\\s+\\$/iu);
  assert.match(sql,/iri_report_issuance_append_only_v2/u);
  assert.match(sql,/iri_report_withdrawal_append_only_v2/u);
  assert.match(sql,/iri_guard_issued_storage_object_v2/u);
  assert.match(sql,/iberfit_iri_report_history_v1/u);
  assert.match(sql,/iberfit_authorize_iri_report_artifact_v1/u);
  assert.doesNotMatch(sql,/grant select on public\.iri_report_issuances_v1 to anon/iu);
});

test('server report renderer is decoupled from browser-only external-report controller',()=>{
  const source=fs.readFileSync(new URL('../src/m26/workflows/iri-report-document.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/iri-external-report-controller\.js/u);
  assert.match(source,/function iriExternalReportAppUrl/u);
  assert.match(source,/issuedArtifactAnnex/u);
});

test('emission broker renders immutable PDFs inside Supabase with IBERFIT tokens',()=>{
  const source=fs.readFileSync(new URL('../supabase/functions/iberfit-iri-report-emission-v1/index.ts',import.meta.url),'utf8');
  assert.match(source,/PDFDocument,StandardFonts,rgb/u);
  assert.match(source,/pdf-lib\/deterministic-v1/u);
  assert.match(source,/scoreIriPerformance/u);
  assert.match(source,/firstSessionCompletion/u);
  assert.match(source,/forest|PDF_C/u);
  assert.match(source,/197\/255,160\/255,89\/255/u);
  assert.match(source,/245\/255,245\/255,240\/255/u);
  assert.match(source,/Fotogrametría/u);
  assert.match(source,/Bioimpedancia original/u);
  assert.doesNotMatch(source,/browser-rendering\/pdf/u);
  assert.doesNotMatch(source,/cloudflare-browser-run/u);
  assert.doesNotMatch(source,/IBERFIT_IRI_RENDERER_/u);
  assert.doesNotMatch(source,/buildIriReportHtml/u);
  assert.doesNotMatch(source,/\.\.\/\.\.\/\.\.\/src\/m26\//u);
  assert.match(source,/artifact_sha256/u);
  assert.match(source,/source_sha256/u);
  assert.match(source,/assessmentMeta\?\.protocolVersion/u);
  assert.match(source,/assessmentMeta\?\.completedAt/u);
  assert.match(source,/fonts\.brandMark/u);
  assert.match(source,/pdfStrengthVariant/u);
  assert.match(source,/pdfPhotoMeasurementRows/u);
  assert.match(source,/buildIriPhotogrammetryDecisionSupport/u);
  assert.match(source,/decisionSupportAvailable/u);
  assert.match(source,/iri-evidence-engine\.js/u);
  assert.match(source,/Lectura para entrenamiento/u);
  assert.match(source,/sectionIndex\(\),'Bioimpedancia original'/u);
  assert.doesNotMatch(source,/audience==='cliente'\?'05':'06'/u);
  assert.match(source,/iberfit-signature-carlos\.svg/u);
  assert.match(source,/drawSvgPath\(signaturePath/u);
  assert.match(source,/signatureEligible/u);
});
test('UI separates preview from immutable emission',()=>{
  const route=fs.readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const controller=fs.readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  assert.match(route,/Vista previa Cliente/u);
  assert.match(route,/Emitir y archivar Cliente/u);
  assert.match(route,/data-iri-issued-history/u);
  assert.match(controller,/issue-client-iri-report/u);
  assert.match(controller,/withdraw-issued-iri-report/u);
  assert.match(controller,/Documento emitido y archivado como versión/u);
});


test('report governance reuses the existing report controller module so PWA shell does not grow',()=>{
  const app=fs.readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const controller=fs.readFileSync(new URL('../src/m26/workflows/iri-external-report-controller.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/iri-report-governance-service\.js/u);
  assert.match(controller,/export function createIriReportGovernanceService/u);
});


test('issuance authorization is low-friction but withdrawal remains privileged',()=>{
  const issueAuth=fs.readFileSync(new URL('../supabase/migrations/20261003214500_iri_document_governance_issue_auth_v2.sql',import.meta.url),'utf8');
  const base=fs.readFileSync(new URL('../supabase/migrations/20261003213000_iri_document_governance_v1.sql',import.meta.url),'utf8');
  assert.doesNotMatch(issueAuth,/require_privileged_assurance/u);
  assert.match(base,/create or replace function public\.iberfit_withdraw_iri_report_issue_v1/u);
  assert.match(base,/perform public\.iberfit_require_privileged_assurance_v65d\(\)/u);
});

test('QA real-write gate deploys and certifies the exact self-contained report broker',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/qa-real-write-cert.yml',import.meta.url),'utf8');
  const gate=fs.readFileSync(new URL('../scripts/remote-gates/run_qa_iri_report_emission_gate.mjs',import.meta.url),'utf8');
  assert.match(workflow,/supabase@2\.117\.0 functions deploy iberfit-iri-report-emission-v1/u);
  assert.doesNotMatch(workflow,/CLOUDFLARE_/u);
  assert.doesNotMatch(workflow,/IRI_RENDERER_/u);
  assert.doesNotMatch(workflow,/workers\/scripts/u);
  assert.match(workflow,/run_qa_iri_report_emission_gate\.mjs/u);
  assert.match(workflow,/prepare_qa_iri_document_fixture\.mjs/u);
  assert.match(workflow,/qa-fixture-evidence\.json/u);
  assert.match(workflow,/iberfit-qa-iri-document-fixture/u);
  assert.match(workflow,/id-token: write/u);
  assert.match(workflow,/qa-bioimpedance-fixture-evidence\.json/u);
  assert.match(gate,/IRI_REPORT_QA_PDF_MAGIC_INVALID/u);
  assert.match(gate,/clientHistoryPrivateMetadataHidden:true/u);
  assert.match(gate,/withdrawalRequiresPrivilegedAssurance:true/u);
  assert.match(workflow,/qa-issued-report\.pdf/u);
  assert.match(workflow,/qa-issued-client\.pdf/u);
  assert.match(workflow,/qa-issued-coach\.pdf/u);
  assert.match(gate,/fs\.writeFileSync\(pdfEvidencePath,pdfBytes\)/u);
});


test('production promotion deploys the exact self-contained IRI report broker',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/production-promote.yml',import.meta.url),'utf8');
  assert.match(workflow,/Deploy exact IRI report broker to production/u);
  assert.match(workflow,/supabase@2\.117\.0 functions deploy iberfit-iri-report-emission-v1/u);
  assert.ok(workflow.includes('--project-ref "${PROD_SUPABASE_REF}"'));
  assert.match(workflow,/supabase@2\.117\.0 functions list/u);
  assert.doesNotMatch(workflow,/IBERFIT_IRI_RENDERER_/u);
  assert.doesNotMatch(workflow,/iberfit-qa-iri-document-fixture/u);
});

test('QA bioimpedance fixture broker is OIDC-bound and synthetic-only',()=>{
  const broker=fs.readFileSync(new URL('../supabase/functions/iberfit-qa-iri-document-fixture/index.ts',import.meta.url),'utf8');
  assert.match(broker,/const QA_REF="gjztkdwfmunnzhtvxrsu"/u);
  assert.match(broker,/OIDC_AUDIENCE="iberfit-iri-document-qa-fixture"/u);
  assert.match(broker,/EXPECTED_WORKFLOW_PATH="iberfit\/iberfit-m26-app\/\.github\/workflows\/qa-real-write-cert\.yml"/u);
  assert.match(broker,/ASSESSMENT_ID="7a000000-0000-4000-8000-000000000001"/u);
  assert.match(broker,/CLIENT_ID="57f56a87-d04e-47d5-b1cc-8d4939d7c804"/u);
  assert.match(broker,/FILE_NAME="qa-bioimpedancia-sintetica\.pdf"/u);
  assert.match(broker,/realPersonData:false/u);
  assert.match(broker,/fixture sint/u);
  assert.doesNotMatch(broker,/pjhmrhejsoofmouedavw/u);
});


test('IRI user-facing protocol labels and issued traceability stay in natural Spanish',()=>{
  const catalog=fs.readFileSync(new URL('../src/m26/workflows/iri-protocol-catalog.js',import.meta.url),'utf8');
  const vendor=fs.readFileSync(new URL('../supabase/functions/iberfit-iri-report-emission-v1/vendor/workflows/iri-protocol-catalog.js',import.meta.url),'utf8');
  const renderer=fs.readFileSync(new URL('../supabase/functions/iberfit-iri-report-emission-v1/index.ts',import.meta.url),'utf8');
  for(const source of [catalog,vendor]){
    assert.match(source,/Suelo\/colchoneta · referencia inicial adaptada/u);
    assert.match(source,/Adaptada · 60 s · referencia individual/u);
    assert.doesNotMatch(source,/label:'[^']*baseline/iu);
  }
  assert.match(renderer,/iriProtocolById/u);
  assert.match(renderer,/function pdfProtocolSide/u);
  assert.match(renderer,/function pdfProtocolVariant/u);
  assert.doesNotMatch(renderer,/record\?\.variant&&'variante '\+record\.variant/u);
  assert.match(renderer,/Privacidad de las imágenes/u);
  assert.match(renderer,/permiso específico para publicarlas en el documento Cliente/u);
});

test('QA document fixture enriches only the fixed synthetic assessment idempotently',()=>{
  const broker=fs.readFileSync(new URL('../supabase/functions/iberfit-qa-iri-document-fixture/index.ts',import.meta.url),'utf8');
  assert.match(broker,/function enrichedSections/u);
  assert.match(broker,/async function enrichAssessmentFixture/u);
  assert.match(broker,/\.eq\("id",ASSESSMENT_ID\)\.eq\("revision",currentRevision\)/u);
  assert.match(broker,/assessmentFixtureChanged/u);
  assert.match(broker,/priorityRecords/u);
  assert.match(broker,/protocolRecords/u);
  assert.match(broker,/Fixture sintética QA/u);
  assert.doesNotMatch(broker,/pjhmrhejsoofmouedavw/u);
});

test('bioimpedance annex divider distinguishes original evidence from IRI interpretation',()=>{
  const renderer=fs.readFileSync(new URL('../supabase/functions/iberfit-iri-report-emission-v1/index.ts',import.meta.url),'utf8');
  assert.match(renderer,/FORMATO ORIGINAL/u);
  assert.match(renderer,/TRATAMIENTO DOCUMENTAL/u);
  assert.match(renderer,/Evidencia complementaria/u);
  assert.match(renderer,/no inventa métricas a partir de esta hoja/u);
});
