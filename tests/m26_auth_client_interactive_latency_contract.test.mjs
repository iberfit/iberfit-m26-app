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
