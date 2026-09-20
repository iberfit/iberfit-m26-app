import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyLiveSha,isRestoredIdentity} from '../scripts/ops/rollback_production_on_failure.mjs';

const workflowPath=new URL('../.github/workflows/production-promote.yml',import.meta.url);
const rollbackPath=new URL('../scripts/ops/rollback_production_on_failure.mjs',import.meta.url);
const [workflow,rollback]=await Promise.all([
  readFile(workflowPath,'utf8'),
  readFile(rollbackPath,'utf8'),
]);

const SOURCE='1111111111111111111111111111111111111111';
const PREVIOUS='2222222222222222222222222222222222222222';
const UNKNOWN='3333333333333333333333333333333333333333';

test('rollback classifier only permits current release or known previous production',()=>{
  assert.equal(classifyLiveSha(SOURCE,SOURCE,PREVIOUS),'rollback-required');
  assert.equal(classifyLiveSha(PREVIOUS,SOURCE,PREVIOUS),'already-restored');
  assert.throws(()=>classifyLiveSha(UNKNOWN,SOURCE,PREVIOUS),/PRODUCTION_ROLLBACK_LIVE_SHA_UNEXPECTED/u);
  assert.throws(()=>classifyLiveSha('invalid',SOURCE,PREVIOUS),/PRODUCTION_ROLLBACK_LIVE_SHA_INVALID/u);
});

test('restored identity must be exact previous PROD and never QA',()=>{
  const good={sourceSha:PREVIOUS,environment:'PRODUCTION',projectRef:'prod-ref',qaOnly:false,production:true};
  assert.equal(isRestoredIdentity(good,{previousSha:PREVIOUS,prodRef:'prod-ref'}),true);
  assert.equal(isRestoredIdentity({...good,sourceSha:SOURCE},{previousSha:PREVIOUS,prodRef:'prod-ref'}),false);
  assert.equal(isRestoredIdentity({...good,projectRef:'qa-ref'},{previousSha:PREVIOUS,prodRef:'prod-ref'}),false);
  assert.equal(isRestoredIdentity({...good,qaOnly:true},{previousSha:PREVIOUS,prodRef:'prod-ref'}),false);
  assert.equal(isRestoredIdentity({...good,production:false},{previousSha:PREVIOUS,prodRef:'prod-ref'}),false);
});

test('production promotion runs guarded automatic rollback after any deployment attempt failure',()=>{
  assert.match(workflow,/PRODUCTION_DEPLOY_ATTEMPTED=true/u);
  assert.match(workflow,/PRODUCTION_DEPLOY_COMPLETED=true/u);
  assert.match(workflow,/failure\(\) && env\.PRODUCTION_DEPLOY_ATTEMPTED == 'true'/u);
  assert.match(workflow,/node scripts\/ops\/rollback_production_on_failure\.mjs/u);
  assert.match(workflow,/PREVIOUS_DEPLOYMENT_ID/u);
  assert.match(workflow,/PRODUCTION_ROLLBACK_EVIDENCE\.json/u);
  assert.match(workflow,/if: always\(\)/u);
  assert.match(rollback,/\/deployments\/\$\{previousDeploymentId\}\/rollback/u);
  assert.match(rollback,/PRODUCTION_ROLLBACK_LIVE_SHA_UNEXPECTED/u);
  assert.match(rollback,/PRODUCTION_ROLLBACK_IDENTITY_NOT_RESTORED/u);
  assert.match(rollback,/restoredEnvironment/u);
  assert.match(rollback,/qaOnly:restored\.qaOnly/u);
  assert.match(rollback,/production:restored\.production/u);
});
