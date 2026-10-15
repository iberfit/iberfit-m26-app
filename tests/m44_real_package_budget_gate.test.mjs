import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('M44 staging preflight measures deployed Canary packager and preserves all source assets',async()=>{
 const script=await readFile(new URL('../qa/m44/compare-real-package-budget.mjs',import.meta.url),'utf8');
 const workflow=await readFile(new URL('../.github/workflows/m44-wip-report-quality.yml',import.meta.url),'utf8');
 assert.match(workflow,/ref: canary\/rc74-4/);
 assert.match(workflow,/node qa\/rc64\/build-current-surface\.mjs/);
 assert.match(workflow,/compare-real-package-budget\.mjs/);
 assert.doesNotMatch(workflow,/Build entire client candidate and validate module imports and budgets/);
 assert.match(script,/M44_PACKAGING_REMOVED_BASELINE_ASSETS/);
 assert.match(script,/javascript:0\.06,css:0\.06,core:0\.06,media:0\.025,all:0\.05/);
 assert.match(script,/M44_CANARY_RELATIVE_PAYLOAD_BUDGET_EXCEEDED/);
});
