import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const workflow=await readFile(new URL('../.github/workflows/exercise-media-auto-factory.yml',import.meta.url),'utf8');
const control=await readFile(new URL('../supabase/functions/iberfit-exercise-media-auto-factory-control-v1/index.ts',import.meta.url),'utf8');

test('provider-safe preflight happens before any exercise claim',()=>{
  const queue=workflow.indexOf('- name: Check canonical queue before provisioning AI');
  const proxy=workflow.indexOf('- name: Create isolated Workers AI proxy');
  const capacity=workflow.indexOf('- name: Verify provider capacity before claim');
  const claim=workflow.indexOf('- name: Claim next missing System v1 exercise');
  assert.ok(queue>=0&&proxy>queue&&capacity>proxy&&claim>capacity);
  assert.match(workflow,/AUTO_FACTORY_CONTROL_URL/);
  assert.match(workflow,/\"action\":\"status\"/);
  assert.match(workflow,/IBERFIT_QUEUE_IDLE=true/);
  assert.match(workflow,/IBERFIT_PROVIDER_PAUSED=true/);
  assert.match(workflow,/claim_created\":false/);
});

test('capacity exhaustion never reserves an exercise',()=>{
  const capacityStart=workflow.indexOf('- name: Verify provider capacity before claim');
  const claimStart=workflow.indexOf('- name: Claim next missing System v1 exercise');
  const capacityBlock=workflow.slice(capacityStart,claimStart);
  assert.match(capacityBlock,/IBERFIT_FACTORY_DONE=true/);
  assert.match(capacityBlock,/provider-capacity\.json/);
  assert.match(capacityBlock,/max_completion_tokens\":8/);
  assert.doesNotMatch(capacityBlock,/\"action\":\"claim\"/);
});

test('provider failures release the lease while semantic failures still quarantine',()=>{
  assert.match(workflow,/ai-errors\.log/);
  assert.match(workflow,/daily free allocation/);
  assert.match(workflow,/4006/);
  assert.match(workflow,/3040/);
  assert.match(workflow,/3043/);
  assert.match(workflow,/_NETWORK_EXHAUSTED/);
  assert.match(workflow,/\{action:\"release\",job_id:\$job,exercise_id:\$id,error:\$err\}/);
  assert.match(workflow,/\{action:\"fail\",job_id:\$job,exercise_id:\$id,error:\$err\}/);
});

test('control plane is OIDC-pinned and release restores an attempt without publishing',()=>{
  assert.match(control,/EXPECTED_REPOSITORY=\"iberfit\/iberfit-m26-app\"/);
  assert.match(control,/EXPECTED_REPOSITORY_ID=\"1306074388\"/);
  assert.match(control,/EXPECTED_REF=\"refs\/heads\/canary\/rc74-4\"/);
  assert.match(control,/EXPECTED_WORKFLOW_REF=\"iberfit\/iberfit-m26-app\/\.github\/workflows\/exercise-media-auto-factory\.yml@refs\/heads\/canary\/rc74-4\"/);
  assert.match(control,/event_name\|\|\"\"\)!==\"workflow_dispatch\"/);
  assert.match(control,/const attempts=Math\.max\(0,Number\(read\.data\.attempts\|\|0\)-1\)/);
  assert.match(control,/status:\"failed\"/);
  assert.match(control,/AUTO_FACTORY_INFRA_RELEASE/);
  assert.doesNotMatch(control,/storage\.from|finalize_exercise_media|publish/);
});

test('status preflight mirrors queue safety boundaries including stale active work',()=>{
  assert.match(control,/RETRY_AFTER_MS=6\*60\*60\*1000/);
  assert.match(control,/STALE_ACTIVE_MS=2\*60\*60\*1000/);
  assert.match(control,/MAX_ATTEMPTS=3/);
  assert.match(control,/state===\"blocked\"/);
  assert.match(control,/state===\"generating\"\|\|state===\"qa\"/);
  assert.match(control,/staleActive\+=1/);
  assert.match(control,/waitingRetry\+=1/);
  assert.match(control,/eligible_now:eligibleNow/);
});
