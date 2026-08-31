import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const generator=fs.readFileSync('scripts/generate_final_production_runtime_config.mjs','utf8');
const transport=fs.readFileSync('src/m26/supabase-transport.js','utf8');

test('production frontend generator is pinned to approved Canary and exact PROD ref',()=>{
  assert.match(generator,/APPROVED_SOURCE_SHA='1d00bdc60c63a002eb26a33bc8bbe8655487a848'/u);
  assert.match(generator,/APPROVED_SOURCE_BRANCH='canary\/rc74-4'/u);
  assert.match(generator,/M26_QA_ONLY_MUST_BE_FALSE/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_SOURCE_SHA_MISMATCH/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_SERVICE_ROLE_FORBIDDEN/u);
  assert.match(generator,/version\.json/u);
});

test('canonical transport already supports exact production runtime without source changes',()=>{
  assert.match(transport,/M26_PRODUCTION_PROJECT_REF='pjhmrhejsoofmouedavw'/u);
  assert.match(transport,/M26_QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu'/u);
  assert.match(transport,/EXACT_REMOTE_HOSTS=new Set\(\['app\.iberfit\.cl', 'coach\.iberfit\.cl', 'm26-canary\.iberfit\.cl'\]\)/u);
  assert.match(transport,/qaOnly===true[\s\S]*M26_QA_PROJECT_REF/u);
  assert.match(transport,/M26_PRODUCTION_PROJECT_REF/u);
});
