import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldCertifyIriReport,shouldDeployIriBrokers,detectIriImpact,IRI_CERTIFICATION_PATHS,IRI_BROKER_DEPLOY_PATHS} from '../scripts/remote-gates/qa_iri_emission_impact_gate.mjs';
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
test('IRI workflow changes still certify but never redeploy unchanged Edge Function code',()=>{
 for(const file of [
  '.github/workflows/qa-real-write-cert.yml',
  'scripts/remote-gates/qa_iri_emission_impact_gate.mjs',
  'src/m26/workflows/iri-external-report-controller.js',
  'src/m26/app/application.js',
  'supabase/qa-migrations/some_iri_change.sql',
  'tests/m26_qa_iri_emission_impact_contract.test.mjs',
 ]){
  assert.equal(shouldCertifyIriReport([file]),true,file);
  assert.equal(shouldDeployIriBrokers([file]),false,file);
 }
 for(const file of [
   'supabase/functions/iberfit-iri-report-emission-v1/index.ts',
   'supabase/functions/iberfit-iri-report-emission-v1/vendor/workflows/iri-evidence-engine.js',
   'supabase/functions/iberfit-qa-iri-document-fixture/index.ts',
   'supabase/config.toml',
 ]){
   assert.equal(shouldDeployIriBrokers([file]),true,file);
   assert.equal(shouldCertifyIriReport([file]),true,file);
 }
 assert.equal(IRI_BROKER_DEPLOY_PATHS.length,3);
 assert.equal(shouldDeployIriBrokers([]),true,'unknown diff fails closed');
 assert.equal(shouldDeployIriBrokers(null),true,'no proof fails closed');
 assert.equal(shouldDeployIriBrokers(['docs/README.md'],'workflow_dispatch'),true);
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
test('Local exact-sha diff controls emission without extra GitHub or Supabase requests',()=>{
 const base='1'.repeat(40),head='2'.repeat(40),env={QA_IRI_EVENT_NAME:'push',QA_IRI_BASE_SHA:base,GITHUB_SHA:head};
 const seen=[];
 const git=(_command,args)=>{seen.push(args);return args[0]==='diff'?Buffer.from('src/m26/command-bus.js\\0'):Buffer.alloc(0);};
 const result=detectIriImpact({env,git});
 assert.equal(result.run,false);
 assert.equal(result.deploy,false);
 assert.equal(result.reason,'scoped-git-diff');
 assert.deepEqual(seen.map(a=>a[0]),['cat-file','diff']);
 assert.ok(!seen.some(a=>a.includes('fetch')));
 const other=detectIriImpact({env,git:(_command,args)=>args[0]==='diff'?Buffer.from('supabase/migrations/new.sql\\0'):Buffer.alloc(0)});
 assert.equal(other.run,true);
 assert.equal(other.deploy,false,'SQL migration recertifies but does not redeploy unchanged functions');
 const workflow=detectIriImpact({env,git:(_command,args)=>args[0]==='diff'
    ?Buffer.from('.github/workflows/qa-real-write-cert.yml\0')
    :Buffer.alloc(0)});
 assert.equal(workflow.run,true);
 assert.equal(workflow.deploy,false,'workflow-only changes never force a function redeploy');
 const fn=detectIriImpact({env,git:(_command,args)=>args[0]==='diff'
    ?Buffer.from('supabase/functions/iberfit-qa-iri-document-fixture/index.ts\0')
    :Buffer.alloc(0)});
 assert.equal(fn.run,true);
 assert.equal(fn.deploy,true);
});
test('QA write/persist gate unconditionally runs, but report emission has exactly four guarded steps',()=>{
 assert.match(job,/name: Execute controlled QA write and certify persistence isolation and role boundaries\s*\n\s*env:/u);
 assert.match(job,/run: node scripts\/remote-gates\/run_qa_real_write_gate\.mjs/u);
 assert.match(impact,/id: iri-impact/u);
 assert.match(impact,/QA_IRI_BASE_SHA:/u);
 assert.match(job,/fetch-depth: 2/u);
 assert.match(impact,/run: node scripts\/remote-gates\/qa_iri_emission_impact_gate\.mjs/u);
 for(const name of [
  'Prepare synthetic private IRI document fixture',
  'Seed synthetic bioimpedance annex through QA OIDC boundary',
  'Certify immutable IRI PDF emission end to end in QA'
 ]){
  assert.match(job,new RegExp('- name: '+name+'\\n\\s*if: \\$\\{\\{ steps\\.iri-impact\\.outputs\\.run_iri == \'true\' \\}\\}','u'));
 }
 assert.equal(job.split("steps.iri-impact.outputs.run_iri == 'true'").length-1,3);
 assert.equal(job.split("steps.iri-impact.outputs.deploy_iri == 'true'").length-1,1);
 assert.match(job,/name: Deploy exact QA IRI report brokers[\s\S]*?if: \$\{\{ steps\.iri-impact\.outputs\.deploy_iri == 'true' \}\}/u);
 assert.match(job,/name: Preserve minimised write evidence\s*\n\s*if: always\(\)/u);
 assert.match(job,/environment: m26-canary-readonly/u);
 assert.match(job,/group: iberfit-qa-shared-auth-readonly/u);
});
