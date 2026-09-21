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
import {selectCanaryPreviousDeployment} from '../scripts/ops/select_canary_previous_deployment.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workflow=fs.readFileSync(path.join(repo,'.github','workflows','canary-exact-deploy.yml'),'utf8');
const runtimeGenerator=fs.readFileSync(path.join(repo,'scripts','generate_rc74_4_runtime_config.mjs'),'utf8');
const surfaceSealer=fs.readFileSync(path.join(repo,'scripts','ops','prepare_canary_deploy_surface.mjs'),'utf8');
const sourceSha='1'.repeat(40);
const previousSha='2'.repeat(40);

function runtimeText(config){
  return `window.__IBERFIT_M26_RUNTIME__ = Object.freeze(${JSON.stringify(config,null,2)});\n`;
}

function fixture(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'iberfit-canary-deploy-'));
  const build=path.join(temp,'surface');
  fs.mkdirSync(path.join(build,'m26'),{recursive:true});
  fs.writeFileSync(path.join(build,'index.html'),'<html lang="es-ES"></html>');
  fs.writeFileSync(path.join(build,'m26','_headers'),`/*\n  Content-Security-Policy: connect-src 'self' ${PROD_URL}; img-src 'self' ${PROD_URL}\n`);
  fs.writeFileSync(path.join(build,'m26','sw.js'),"const VERSION='m26-rc63-2';\nconst PREVIOUS_VERSION='m26-rc63-1';\nconst X='/src/m26/design/auth-native.css';\n");
  const runtime=path.join(temp,'runtime-config.js');
  fs.writeFileSync(runtime,runtimeText({
    enabled:true,
    qaOnly:true,
    projectRef:QA_REF,
    url:QA_URL,
    publishableKey:'sb_publishable_test_key',
  }));
  const liveSw=path.join(temp,'live-sw.js');
  fs.writeFileSync(liveSw,"const VERSION='m26-canary-old';\nconst PREVIOUS_VERSION='m26-canary-older';\n");
  return {temp,build,runtime,liveSw};
}

function rollbackProjectFixture({canonicalSha=previousSha,canonicalSkipped=false,canonicalStatus='success'}={}){
  return {
    success:true,
    result:{
      name:'iberfit-m26-canary',
      production_branch:CANARY_BRANCH,
      domains:['m26-canary.iberfit.cl'],
      latest_deployment:{
        id:'latest-skipped',
        environment:'production',
        is_skipped:true,
        skip_reason:'production_deployments_disabled',
        deployment_trigger:{metadata:{branch:CANARY_BRANCH,commit_hash:sourceSha}},
      },
      canonical_deployment:{
        id:'canonical-live',
        environment:'production',
        is_skipped:canonicalSkipped,
        latest_stage:{status:canonicalStatus},
        production_branch:CANARY_BRANCH,
        deployment_trigger:{metadata:{branch:CANARY_BRANCH,commit_hash:canonicalSha}},
      },
    },
  };
}

const rollbackLive={sourceSha:previousSha,environment:'QA',projectRef:QA_REF,qaOnly:true,production:false};
const rollbackSelectorArgs={
  live:rollbackLive,
  expectedProject:'iberfit-m26-canary',
  expectedBranch:CANARY_BRANCH,
  expectedDomain:'m26-canary.iberfit.cl',
  expectedQaRef:QA_REF,
};

test('Canary deploy surface generates exact release identity even when source tree has no version.json',()=>{
  const f=fixture();
  try{
    assert.equal(fs.existsSync(path.join(f.build,'version.json')),false);
    assert.equal(fs.existsSync(path.join(f.build,'m26','version.json')),false);
    const evidence=sealCanarySurface({buildDir:f.build,sourceSha,sourceBranch:CANARY_BRANCH,generatedRuntimePath:f.runtime,liveSwPath:f.liveSw,previousLiveSha:previousSha});
    assert.equal(evidence.sourceSha,sourceSha);
    assert.equal(evidence.projectRef,QA_REF);
    assert.equal(evidence.qaOnly,true);
    assert.equal(evidence.production,false);
    assert.equal(evidence.releaseIdentityGenerated,true);
    const rootVersion=fs.readFileSync(path.join(f.build,'version.json'),'utf8');
    const m26Version=fs.readFileSync(path.join(f.build,'m26','version.json'),'utf8');
    assert.equal(rootVersion,m26Version);
    const version=JSON.parse(rootVersion);
    assert.equal(version.schema,'iberfit.release-identity.v1');
    assert.equal(version.release,'IBERFIT_M26_CANARY_111111111111');
    assert.equal(version.version,'26.0.0-canary.111111111111');
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
    assert.match(runtime,/"enabled":\s*true/u);
    assert.match(runtime,/"qaOnly":\s*true/u);
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
    fs.writeFileSync(f.runtime,runtimeText({
      enabled:true,
      qaOnly:true,
      projectRef:PROD_REF,
      url:PROD_URL,
      publishableKey:'sb_publishable_test_key',
    }));
    assert.throws(()=>sealCanarySurface({buildDir:f.build,sourceSha,sourceBranch:CANARY_BRANCH,generatedRuntimePath:f.runtime,liveSwPath:f.liveSw,previousLiveSha:previousSha}),/CANARY_SURFACE_RUNTIME_QA_IDENTITY_MISSING|CANARY_SURFACE_RUNTIME_PROD_LEAK/u);
  }finally{
    fs.rmSync(f.temp,{recursive:true,force:true});
  }
});

test('Canary rollback selector uses canonical LIVE even when latest deployment is newer and skipped',()=>{
  const selected=selectCanaryPreviousDeployment({...rollbackSelectorArgs,project:rollbackProjectFixture()});
  assert.deepEqual(selected,{previousLiveSha:previousSha,previousDeploymentId:'canonical-live'});
});

test('Canary rollback selector fails closed when canonical deployment is skipped or does not match LIVE SHA',()=>{
  assert.throws(
    ()=>selectCanaryPreviousDeployment({...rollbackSelectorArgs,project:rollbackProjectFixture({canonicalSkipped:true})}),
    /CANARY_CF_CANONICAL_DEPLOYMENT_SKIPPED/u,
  );
  assert.throws(
    ()=>selectCanaryPreviousDeployment({...rollbackSelectorArgs,project:rollbackProjectFixture({canonicalSha:'3'.repeat(40)})}),
    /CANARY_CF_CANONICAL_SHA_MISMATCH/u,
  );
  assert.throws(
    ()=>selectCanaryPreviousDeployment({...rollbackSelectorArgs,project:rollbackProjectFixture({canonicalStatus:'failure'})}),
    /CANARY_CF_CANONICAL_STATUS_INVALID/u,
  );
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

test('Canary workflow binds the same protected QA environment and runtime contract used by RC74.4 generator',()=>{
  assert.match(workflow,/deploy-canary:[\s\S]*?runs-on: ubuntu-latest\n\s+environment: m26-canary-readonly/u);
  for(const envName of ['M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY']){
    assert.match(runtimeGenerator,new RegExp(`['\"]${envName}['\"]`,'u'));
  }
  const runtimeStep=workflow.match(/- name: Generate QA-only runtime[\s\S]*?run: node scripts\/generate_rc74_4_runtime_config\.mjs/u)?.[0]||'';
  assert.match(runtimeStep,/M26_SUPABASE_URL: \$\{\{ env\.QA_SUPABASE_URL \}\}/u);
  assert.match(runtimeStep,/M26_SUPABASE_PUBLISHABLE_KEY: \$\{\{ secrets\.M26_SUPABASE_PUBLISHABLE_KEY \}\}/u);
  assert.match(runtimeStep,/M26_PROJECT_REF: \$\{\{ env\.QA_SUPABASE_REF \}\}/u);
  assert.match(runtimeStep,/M26_QA_ONLY: 'true'/u);
  assert.doesNotMatch(runtimeStep,/M26_QA_SUPABASE_(?:URL|PUBLISHABLE_KEY)/u);
});

test('Canary seal consumes and validates the JSON runtime generated inside the canonical build surface',()=>{
  assert.match(runtimeGenerator,/const target=path\.join\(buildDir,'m26','runtime-config\.js'\);/u);
  assert.match(runtimeGenerator,/JSON\.stringify\(config,null,2\)/u);
  const sealStep=workflow.match(/- name: Seal exact Canary surface[\s\S]*?run: node scripts\/ops\/prepare_canary_deploy_surface\.mjs/u)?.[0]||'';
  assert.match(sealStep,/M26_CANARY_BUILD_DIR: \.tmp\/rc64-current-surface/u);
  assert.match(sealStep,/M26_CANARY_GENERATED_RUNTIME: \.tmp\/rc64-current-surface\/m26\/runtime-config\.js/u);
  assert.doesNotMatch(sealStep,/M26_CANARY_GENERATED_RUNTIME: public\/m26\/runtime-config\.js/u);
  assert.match(surfaceSealer,/generatedRuntimePath:process\.env\.M26_CANARY_GENERATED_RUNTIME\|\|'\.tmp\/rc64-current-surface\/m26\/runtime-config\.js'/u);
  assert.ok(surfaceSealer.includes('if(!/"enabled":\\s*true/u.test(runtime))'));
  assert.ok(surfaceSealer.includes('if(!/"qaOnly":\\s*true/u.test(runtime))'));
});

test('Canary workflow captures rollback metadata from canonical deployment rather than first-page history',()=>{
  const capture=workflow.match(/- name: Capture current Canary rollback metadata[\s\S]*?\n\s+- name: Build canonical fail-closed surface/u)?.[0]||'';
  assert.match(capture,/select_canary_previous_deployment\.mjs/u);
  assert.doesNotMatch(capture,/pages\/projects\/\$\{CF_PROJECT\}\/deployments/u);
  assert.doesNotMatch(capture,/deployments\.result\.find/u);
});

test('Canary workflow requires shared-lock QA auth preflight before exact SHA deploy, then live-certifies with rollback',()=>{
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

  const authJob=workflow.indexOf('  qa-auth-readonly-preflight:');
  const deployJob=workflow.indexOf('  deploy-canary:');
  assert.ok(authJob>=0&&deployJob>authJob,'authenticated QA preflight must be a dedicated job before deploy');

  const preflight=workflow.slice(authJob,deployJob);
  const deployWorkflow=workflow.slice(deployJob);
  assert.match(preflight,/Run authenticated QA read-only gate before deploy/u);
  assert.match(preflight,/group: iberfit-qa-shared-auth-readonly/u);
  assert.match(deployWorkflow,/deploy-canary:\s*\n\s+needs: qa-auth-readonly-preflight/u);
  assert.doesNotMatch(deployWorkflow,/run_authenticated_readonly_gate\.mjs/u);

  const build=deployWorkflow.indexOf('Build canonical fail-closed surface');
  const qaRuntime=deployWorkflow.indexOf('Generate QA-only runtime');
  const seal=deployWorkflow.indexOf('Seal exact Canary surface');
  const deploy=deployWorkflow.indexOf('Deploy exact certified surface to Canary with Wrangler');
  const live=deployWorkflow.indexOf('Certify deployed Canary desktop and mobile read-only');
  assert.ok(build>=0&&build<qaRuntime&&qaRuntime<seal&&seal<deploy&&deploy<live);
  assert.doesNotMatch(workflow,/--project-name\s+["']?iberfit-m26-production/u);
});
