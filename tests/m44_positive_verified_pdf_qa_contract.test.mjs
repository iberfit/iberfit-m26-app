import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const path='../qa/m44/positive-webauthn-issued-pdf.mjs';
const content=()=>readFile(new URL(path,import.meta.url),'utf8');
test('M44 positive official PDF QA gate is restricted to trusted Canary push and synthetic client',async()=>{
 const s=await content();
 for(const token of ["M26_QA_ONLY","M26_PROJECT_REF","GITHUB_REF_NAME",
  "GITHUB_EVENT_NAME","M26_QA_M44_POSITIVE_CERT","M44_QA_WEBAUTHN_PROOF_REQUIRED",
  "57f56a87-d04e-47d5-b1cc-8d4939d7c804"])
  assert.ok(s.includes(token),'guard absent: '+token);
 assert.doesNotMatch(s,/pjhmrhejsoofmouedavw|app\.iberfit\.cl/);
});
test('M44 positive QA gate covers real report lifecycle, idempotent issuance and cryptographic storage delivery',async()=>{
 const s=await content();
 for(const token of ["buildApproveReportDraftCommand","buildPublicationCommand",
  "iberfit_m44_create_report_draft_v1","iberfit_execute_command_v26",
  "action:'download'","createHash('sha256')","edge('issue'",
  "edge('withdraw'","edge('history'","edge('latest'","M44_QA_WITHDRAWN_PDF_LEAK"])
  assert.ok(s.includes(token),token);
 assert.match(s,/finally\s*\{/);
 assert.match(s,/reason:'Certificación sintética QA concluida'/);
 assert.doesNotMatch(s,/storage\.from\(|service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
