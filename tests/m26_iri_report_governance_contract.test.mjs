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

test('emission broker uses current Cloudflare PDF API contract without unsupported actionTimeout',()=>{
  const source=fs.readFileSync(new URL('../supabase/functions/iberfit-iri-report-emission-v1/index.ts',import.meta.url),'utf8');
  assert.match(source,/browser-rendering\/pdf/u);
  assert.match(source,/pdfOptions:\s*\{/u);
  assert.ok(source.includes("waitForSelector:{selector:"));
  assert.match(source,/preferCSSPageSize:true/u);
  assert.match(source,/printBackground:true/u);
  assert.match(source,/tagged:true/u);
  assert.match(source,/outline:true/u);
  assert.doesNotMatch(source,/actionTimeout/u);
  assert.doesNotMatch(source,/\.\.\/\.\.\/\.\.\/src\/m26\//u);
  assert.match(source,/\.\/vendor\/workflows\/iri-report-document\.js/u);
  assert.match(source,/artifact_sha256/u);
  assert.match(source,/source_sha256/u);
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

test('QA real-write gate deploys and certifies the exact report broker',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/qa-real-write-cert.yml',import.meta.url),'utf8');
  const gate=fs.readFileSync(new URL('../scripts/remote-gates/run_qa_iri_report_emission_gate.mjs',import.meta.url),'utf8');
  assert.match(workflow,/supabase@2\.117\.0 functions deploy iberfit-iri-report-emission-v1/u);
  assert.match(workflow,/CLOUDFLARE_BROWSER_API_TOKEN/u);
  assert.match(workflow,/run_qa_iri_report_emission_gate\.mjs/u);
  assert.match(gate,/IRI_REPORT_QA_PDF_MAGIC_INVALID/u);
  assert.match(gate,/clientHistoryPrivateMetadataHidden:true/u);
  assert.match(gate,/withdrawalRequiresPrivilegedAssurance:true/u);
});
