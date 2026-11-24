import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('authenticated interaction always releases the real QA browser lease before fixture teardown',()=>{
 const source=readFileSync('qa/rc64/authenticated-interaction.spec.mjs','utf8');
 assert.match(source,/test\.afterEach\(async\(\{page\},testInfo\)=>\{[\s\S]*?releaseQaSessionBeforeContextClose\(page\)/u);
 assert.match(source,/if\(testInfo\.status==='passed'\)expect\(cleanup\)\.toBe\('released'\)/u);
});
test('client DELETE denial gate releases only verified fixture tokens without changing the negative ACL assertion',()=>{
 const source=readFileSync('scripts/remote-gates/qa_client_delete_acl_denial.mjs','utf8');
 assert.match(source,/qaLease\.track\(r\.payload,email\)/u);
 assert.match(source,/await runQaStageWithCleanup\(runDenial,qaLease\.release/u);
 assert.match(source,/r\.status!==403\|\|r\.payload\?\.code!=='42501'/u);
 assert.doesNotMatch(source,/scope=global|sb_secret_|pjhmrhejsoofmouedavw/u);
});

test('IRI fixture and immutable emission gates fence QA scope and release only current-run credentials',()=>{
 for(const [file,stage] of [
  ['scripts/remote-gates/prepare_qa_iri_document_fixture.mjs','runFixture'],
  ['scripts/remote-gates/run_qa_iri_report_emission_gate.mjs','runEmission'],
 ]){
  const source=readFileSync(file,'utf8');
  assert.match(source,/createQaAuthLease\(\{[\s\S]*?projectRef:process\.env\.M26_PROJECT_REF,qaOnly:process\.env\.M26_QA_ONLY/u);
  assert.match(source,/qaLease\.track\(body,/u);
  assert.match(source,new RegExp('await runQaStageWithCleanup\\('+stage+',qaLease\\.release','u'));
  assert.doesNotMatch(source,/scope=global|pjhmrhejsoofmouedavw/u);
 }
 const emission=readFileSync('scripts/remote-gates/run_qa_iri_report_emission_gate.mjs','utf8');
 assert.match(emission,/const coach=await login\([\s\S]*?const client=await login\(/u);
 assert.match(emission,/clientHistoryPrivateMetadataHidden:true/u);
 assert.match(emission,/withdrawalRequiresPrivilegedAssurance:true/u);
 const workflow=readFileSync('.github/workflows/qa-real-write-cert.yml','utf8');
 for(const name of ['Prepare synthetic private IRI document fixture','Certify immutable IRI PDF emission end to end in QA']){
  const block=workflow.slice(workflow.indexOf('- name: '+name)).split(/\n      - name:/u)[0];
  assert.match(block,/M26_PROJECT_REF: gjztkdwfmunnzhtvxrsu/u);
  assert.match(block,/M26_QA_ONLY: 'true'/u);
  assert.match(block,/steps\.iri-impact\.outputs\.run_iri == 'true'/u);
 }
});
