import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const generator=fs.readFileSync('scripts/generate_final_production_runtime_config.mjs','utf8');
const transport=fs.readFileSync('src/m26/supabase-transport.js','utf8');
const workflow=fs.readFileSync('.github/workflows/final-production-frontend.yml','utf8');

test('production runtime is bound to the exact evolving productive head',()=>{
  assert.match(generator,/PRODUCT_SOURCE_BRANCH='prep\/final-production-rc74-4'/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_SOURCE_SHA_INVALID/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_PROMOTION_HEAD_INVALID/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_PROMOTION_HEAD_MISMATCH/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_SOURCE_BRANCH_MISMATCH/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_QA_ONLY_MUST_BE_FALSE/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_SERVICE_ROLE_FORBIDDEN/u);
  assert.match(generator,/version\.json/u);
  assert.doesNotMatch(generator,/APPROVED_SOURCE_SHA/u);
  assert.doesNotMatch(generator,/APPROVED_SOURCE_BRANCH/u);
  assert.doesNotMatch(generator,/1d00bdc60c63a002eb26a33bc8bbe8655487a848/u);
});

test('production workflow certifies the exact productive SHA instead of historical Canary parity',()=>{
  assert.match(workflow,/Full repository regression[\s\S]*run: npm test/u);
  assert.match(workflow,/M26_SOURCE_SHA: \$\{\{ github\.sha \}\}/u);
  assert.match(workflow,/M26_SOURCE_BRANCH: prep\/final-production-rc74-4/u);
  assert.match(workflow,/M26_PROMOTION_HEAD: \$\{\{ github\.sha \}\}/u);
  assert.match(workflow,/PRODUCT_SOURCE_BRANCH=prep\/final-production-rc74-4/u);
  assert.doesNotMatch(workflow,/Assert frontend parity with approved Canary/u);
  assert.doesNotMatch(workflow,/APPROVED=1d00bdc60c63a002eb26a33bc8bbe8655487a848/u);
});

test('canonical transport already supports exact production runtime without source changes',()=>{
  assert.match(transport,/M26_PRODUCTION_PROJECT_REF='pjhmrhejsoofmouedavw'/u);
  assert.match(transport,/M26_QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu'/u);
  assert.match(transport,/EXACT_REMOTE_HOSTS\s*=\s*new Set\(\['app\.iberfit\.cl', 'coach\.iberfit\.cl', 'm26-canary\.iberfit\.cl'\]\)/u);
  assert.match(transport,/qaOnly===true[\s\S]*M26_QA_PROJECT_REF/u);
  assert.match(transport,/M26_PRODUCTION_PROJECT_REF/u);
});