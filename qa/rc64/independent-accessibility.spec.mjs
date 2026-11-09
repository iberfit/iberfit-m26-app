import {test, expect} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';

const outputDir = 'recovery/independent-security';

test('public preauth local-only WCAG audit (informational baseline)', async ({page}, testInfo) => {
  const remoteRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.protocol !== 'blob:' &&
        !['127.0.0.1', 'localhost'].includes(url.hostname)) remoteRequests.push(url.origin);
  });
  await page.context().addInitScript({path: 'node_modules/axe-core/axe.min.js'});
  const response = await page.goto('/', {waitUntil: 'networkidle'});
  expect(response?.ok()).toBeTruthy();
  expect(remoteRequests).toEqual([]);

  const result = await page.evaluate(() => globalThis.axe.run(document, {
    runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']},
  }));
  const summary = {
    schema: 'iberfit.independent-accessibility.v1',
    environment: 'local-qa-only-disabled-runtime',
    viewport: testInfo.project.name,
    testedRules: result.passes.length + result.violations.length + result.incomplete.length,
    violations: result.violations.map(item => ({id: item.id, impact: item.impact, affectedNodes: item.nodes.length})),
    manualReview: result.incomplete.map(item => ({id: item.id, affectedNodes: item.nodes.length})),
  };
  await mkdir(outputDir, {recursive: true});
  await writeFile(`${outputDir}/axe-${testInfo.project.name}.json`, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  expect(Array.isArray(result.violations)).toBe(true);
});
