import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldCertifyIriReport,detectIriImpact,IRI_CERTIFICATION_PATHS} from '../scripts/remote-gates/qa_iri_emission_impact_gate.mjs';
const w=readFileSync('.github/workflows/qa-real-write-cert.yml','utf8');
const job=w.split('  qa-real-write:')[1]?.split('  m43-real-coach-client-qa:')[0]||'';
const impact=job.split('      - name: Determine whether immutable QA IRI PDF emission needs recertification')[1]?.split('      - name: Deploy exact QA IRI report brokers')[0]||'';
test('Always certify IRI on report changes, SQL changes, security changes, or manual dispatch',()=>{
 for(const f of [
  'supabase/functions/iberfit-iri-report-emission-v1/index.ts',
  'supabase/qa-migrations/20260101_report.sql',
  'supabase/migrations/20261030_grants.sql',
  'src/m26/workflows/iri-external-report-controller.js',
  'src/m26/security/role-projection.js',
  '.github/workflows/qa-real-write-cert.yml',
  'scripts/remote-gates/run_qa_iri_report_emission_gate.mjs'
 ])assert.equal(shouldCertifyIriReport([f]),true,f);
 assert.equal(shouldCertifyIriReport(['docs/README.md'],'workflow_dispatch'),true);
 assert.equal(shouldCertifyIriReport([]),true);
 assert.equal(shouldCertifyIriReport(null),true);
});
test('Unrelated QA writes preserve QA real write without generating redundant PDFs',()=>{
 for(const f of [
  'src/m26/command-bus.js',
  'qa/rc64/m43-client-interactive.spec.mjs',
  'scripts/remote-gates/run_qa_real_write_gate.mjs',
  'playwright.m43-interactive-client.config.mjs'
 ])assert.equal(shouldCertifyIriReport([f]),false,f);
 assert.equal(shouldCertifyIriReport(['docs/NOTICE.md','src/m26/command-bus.js']),false);
 assert.equal(shouldCertifyIriReport(['src/m26/command-bus.js','supabase/migrations/new.sql']),true);
 assert.ok(IRI_CERTIFICATION_PATHS.length>=12);
});
test('Unknown environment or failed git diff forces a real IRI certification',()=>{
 assert.equal(detectIriImpact({env:{QA_IRI_EVENT_NAME:'pull_request',QA_IRI_BASE_SHA:'bad',GITHUB_SHA:'bad'},git:()=>{throw Error('unexpected');}}).run,true);
 assert.equal(detectIriImpact({env:{QA_IRI_EVENT_NAME:'push',QA_IRI_BASE_SHA:'1'.repeat(40),GITHUB_SHA:'2'.repeat(40)},git:()=>{throw Error('network');}}).run,true);
 assert.equal(detectIriImpact({env:{QA_IRI_EVENT_NAME:'workflow_dispatch'},git:()=>{throw Error('manual');}}).run,true);
});
test('QA write/persist gate unconditionally runs, but report emission has exactly four guarded steps',()=>{
 assert.match(job,/name: Execute controlled QA write and certify persistence isolation and role boundaries\s*\n\s*env:/u);
 assert.match(job,/run: node scripts\/remote-gates\/run_qa_real_write_gate\.mjs/u);
 assert.match(impact,/id: iri-impact/u);
 assert.match(impact,/QA_IRI_BASE_SHA:/u);
 assert.match(impact,/run: node scripts\/remote-gates\/qa_iri_emission_impact_gate\.mjs/u);
 for(const name of [
  'Deploy exact QA IRI report brokers',
  'Prepare synthetic private IRI document fixture',
  'Seed synthetic bioimpedance annex through QA OIDC boundary',
  'Certify immutable IRI PDF emission end to end in QA'
 ]){
  assert.match(job,new RegExp('- name: '+name+'\\n\\s*if: \\$\\{\\{ steps\\.iri-impact\\.outputs\\.run_iri == \'true\' \\}\\}','u'));
 }
 assert.equal(job.split("steps.iri-impact.outputs.run_iri == 'true'").length-1,4);
 assert.match(job,/name: Preserve minimised write evidence\s*\n\s*if: always\(\)/u);
 assert.match(job,/environment: m26-canary-readonly/u);
 assert.match(job,/group: iberfit-qa-shared-auth-readonly/u);
});
