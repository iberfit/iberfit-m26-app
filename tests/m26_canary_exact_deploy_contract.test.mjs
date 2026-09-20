import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  sealCanarySurface,
  CANARY_BRANCH,
  QA_REF,
  QA_URL,
  PROD_REF,
  PROD_URL,
} from '../scripts/ops/prepare_canary_deploy_surface.mjs';
import {
  classifyCanaryLiveSha,
  isRestoredCanaryIdentity,
} from '../scripts/ops/rollback_canary_on_failure.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workflow=fs.readFileSync(path.join(repo,'.github','workflows','canary-exact-deploy.yml'),'utf8');
const sourceSha='1'.repeat(40);
const previousSha='2'.repeat(40);

function fixture(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'iberfit-canary-deploy-'));
  const build=path.join(temp,'surface');
  fs.mkdirSync(path.join(build,'m26'),{recursive:true});
  fs.writeFileSync(path.join(build,'index.html'),'<html lang="es-ES"></html>');
  fs.writeFileSync(path.join(build,'m26','version.json'),JSON.stringify({release:'SOURCE',version:'source',sourceSha:'TO_BE_STAMPED_AT_DEPLOY',sourceBranch:CANARY_BRANCH,qaOnly:true,environment:'QA',projectRef:QA_REF},null,2));
  fs.writeFileSync(path.join(build,'m26','_headers'),`/*\n  Content-Security-Policy: connect-src 'self' ${PROD_URL}; img-src 'self' ${PROD_URL}\n`);
  fs.writeFileSync(path.join(build,'m26','sw.js'),"const VERSION='m26-rc63-2';\nconst PREVIOUS_VERSION='m26-rc63-1';\nconst X='/src/m26/design/auth-native.css';\n");
  const runtime=path.join(temp,'runtime-config.js');
  fs.writeFileSync(runtime,`globalThis.__IBERFIT_M26_RUNTIME__={enabled: true,qaOnly: true,projectRef: '${QA_REF}',url: '${QA_URL}',publishableKey: 'sb_publishable_test_key'};\n`);
  const liveSw=path.join(temp,'live-sw.js');
  fs.writeFileSync(liveSw,"const VERSION='m26-canary-old';\nconst PREVIOUS_VERSION='m26-canary-older';\n");
  return {temp,build,runtime,liveSw};
}

test('Canary deploy surface is sealed to exact QA identity without PROD leakage',()=>{
  const f=fixture();
  try{
    const evidence=sealCanarySurface({buildDir:f.build,sourceSha,sourceBranch:CANARY_BRANCH,generatedRuntimePath:f.runtime,liveSwPath:f.liveSw,previousLiveSha:previousSha});
    assert.equal(evidence.sourceSha,sourceSha);
    assert.equal(evidence.projectRef,QA_REF);
    assert.equal(evidence.qaOnly,true);
    assert.equal(evidence.production,false);
    const rootVersion=fs.readFileSync(path.join(f.build,'version.json'),'utf8');
    const m26Version=fs.readFileSync(path.join(f.build,'m26','version.json'),'utf8');
    assert.equal(rootVersion,m26Version);
    const version=JSON.parse(rootVersion);
    assert.equal(version.sourceSha,sourceSha);
    assert.equal(version.sourceBranch,CANARY_BRANCH);
    assert.equal(version.previousLiveSha,previousSha);
    assert.equal(version.environment,'QA');
    assert.equal(version.projectRef,QA_REF);
    assert.equal(version.qaOnly,true);
    assert.equal(version.production,false);
    const headers=fs.readFileSync(path.join(f.build,'_headers'),'utf8');
    assert.match(headers,new RegExp(QA_REF));
    assert.doesNotMatch(headers,new RegExp(PROD_REF));
    const runtime=fs.readFileSync(path.join(f.build,'m26','runtime-config.js'),'utf8');
    assert.match(runtime,/enabled:\s*true/u);
    assert.match(runtime,/qaOnly:\s*true/u);
    assert.match(runtime,new RegExp(QA_REF));
    assert.doesNotMatch(runtime,new RegExp(PROD_REF));
    const sw=fs.readFileSync(path.join(f.build,'m26','sw.js'),'utf8');
    assert.match(sw,/const VERSION='m26-canary-111111111111';/u);
    assert.match(sw,/const PREVIOUS_VERSION='m26-canary-old';/u);
  }finally{
    fs.rmSync(f.temp,{recursive:true,force:true});
  }
});

test('Canary deploy surface refuses PROD runtime leakage',()=>{
  const f=fixture();
  try{
    fs.writeFileSync(f.runtime,`globalThis.__IBERFIT_M26_RUNTIME__={enabled: true,qaOnly: true,projectRef: '${PROD_REF}',url: '${PROD_URL}',publishableKey: 'sb_publishable_test_key'};\n`);
    assert.throws(()=>sealCanarySurface({buildDir:f.build,sourceSha,sourceBranch:CANARY_BRANCH,generatedRuntimePath:f.runtime,liveSwPath:f.liveSw,previousLiveSha:previousSha}),/CANARY_SURFACE_RUNTIME_QA_IDENTITY_MISSING|CANARY_SURFACE_RUNTIME_PROD_LEAK/u);
  }finally{
    fs.rmSync(f.temp,{recursive:true,force:true});
  }
});

test('Canary rollback only accepts candidate or exact previous SHA',()=>{
  assert.equal(classifyCanaryLiveSha(sourceSha,sourceSha,previousSha),'rollback-required');
  assert.equal(classifyCanaryLiveSha(previousSha,sourceSha,previousSha),'already-restored');
  assert.throws(()=>classifyCanaryLiveSha('3'.repeat(40),sourceSha,previousSha),/CANARY_ROLLBACK_LIVE_SHA_UNEXPECTED/u);
});

test('Canary restored identity is QA-only and never production',()=>{
  assert.equal(isRestoredCanaryIdentity({sourceSha:previousSha,environment:'QA',projectRef:QA_REF,qaOnly:true,production:false},{previousSha}),true);
  assert.equal(isRestoredCanaryIdentity({sourceSha:previousSha,environment:'PRODUCTION',projectRef:QA_REF,qaOnly:true,production:false},{previousSha}),false);
  assert.equal(isRestoredCanaryIdentity({sourceSha:previousSha,environment:'QA',projectRef:PROD_REF,qaOnly:true,production:false},{previousSha}),false);
  assert.equal(isRestoredCanaryIdentity({sourceSha:previousSha,environment:'QA',projectRef:QA_REF,qaOnly:true,production:true},{previousSha}),false);
});

test('Canary workflow deploys exact SHA only after QA sealing and read-only auth gate, then live-certifies with rollback',()=>{
  assert.match(workflow,/CF_PROJECT: 'iberfit-m26-canary'/u);
  assert.match(workflow,/CANARY_DOMAIN: 'm26-canary\.iberfit\.cl'/u);
  assert.match(workflow,/--project-name "\$CF_PROJECT"/u);
  assert.match(workflow,/--branch "\$CANARY_BRANCH"/u);
  assert.match(workflow,/--commit-hash "\$SOURCE_SHA"/u);
  assert.match(workflow,/prepare_canary_deploy_surface\.mjs/u);
  assert.match(workflow,/run_authenticated_readonly_gate\.mjs/u);
  assert.match(workflow,/check_live_canary_gate\.mjs/u);
  assert.match(workflow,/rollback_canary_on_failure\.mjs/u);
  assert.match(workflow,/failure\(\) && env\.CANARY_DEPLOY_ATTEMPTED == '1'/u);
  const build=workflow.indexOf('Build canonical fail-closed surface');
  const qaRuntime=workflow.indexOf('Generate QA-only runtime');
  const seal=workflow.indexOf('Seal exact Canary surface');
  const auth=workflow.indexOf('Run authenticated QA read-only gate before deploy');
  const deploy=workflow.indexOf('Deploy exact certified surface to Canary with Wrangler');
  const live=workflow.indexOf('Certify deployed Canary desktop and mobile read-only');
  assert.ok(build>=0&&build<qaRuntime&&qaRuntime<seal&&seal<auth&&auth<deploy&&deploy<live);
  assert.doesNotMatch(workflow,/--project-name\s+["']?iberfit-m26-production/u);
});
