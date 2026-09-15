import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GITHUB_ACTIONS_APP_ID,
  REQUIRED_EXACT_SOURCE_CHECKS,
  evaluateExactSourceChecks,
} from '../scripts/release/exact-source-quality.mjs';

const SHA='f'.repeat(40);

function run(name,{id=1,status='completed',conclusion='success',sha=SHA,appId=GITHUB_ACTIONS_APP_ID,completedAt='2026-09-15T13:00:00Z'}={}){
  return {id,name,status,conclusion,head_sha:sha,completed_at:completedAt,app:{id:appId,name:'GitHub Actions'}};
}

test('exact-source promotion quality accepts only complete GREEN GitHub Actions evidence',()=>{
  const checkRuns=REQUIRED_EXACT_SOURCE_CHECKS.map((name,index)=>run(name,{id:index+1}));
  const result=evaluateExactSourceChecks({sourceSha:SHA,checkRuns});
  assert.equal(result.ok,true);
  assert.deepEqual(result.missing,[]);
  assert.deepEqual(result.notSuccess,[]);
  assert.equal(Object.keys(result.matched).length,REQUIRED_EXACT_SOURCE_CHECKS.length);
});

test('exact-source promotion quality fails closed on missing or non-success checks',()=>{
  const names=REQUIRED_EXACT_SOURCE_CHECKS.slice(1);
  const checkRuns=names.map((name,index)=>run(name,{id:index+1}));
  checkRuns.push(run(names[0],{id:999,status:'completed',conclusion:'failure',completedAt:'2026-09-15T13:05:00Z'}));
  const result=evaluateExactSourceChecks({sourceSha:SHA,checkRuns});
  assert.equal(result.ok,false);
  assert.deepEqual(result.missing,[REQUIRED_EXACT_SOURCE_CHECKS[0]]);
  assert.equal(result.notSuccess.some((item)=>item.name===names[0]&&item.conclusion==='failure'),true);
});

test('exact-source promotion quality ignores spoofed apps and wrong SHAs',()=>{
  const [required]=REQUIRED_EXACT_SOURCE_CHECKS;
  const result=evaluateExactSourceChecks({
    sourceSha:SHA,
    requiredChecks:[required],
    checkRuns:[
      run(required,{id:1,appId:999}),
      run(required,{id:2,sha:'e'.repeat(40)}),
    ],
  });
  assert.equal(result.ok,false);
  assert.deepEqual(result.missing,[required]);
});

test('exact-source promotion quality uses the latest run for each required context',()=>{
  const [required]=REQUIRED_EXACT_SOURCE_CHECKS;
  const result=evaluateExactSourceChecks({
    sourceSha:SHA,
    requiredChecks:[required],
    checkRuns:[
      run(required,{id:1,conclusion:'success',completedAt:'2026-09-15T12:00:00Z'}),
      run(required,{id:2,conclusion:'failure',completedAt:'2026-09-15T13:00:00Z'}),
    ],
  });
  assert.equal(result.ok,false);
  assert.deepEqual(result.notSuccess,[{name:required,status:'completed',conclusion:'failure'}]);
});

test('exact-source promotion quality rejects invalid source identity and empty policy',()=>{
  assert.throws(()=>evaluateExactSourceChecks({sourceSha:'bad',checkRuns:[]}),/EXACT_SOURCE_SHA_INVALID/);
  assert.throws(()=>evaluateExactSourceChecks({sourceSha:SHA,requiredChecks:[],checkRuns:[]}),/EXACT_SOURCE_REQUIRED_CHECKS_EMPTY/);
});
