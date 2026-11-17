import test from 'node:test';
import assert from 'node:assert/strict';
import {qaSameHeadDedupe,priorQaRunCanSubstitute} from '../scripts/ops/qa_same_head_run_dedupe.mjs';

const sha='a'.repeat(40),branch='perf/free',repo='iberfit/iberfit-m26-app';
const REQUIRED=[
 'write-persist-idempotency-isolation','M42 private Client avatar real RLS',
 'connected360-v45-authenticated-synthetic-write',
 'M43 real Coach-Client QA E2E','M43 real Client browser current-source',
];
const run=(id,extra={})=>({id,name:'IBERFIT QA Real Write Certification',
 event:'pull_request',head_sha:sha,head_branch:branch,
 status:'completed',conclusion:'success',...extra});
const jobs=()=>REQUIRED.map(name=>({name,status:'completed',conclusion:'success'}));
const fake=(runs,byRun)=>async url=>{
 const u=new URL(url),id=Number(u.pathname.match(/\/runs\/(\d+)\/jobs$/u)?.[1]);
 const data=Number.isInteger(id)?{total_count:(byRun[id]||[]).length,jobs:byRun[id]||[]}
 :{total_count:runs.length,workflow_runs:runs};
 return {ok:true,status:200,json:async()=>data};
};
const args=fetchImpl=>({repository:repo,sha,branch,runId:'200',
 token:'synthetic-test-token',fetchImpl});

test('only five complete successful real QA jobs on the identical head replace a duplicate',async()=>{
 assert.deepEqual(
  await qaSameHeadDedupe(args(fake([run(100)],{100:jobs()}))),
  {skip:true,priorRunId:100});
});

test('never reuse a partially green, skipped, duplicated or running QA certification',async()=>{
 const all=jobs();
 const cases=[
  all.slice(0,1),
  all.slice(0,4),
  all.map((j,i)=>i===4?{...j,conclusion:'skipped'}:j),
  all.map((j,i)=>i===1?{...j,status:'in_progress',conclusion:null}:j),
  all.map((j,i)=>i===2?{...j,conclusion:'failure'}:j),
  [...all,all[0]],
 ];
 for(const evidence of cases){
  assert.equal(priorQaRunCanSubstitute(run(100),evidence,{sha,branch,currentId:200}),false);
  assert.deepEqual(
   await qaSameHeadDedupe(args(fake([run(100)],{100:evidence}))),
   {skip:false,priorRunId:null});
 }
 const active=run(100,{status:'in_progress',conclusion:null});
 assert.equal(priorQaRunCanSubstitute(active,all,{sha,branch,currentId:200}),false);
 assert.deepEqual(
  await qaSameHeadDedupe(args(fake([active],{100:all}))),
  {skip:false,priorRunId:null});
});

test('other SHA, branch, run order, failed run and wrong event cannot suppress QA',async()=>{
 const cases=[
  run(100,{conclusion:'failure'}),
  run(100,{head_sha:'b'.repeat(40)}),
  run(100,{head_branch:'other'}),
  run(250),
  run(100,{event:'push'}),
  run(100,{status:'queued',conclusion:null}),
  run(100,{status:'completed',conclusion:'cancelled'}),
 ];
 for(const old of cases){
  const result=await qaSameHeadDedupe(args(fake([old],{[old.id]:jobs()})));
  assert.deepEqual(result,{skip:false,priorRunId:null});
 }
});

test('GitHub outages/uncertainty fail closed; cannot silently bypass certification',async()=>{
 await assert.rejects(qaSameHeadDedupe({...args(fake([],{})),apiBase:'https://wrong.site/'}),/ENDPOINT_INVALID/);
 await assert.rejects(qaSameHeadDedupe({...args(fake([],{})),sha:'invalid'}),/ARGS_INVALID/);
 await assert.rejects(qaSameHeadDedupe(args(async()=>({ok:false,status:503}))),/GITHUB_HTTP_503/);
 await assert.rejects(qaSameHeadDedupe(args(fake(Array.from({length:101},(_,i)=>run(i+1)),{}))),
  /RUN_LIST_UNVERIFIED/);
});

test('all five authenticated QA jobs remain required on PR and Canary push',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('../.github/workflows/qa-real-write-cert.yml',import.meta.url),'utf8');
 assert.match(src,/steps\.dedupe\.outputs\.run != 'false'/u);
 assert.match(src,/github\.event_name == 'pull_request'/u);
 for(const name of ['m42-avatar-private-real-qa','connected360-v45-synthetic-write',
  'qa-real-write','m43-real-coach-client-qa','m43-real-client-browser']){
  const offset=src.indexOf('\n  '+name+':');
  assert.ok(offset>0,name);
  assert.match(src.slice(offset,offset+330),/needs:/u);
 }
});
