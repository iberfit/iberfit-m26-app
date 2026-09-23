import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {AUTO_FACTORY_PROVIDER_DAILY_QUOTA,detectProviderCapacityReason,fetchWithTransientRetry} from '../scripts/exercise-media/auto-factory-fetch.mjs';
import {qaRetryable,runQa} from '../scripts/exercise-media/worker-ai-system-v1.mjs';

const workflow=await readFile(new URL('../.github/workflows/exercise-media-auto-factory.yml',import.meta.url),'utf8');
const broker=await readFile(new URL('../supabase/functions/iberfit-exercise-media-auto-factory-v1/index.ts',import.meta.url),'utf8');
const worker=await readFile(new URL('../scripts/exercise-media/worker-ai-system-v1.mjs',import.meta.url),'utf8');

test('provider daily quota is classified exactly and not confused with generic transient failures',()=>{
  assert.equal(detectProviderCapacityReason('{"detail":"4006: you have used up your daily free allocation of 10,000 neurons"}'),AUTO_FACTORY_PROVIDER_DAILY_QUOTA);
  assert.equal(detectProviderCapacityReason('{"detail":"temporary 502 upstream"}'),null);
  assert.equal(detectProviderCapacityReason('{"detail":"429 rate limited"}'),null);
  assert.equal(qaRetryable(new Error('error code: 522')),true);
  assert.equal(qaRetryable(new Error('4006: daily free allocation of 10,000 neurons used up')),false);
});

test('daily quota exhaustion fails immediately and persists an auditable deferral marker',async()=>{
  const originalFetch=globalThis.fetch;const dir=await mkdtemp(path.join(os.tmpdir(),'iberfit-provider-capacity-'));const deferFile=path.join(dir,'provider-capacity.json');let calls=0;
  globalThis.fetch=async()=>{calls+=1;return new Response(JSON.stringify({ok:false,error:'AI_BINDING_FAILED',detail:'4006: you have used up your daily free allocation of 10,000 neurons, please upgrade'}),{status:502,headers:{'content-type':'application/json'}});};
  try{
    await assert.rejects(fetchWithTransientRetry('https://example.invalid/qa',{}, {label:'TEST',delaysMs:[1,1],deferFile}),new RegExp(AUTO_FACTORY_PROVIDER_DAILY_QUOTA));
    assert.equal(calls,1,'daily quota is not transient within the same run');
    const marker=JSON.parse(await readFile(deferFile,'utf8'));
    assert.equal(marker.reason,AUTO_FACTORY_PROVIDER_DAILY_QUOTA);
    assert.equal(marker.schema,'iberfit.exercise.media.provider-deferral.v1');
  }finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
});

test('Workers AI proxy retries bounded transient 522 responses but stops immediately at quota 4006',async()=>{
  const sequence=[new Error('error code: 522'),new Error('upstream 522'),new Error('4006: used up your daily free allocation of 10,000 neurons')];let calls=0;
  const env={AI:{run:async()=>{const value=sequence[calls++];if(value instanceof Error)throw value;return value;}}};
  await assert.rejects(runQa(env,{messages:[]},{delaysMs:[0,0,0,0]}),/4006/u);
  assert.equal(calls,3,'quota exhaustion must stop retries as soon as it is revealed');
});

test('workflow checks queue and provider capacity before claim, while mid-run quota uses defer instead of fail',()=>{
  const queue=workflow.indexOf('- name: Inspect queue before provisioning AI proxy');
  const proxy=workflow.indexOf('- name: Create isolated Workers AI proxy');
  const capacity=workflow.indexOf('- name: Verify Workers AI capacity before claim');
  const claim=workflow.indexOf('- name: Claim next missing System v1 exercise');
  assert.ok(queue>=0&&proxy>queue,'queue preflight must happen before proxy provisioning');
  assert.ok(capacity>proxy&&claim>capacity,'provider capacity must be checked after proxy health but before claim');
  assert.match(workflow,/IBERFIT_FACTORY_DEFER_FILE/u);
  assert.match(workflow,/action:"defer"/u);
  assert.match(workflow,/AI_PROVIDER_DAILY_QUOTA_EXHAUSTED/u);
  assert.match(worker,/QA_RETRY_DELAYS_MS=Object\.freeze\(\[750,1500,3000,6000\]\)/u);
  assert.match(worker,/const result=await runQa\(env,body\)/u);
});

test('broker exposes process-workflow-only peek and quota defer without weakening attempt caps',()=>{
  assert.ok(broker.includes('DEFER_REASONS=new Set(["AI_PROVIDER_DAILY_QUOTA_EXHAUSTED"])'));
  assert.ok(broker.includes('if(action==="peek")return await peek(db)'));
  assert.ok(broker.includes('if(action==="defer")return await markDeferred(db,body)'));
  assert.ok(broker.includes('Math.max(0,Number(read.data.attempts||0)-1)'));
  assert.ok(broker.includes('IBERFIT_AUTO_FACTORY_DEFER_STATE_INVALID'));
  assert.ok(broker.includes('MAX_ATTEMPTS=3'));
  assert.ok(broker.includes('requireWorkflow(claims,EXPECTED_PROCESS_WORKFLOW_REF'));
});
