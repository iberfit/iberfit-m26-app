import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const workflow=read('.github/workflows/admin-interaction-matrix.yml');
const config=read('playwright.admin-interaction.config.mjs');

const projects=[
  'admin-desktop-chromium',
  'admin-tablet-chromium',
  'admin-tablet-landscape-chromium',
  'admin-mobile-chromium',
  'admin-desktop-webkit',
  'admin-mobile-webkit',
  'admin-desktop-firefox',
];

test('Admin interaction workflow shards by engine without dropping any canonical project',()=>{
  assert.match(workflow,/strategy:\n\s+fail-fast: false/u);
  for(const browser of ['chromium','webkit','firefox']){
    assert.match(workflow,new RegExp(`- browser: ${browser}`,'u'),`missing ${browser} shard`);
  }
  for(const project of projects){
    assert.ok(config.includes(`name:'${project}'`),`config missing ${project}`);
    const matches=workflow.match(new RegExp(`--project=${project}`,'gu'))||[];
    assert.equal(matches.length,1,`workflow must schedule ${project} exactly once`);
  }
});

test('Browser shards execute only their declared projects and keep one-worker project semantics',()=>{
  assert.match(workflow,/npx playwright test --config playwright\.admin-interaction\.config\.mjs \$\{\{ matrix\.projects \}\}/u);
  assert.match(config,/fullyParallel:false/u);
  assert.match(config,/workers:1/u);
});

test('Browser shards retain deterministic install cache readiness and unique failure artifacts',()=>{
  assert.match(workflow,/npm ci/u);
  assert.match(workflow,/actions\/cache@v4/u);
  assert.match(workflow,/hashFiles\('package-lock\.json'\).*matrix\.browser/u);
  assert.match(workflow,/restore-keys:[\s\S]*?-all/u);
  assert.match(workflow,/playwright install-deps "\$\{\{ matrix\.browser \}\}"/u);
  assert.match(workflow,/cache-hit != 'true'/u);
  assert.match(workflow,/PW_BROWSER: \$\{\{ matrix\.browser \}\}/u);
  assert.match(workflow,/admin-interaction-matrix-\$\{\{ matrix\.browser \}\}-\$\{\{ github\.run_id \}\}/u);
});

test('Browser shard workflow keeps stale-run cancellation and self-tests on workflow or contract changes',()=>{
  assert.ok(workflow.includes('group: iberfit-admin-interaction-matrix-${{ github.event.pull_request.number || github.ref }}'));
  assert.match(workflow,/cancel-in-progress: true/u);
  for(const path of [
    "tests/m26_admin_browser_shards_contract.test.mjs",
    "tests/m26_playwright_cache_workflows.test.mjs",
    ".github/workflows/admin-interaction-matrix.yml",
  ]) assert.ok(workflow.includes(`- '${path}'`),`workflow trigger missing ${path}`);
});
