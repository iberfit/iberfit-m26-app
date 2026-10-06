import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('authenticated QA captures device-specific time to interactive without storing credentials',async()=>{
  const qa=await readFile(new URL('../qa/rc64/authenticated-interaction.spec.mjs',import.meta.url),'utf8');
  assert.match(qa,/import \{performance\} from 'node:perf_hooks'/u);
  assert.match(qa,/const navigationStartMs=performance\.now\(\)/u);
  assert.match(qa,/const credentialSubmitStartMs=performance\.now\(\)/u);
  assert.match(qa,/credentialSubmitToShellMs=performance\.now\(\)-credentialSubmitStartMs/u);
  assert.match(qa,/credentialSubmitToInteractiveMs=performance\.now\(\)-credentialSubmitStartMs/u);
  assert.match(qa,/await expect\(page\.locator\('\[data-m26-interactive="ready"\]'\)\)\.toHaveCount\(1/u);
  assert.match(qa,/iberfit\.qa\.auth-client-interactive-latency\.v1/u);
  assert.match(qa,/\$\{safeSlug\(testInfo\.project\.name\)\}-auth-latency\.json/u);
  const start=qa.indexOf('  const latencyEvidence={');
  const end=qa.indexOf('  await writeFile(',start);
  assert.ok(start>=0&&end>start);
  const evidence=qa.slice(start,end);
  assert.match(evidence,/environment:'canary-qa-only'/u);
  assert.match(evidence,/productionBenchmark:false/u);
  assert.match(evidence,/mutationsPerformed:false/u);
  assert.match(evidence,/Math\.round\(credentialSubmitToInteractiveMs\)/u);
  assert.doesNotMatch(evidence,/M26_QA_CLIENT_B_EMAIL|M26_QA_CLIENT_B_PASSWORD|\.token|refreshToken|Authorization:|\.headers/u);
});

test('QA captures a privacy-safe, browser-clock auth stage waterfall across devices',async()=>{
  const qa=await readFile(new URL('../qa/rc64/authenticated-interaction.spec.mjs',import.meta.url),'utf8');
  assert.match(qa,/await context\.addInitScript\(\(\)=>\{/u);
  assert.match(qa,/globalThis\.__IBERFIT_AUTH_QA_STAGES__=marks/u);
  assert.match(qa,/globalThis\.__IBERFIT_AUTH_QA_SUBMIT_MS__=performance\.now\(\)/u);
  assert.match(qa,/const authStageTimeline=await page\.evaluate\(\(\)=>\{/u);
  assert.match(qa,/authStageTimeline\.some\(\(\{stage\}\)=>stage==='rc64-hydrate-start'/u);
  assert.match(qa,/authStageTimeline\.some\(\(\{stage\}\)=>stage==='rc64-shell-interactive-ready'/u);
  assert.match(qa,/elapsedSinceSubmitMs:Math\.round\(at-submit\)/u);
  const timeline=qa.slice(qa.indexOf('  const authStageTimeline='),qa.indexOf("  await expect(page.locator('.m26-role-choice"));
  assert.match(timeline,/\^rc64-\[a-z0-9-\]\{1,64\}\$/u);
  assert.match(timeline,/\.slice\(0,72\)/u);
  assert.doesNotMatch(timeline,/M26_QA_CLIENT_B_EMAIL|M26_QA_CLIENT_B_PASSWORD|Authorization|\.token|\.headers|\.url/u);
  assert.match(qa,/    authStageTimeline,/u);
});
