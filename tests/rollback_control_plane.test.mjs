import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  classifyControlPlaneRollback,
  extractCanonicalDeployment,
  isControlPlaneRestored,
} from '../scripts/ops/rollback_control_plane.mjs';

const SOURCE='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PREVIOUS='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER='cccccccccccccccccccccccccccccccccccccccc';
const PREVIOUS_ID='previous-deployment-id';

function projectPayload({id='current-deployment-id',sha=SOURCE,name='iberfit-m26-production'}={}){
  return {
    success:true,
    result:{
      name,
      canonical_deployment:{
        id,
        environment:'production',
        is_skipped:false,
        latest_stage:{status:'success'},
        url:`https://${id}.example.pages.dev`,
        production_branch:'canary/rc74-4',
        deployment_trigger:{metadata:{branch:'canary/rc74-4',commit_hash:sha}},
      },
    },
  };
}

test('control-plane target deployment requires rollback without consulting live identity',()=>{
  const current=extractCanonicalDeployment(projectPayload(),{
    expectedProject:'iberfit-m26-production',
    errorPrefix:'PRODUCTION_ROLLBACK',
  });
  assert.equal(classifyControlPlaneRollback({
    currentDeployment:current,
    sourceSha:SOURCE,
    previousDeploymentId:PREVIOUS_ID,
    previousSha:PREVIOUS,
    errorPrefix:'PRODUCTION_ROLLBACK',
  }),'rollback-required');
});

test('control-plane previous deployment is an idempotent already-restored state',()=>{
  const current=extractCanonicalDeployment(projectPayload({id:PREVIOUS_ID,sha:PREVIOUS}),{
    expectedProject:'iberfit-m26-production',
    errorPrefix:'PRODUCTION_ROLLBACK',
  });
  assert.equal(classifyControlPlaneRollback({
    currentDeployment:current,
    sourceSha:SOURCE,
    previousDeploymentId:PREVIOUS_ID,
    previousSha:PREVIOUS,
    errorPrefix:'PRODUCTION_ROLLBACK',
  }),'already-restored');
  assert.equal(isControlPlaneRestored(current,{previousDeploymentId:PREVIOUS_ID,previousSha:PREVIOUS}),true);
});

test('unexpected or newer control-plane deployment fails closed',()=>{
  const current=extractCanonicalDeployment(projectPayload({id:'newer-deployment-id',sha:OTHER}),{
    expectedProject:'iberfit-m26-production',
    errorPrefix:'PRODUCTION_ROLLBACK',
  });
  assert.throws(()=>classifyControlPlaneRollback({
    currentDeployment:current,
    sourceSha:SOURCE,
    previousDeploymentId:PREVIOUS_ID,
    previousSha:PREVIOUS,
    errorPrefix:'PRODUCTION_ROLLBACK',
  }),/PRODUCTION_ROLLBACK_CURRENT_DEPLOYMENT_UNEXPECTED/u);
});

test('previous deployment id cannot be trusted with a mismatched SHA',()=>{
  const current=extractCanonicalDeployment(projectPayload({id:PREVIOUS_ID,sha:OTHER}),{
    expectedProject:'iberfit-m26-production',
    errorPrefix:'PRODUCTION_ROLLBACK',
  });
  assert.throws(()=>classifyControlPlaneRollback({
    currentDeployment:current,
    sourceSha:SOURCE,
    previousDeploymentId:PREVIOUS_ID,
    previousSha:PREVIOUS,
    errorPrefix:'PRODUCTION_ROLLBACK',
  }),/PRODUCTION_ROLLBACK_PREVIOUS_DEPLOYMENT_SHA_MISMATCH/u);
});

test('Cloudflare canonical deployment must be successful production state for the expected project',()=>{
  const failed=projectPayload();
  failed.result.canonical_deployment.latest_stage.status='failure';
  assert.throws(()=>extractCanonicalDeployment(failed,{
    expectedProject:'iberfit-m26-production',
    errorPrefix:'PRODUCTION_ROLLBACK',
  }),/PRODUCTION_ROLLBACK_CF_CANONICAL_STATUS_INVALID/u);

  assert.throws(()=>extractCanonicalDeployment(projectPayload({name:'wrong-project'}),{
    expectedProject:'iberfit-m26-production',
    errorPrefix:'PRODUCTION_ROLLBACK',
  }),/PRODUCTION_ROLLBACK_CF_PROJECT_MISMATCH/u);
});

test('PROD and Canary rollback scripts decide from control-plane before any live identity read',async()=>{
  const scripts=[
    '../scripts/ops/rollback_production_on_failure.mjs',
    '../scripts/ops/rollback_canary_on_failure.mjs',
  ];
  for(const relative of scripts){
    const source=await readFile(new URL(relative,import.meta.url),'utf8');
    const initial=source.indexOf('const initialDeployment=await currentCanonicalDeployment');
    const decision=source.indexOf('const action=classifyControlPlaneRollback',initial);
    const rollback=source.indexOf("if(action==='rollback-required')",decision);
    const controlPlaneVerified=source.indexOf('if(!restoredDeployment)',rollback);
    const liveVerification=source.indexOf('const current=await readLiveVersion',controlPlaneVerified);
    assert.ok(initial>=0,`${relative}: initial control-plane read missing`);
    assert.ok(decision>initial,`${relative}: control-plane decision must follow control-plane read`);
    assert.ok(rollback>decision,`${relative}: rollback must follow control-plane decision`);
    assert.ok(controlPlaneVerified>rollback,`${relative}: control-plane restore verification must follow rollback`);
    assert.ok(liveVerification>controlPlaneVerified,`${relative}: live identity must only verify after control-plane restore`);
  }
});
