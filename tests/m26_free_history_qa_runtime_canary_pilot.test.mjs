import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const generator='scripts/generate_rc74_4_runtime_config.mjs';
const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
function generate(flag,overrides={}){
  const dir=mkdtempSync(join(tmpdir(),'iberfit-free-runtime-'));
  mkdirSync(join(dir,'m26'),{recursive:true});
  try{
    const env={...process.env,
      M26_BUILD_DIR:dir,M26_PROJECT_REF:'gjztkdwfmunnzhtvxrsu',
      M26_SUPABASE_URL:QA,M26_QA_ONLY:'true',
      M26_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_qa_only',
      ...overrides,
    };
    if(flag===undefined)delete env.M26_QA_CLIENT_A_FREE_HISTORY_PILOT;
    else env.M26_QA_CLIENT_A_FREE_HISTORY_PILOT=flag;
    const run=spawnSync(process.execPath,[generator],{env,cwd:process.cwd(),
      encoding:'utf8',timeout:12000});
    const runtime=run.status===0?
      readFileSync(join(dir,'m26','runtime-config.js'),'utf8'):'';
    return {run,runtime};
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('QA pilot is off by default, even for QA build',()=>{
  for(const flag of [undefined,'false']){
    const {run,runtime}=generate(flag);
    assert.equal(run.status,0,run.stderr);
    assert.match(runtime,/"freeClientCompletedHistoryDemand": false/u);
    assert.match(runtime,/"qaOnly": true/u);
  }
});
test('explicitly true QA pilot enables only client-gated runtime flag',()=>{
  const {run,runtime}=generate('true');
  assert.equal(run.status,0,run.stderr);
  assert.match(runtime,/"freeClientCompletedHistoryDemand": true/u);
  assert.match(runtime,/"projectRef": "gjztkdwfmunnzhtvxrsu"/u);
});
test('invalid flags, cross-project, PROD origin and privileged API key fail closed',()=>{
  for(const flag of ['1','yes','maybe']){
    const {run}=generate(flag);assert.notEqual(run.status,0,flag);
  }
  for(const overrides of [
    {M26_QA_ONLY:'false'},
    {M26_PROJECT_REF:'pjhmrhejsoofmouedavw'},
    {M26_SUPABASE_URL:'https://pjhmrhejsoofmouedavw.supabase.co'},
    {M26_SUPABASE_PUBLISHABLE_KEY:'service_role_not_allowed'},
  ]){const {run}=generate('true',overrides);assert.notEqual(run.status,0);}
});
test('deployment uses QA generator and only synthetic client A can mount history',()=>{
  const workflow=readFileSync('.github/workflows/canary-exact-deploy.yml','utf8');
  const application=readFileSync('src/m26/app/application.js','utf8');
  assert.match(workflow,/M26_QA_CLIENT_A_FREE_HISTORY_PILOT: 'true'/u);
  assert.ok(workflow.includes('"freeClientCompletedHistoryDemand"'));
  assert.match(application,/runtime\.qaOnly===true&&runtime\.canary===true/u);
  assert.match(application,/runtimeConfig\?\.freeClientCompletedHistoryDemand===true/u);
  assert.match(application,/qa\.rc74\.client-a@iberfit\.cl/u);
  assert.match(application,/store\.getState\(\)\.identity\?\.role==='client'/u);
});
