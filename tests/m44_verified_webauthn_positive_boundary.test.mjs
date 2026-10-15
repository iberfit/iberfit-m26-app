import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {certifyM44VerifiedAssuranceBoundary} from '../qa/m44/verified-webauthn-readonly.mjs';
test('M44 verified WebAuthn scoped-read proof is wired only into OIDC-controlled Canary Coach browser',async()=>{
 const src=await readFile(new URL('../qa/coach-iri-document-privileged/iri-document-privileged.spec.mjs',import.meta.url),'utf8');
 const workflow=await readFile(new URL('../.github/workflows/coach-webauthn-recurring.yml',import.meta.url),'utf8');
 assert.match(src,/certifyM44VerifiedAssuranceBoundary\(/u);
 assert.match(src,/await loginWithWebAuthn\(page,process\.env\.M26_QA_COACH_EMAIL/);
 assert.match(workflow,/id-token: write/);
 assert.match(workflow,/iberfit-qa-webauthn-cert-broker/);
 assert.match(workflow,/github\.event_name != 'pull_request'/);
});
test('M44 verified scope helper requires a real verified assurance before reaching missing-report boundary',async()=>{
 const requested=[];
 const context={request:{post:async(url,options)=>{
  requested.push({url,body:options.data,origin:options.headers.origin});
  if(url.endsWith('iberfit_privileged_assurance_context_v65d'))
   return {status:()=>200,json:async()=>({iberfitAssurance:'verified',
    privilegedRole:'coach',assuranceMethod:'webauthn'})};
  return {status:()=>403,json:async()=>({message:'M44_PDF_HISTORY_NOT_FOUND'})};
 }}};
 const ok=await certifyM44VerifiedAssuranceBoundary({context,accessToken:'eyJsynthetic-only',
  publishableKey:'sb-publishable-qa-fixture'});
 assert.equal(ok.assurance,'verified');
 assert.equal(ok.mutationsPerformed,false);
 assert.equal(requested.length,2);
 assert.equal(requested[0].origin,'https://m26-canary.iberfit.cl');
 assert.deepEqual(requested[1].body,{p_report_id:'0d000000-0000-4000-8000-000000000044'});
});
test('M44 verified scope helper refuses unverified privileged session without touching report scope',async()=>{
 let attempts=0;
 const context={request:{post:async()=>{
  attempts++;
  return {status:()=>200,json:async()=>({
   iberfitAssurance:'required',privilegedRole:'coach',assuranceMethod:null,
  })};
 }}};
 await assert.rejects(certifyM44VerifiedAssuranceBoundary({
  context,accessToken:'eyJsynthetic',publishableKey:'sb-publishable-qa-fixture',
 }),/POSITIVE_VERIFIED_ASSURANCE_NOT_ESTABLISHED/);
 assert.equal(attempts,1);
});
