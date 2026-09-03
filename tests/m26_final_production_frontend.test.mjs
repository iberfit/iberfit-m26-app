import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const generator=fs.readFileSync('scripts/generate_final_production_runtime_config.mjs','utf8');
const verifier=fs.readFileSync('scripts/verify_production_surface.mjs','utf8');
const transport=fs.readFileSync('src/m26/supabase-transport.js','utf8');
const workflow=fs.readFileSync('.github/workflows/production-promote.yml','utf8');

test('production frontend generator binds provenance to exact integration source and exact PROD ref',()=>{
  assert.match(generator,/APPROVED_SOURCE_BRANCH='canary\/rc74-4'/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_SOURCE_SHA_INVALID/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_SOURCE_BRANCH_MISMATCH/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_PROMOTION_HEAD_MISMATCH/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_QA_ONLY_MUST_BE_FALSE/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_PUBLISHABLE_KEY_REQUIRED/u);
  assert.match(generator,/FINAL_PROD_RUNTIME_SERVICE_ROLE_FORBIDDEN/u);
  assert.match(generator,/version\.json/u);
  assert.doesNotMatch(generator,/APPROVED_SOURCE_SHA=/u);
});

test('permanent production workflow generates runtime deterministically instead of copying live runtime',()=>{
  assert.match(workflow,/Generate deterministic production runtime/u);
  assert.match(workflow,/node scripts\/generate_final_production_runtime_config\.mjs/u);
  assert.match(workflow,/M26_SOURCE_SHA="\$SOURCE_SHA"/u);
  assert.match(workflow,/M26_SOURCE_BRANCH="\$SOURCE_BRANCH"/u);
  assert.match(workflow,/M26_PROMOTION_HEAD="\$SOURCE_SHA"/u);
  assert.match(workflow,/M26_QA_ONLY='false'/u);
  assert.match(workflow,/PROD_SUPABASE_REF: 'pjhmrhejsoofmouedavw'/u);
  assert.match(workflow,/PROD_SUPABASE_URL: 'https:\/\/pjhmrhejsoofmouedavw\.supabase\.co'/u);
  assert.doesNotMatch(workflow,/cp \/tmp\/runtime-config\.live\.js/u);
  assert.doesNotMatch(workflow,/PROD_RUNTIME_NOT_ENABLED/u);
  assert.match(workflow,/grep -Fq '"enabled": true' "\$R"/u);
  assert.match(workflow,/grep -Fq '"qaOnly": false' "\$R"/u);
});

test('permanent production workflow uses one retrying fail-closed surface contract after preview deploy',()=>{
  assert.equal(workflow.match(/node scripts\/verify_production_surface\.mjs/gu)?.length,2);
  assert.match(workflow,/M26_VERIFY_SOURCE_SHA="\$SOURCE_SHA"/u);
  assert.match(workflow,/M26_VERIFY_SOURCE_BRANCH="\$SOURCE_BRANCH"/u);
  assert.match(workflow,/M26_VERIFY_ATTEMPTS='30'/u);
  assert.match(verifier,/iberfit\.production\.surface\.v1/u);
  assert.match(verifier,/PROD_SURFACE_VERSION_SHA_MISMATCH/u);
  assert.match(verifier,/PROD_SURFACE_RUNTIME_QA_LEAK/u);
  assert.match(verifier,/PROD_SURFACE_RUNTIME_PRIVILEGED_KEY_FORBIDDEN/u);
  assert.match(verifier,/PROD_SURFACE_VERIFY_RETRY/u);
});

test('canonical transport supports exact production runtime without weakening QA separation',()=>{
  assert.match(transport,/M26_PRODUCTION_PROJECT_REF='pjhmrhejsoofmouedavw'/u);
  assert.match(transport,/M26_QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu'/u);
  assert.match(transport,/EXACT_REMOTE_HOSTS\s*=\s*new Set\(\['app\.iberfit\.cl', 'coach\.iberfit\.cl', 'm26-canary\.iberfit\.cl'\]\)/u);
  assert.match(transport,/qaOnly===true[\s\S]*M26_QA_PROJECT_REF/u);
  assert.match(transport,/M26_PRODUCTION_PROJECT_REF/u);
});
