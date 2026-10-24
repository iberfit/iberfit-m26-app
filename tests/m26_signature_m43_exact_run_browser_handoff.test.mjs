import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {m43QaRunMarkers} from '../scripts/remote-gates/m43-qa-fixture-safety.mjs';

const writer=readFileSync(new URL('../scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs',import.meta.url),'utf8');
const browser=readFileSync(new URL('../qa/rc64/m43-client-real-history.spec.mjs',import.meta.url),'utf8');
const interactive=readFileSync(new URL('../qa/rc64/m43-client-interactive.spec.mjs',import.meta.url),'utf8');
const policy=readFileSync(new URL('../qa/rc64/secure-current-source-auth.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/qa-real-write-cert.yml',import.meta.url),'utf8');

test('M43 identity is unique for both run and attempt and labels all related fixtures',()=>{
  const current=m43QaRunMarkers({runId:'39545369987',attempt:'1'});
  const otherRun=m43QaRunMarkers({runId:'39545369988',attempt:'1'});
  const nextAttempt=m43QaRunMarkers({runId:'39545369987',attempt:'2'});
  assert.equal(current.sessionTitle,'IBERFIT QA M43 · multideporte · run-39545369987-a1');
  for(const key of ['sessionTitle','interactiveSessionTitle','publishedCycleTitle','unpublishedCycleTitle']){
    assert.match(current[key],/run-39545369987-a1$/u);
    assert.notEqual(current[key],otherRun[key]);
    assert.notEqual(current[key],nextAttempt[key]);
  }
  assert.equal(Object.isFrozen(current),true);
});

test('M43 identity fails closed without trusted CI run provenance',()=>{
  for(const values of [
    {},{runId:'1'},{runId:'1',attempt:''},{runId:'',attempt:'1'},
    {runId:'0',attempt:'1'},{runId:'1',attempt:'0'},
    {runId:'abc',attempt:'1'},{runId:'1;drop',attempt:'1'},
    {runId:'1',attempt:'2abc'},{runId:'1',attempt:'10000'},
  ])assert.throws(()=>m43QaRunMarkers(values),/M43_QA_RUN_PROVENANCE_MISSING_OR_INVALID/u);
});

test('M43 real backend writer and Client browser share exact CI run and attempt',()=>{
  assert.match(writer,/runId:process\.env\.GITHUB_RUN_ID/u);
  assert.match(writer,/attempt:process\.env\.GITHUB_RUN_ATTEMPT/u);
  for(const source of [browser,interactive]){
    assert.match(source,/runId:process\.env\.GITHUB_RUN_ID/u);
    assert.match(source,/attempt:WRITER_ATTEMPT\|\|process\.env\.GITHUB_RUN_ATTEMPT/u);
    assert.match(source,/M43_QA_WRITER_ATTESTATION_REQUIRED/u);
    assert.match(source,/m43QaRunMarkers\(/u);
  }
  assert.match(workflow,/m43-writer-handoff\.mjs verify/u);
  assert.match(writer,/title:RUN_MARKERS\.sessionTitle/u);
  assert.match(writer,/RUN_MARKERS\.publishedCycleTitle/u);
  assert.match(writer,/RUN_MARKERS\.unpublishedCycleTitle/u);
  assert.match(browser,/const LIVE_MARKER=m43QaRunMarkers\(/u);
  assert.match(browser,/publishedCards\.filter\(\{hasText:LIVE_MARKER\}\)/u);
  assert.match(browser,/history\.locator\('\[data-m43-completed-session\]'\)\.filter\(\{hasText:LIVE_MARKER\}\)/u);
  assert.match(browser,/await expect\(completed,'Exact current-run completion must render only once'\)\.toHaveCount\(1\)/u);
  assert.match(browser,/await expect\(completed\)\.toContainText\('3 registros'\)/u);
  assert.match(browser,/Completed current-run session must not remain startable/u);
  assert.match(browser,/planning\.locator\('article'\)\.filter\(\{hasText:LIVE_MARKER\}\)/u);
  assert.match(browser,/The completed exact-run session must not remain in upcoming planning/u);
  assert.doesNotMatch(browser,/getByText\('IBERFIT QA M43 · multideporte'/u);
});

test('U34 interactive QA requires exact synthetic run fixture, scoped server commands and real buttons',()=>{
  assert.match(writer,/title:RUN_MARKERS\.interactiveSessionTitle/u);
  assert.match(writer,/check\(budget\.count<=budget\.limit-2/u);
  assert.match(writer,/INTERACTIVE_SESSION_ATOMIC_ENABLEMENT/u);
  assert.match(writer,/INTERACTIVE_SESSION_FOREIGN_PRIVATE/u);
  assert.match(interactive,/m43QaRunMarkers\(\{runId:process\.env\.GITHUB_RUN_ID,attempt:WRITER_ATTEMPT\|\|process\.env\.GITHUB_RUN_ATTEMPT\}\)/u);
  assert.match(interactive,/\.interactiveSessionTitle/u);
  assert.match(interactive,/allowQaSyntheticWrite:allowExactSyntheticWrite/u);
  assert.match(interactive,/data-workflow-action="start-published-session"/u);
  for(const action of ['start','pause','resume','complete-set','next','finish','exit-session'])
    assert.ok(interactive.includes('data-session-action="'+action+'"'),action+' real button required');
  assert.match(interactive,/Completed workout must reach real Client history exactly once/u);
  assert.match(interactive,/EJECUCION_COMPLETAR/u);
  assert.match(policy,/allowQaSyntheticWrite=\(\)=>false/u);
  assert.match(policy,/\['iberfit_command_preflight_v26','iberfit_execute_command_v26'\]/u);
  assert.match(workflow,/npx playwright test --config playwright\.m43-interactive-client\.config\.mjs/u);
});
