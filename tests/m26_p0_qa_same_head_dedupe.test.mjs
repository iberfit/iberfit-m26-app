import test from 'node:test';
import assert from 'node:assert/strict';
import {qaSameHeadDedupe,priorQaRunCanSubstitute} from '../scripts/ops/qa_same_head_run_dedupe.mjs';
const sha='a'.repeat(40),branch='perf/free',repo='iberfit/iberfit-m26-app';
const run=(id,extra={})=>({id,name:'IBERFIT QA Real Write Certification',
 event:'pull_request',head_sha:sha,head_branch:branch,
 status:'completed',conclusion:'success',...extra});
const realJobs=[
 'write-persist-idempotency-isolation','M42 private Client avatar real RLS',
 'connected360-v45-authenticated-synthetic-write',
 'M43 real Coach-Client QA E2E','M43 real Client browser current-source',
];
const job=(status,conclusion)=>realJobs.map(name=>({name,status,conclusion}));
const fake=(runs,jobs)=>async url=>{
 const u=new URL(url),id=Number(u.pathname.match(/\/runs\/(\d+)\/jobs$/u)?.[1]);
 const data=Number.isInteger(id)?{total_count:(jobs[id]||[]).length,jobs:jobs[id]||[]}
 :{total_count:runs.length,workflow_runs:runs};
 return {ok:true,status:200,json:async()=>data};
};
const args=fetchImpl=>({repository:repo,sha,branch,runId:'200',
 token:'synthetic-test-token',fetchImpl});
test('same SHA and earlier real QA evidence can replace duplicate',async()=>{
 const result=await qaSameHeadDedupe(args(fake([run(100)],{100:job('completed','success')})));
 assert.deepEqual(result,{skip:true,priorRunId:100});
});
test('draft, failed, other SHA and other branch never suppress fresh QA',async()=>{
 const cases=[
 {old:run(100),jobs:job('completed','skipped')},
 {old:run(100,{conclusion:'failure'}),jobs:job('completed','success')},
 {old:run(100,{head_sha:'b'.repeat(40)}),jobs:job('completed','success')},
 {old:run(100,{head_branch:'other'}),jobs:job('completed','success')},
 {old:run(250),jobs:job('completed','success')},
 ];
 for(const c of cases){
  const result=await qaSameHeadDedupe(args(fake([c.old],{[c.old.id]:c.jobs})));
  assert.equal(result.skip,false);
 }
});
test('completed-success workflow with skipped or absent real QA job never counts',async()=>{
 const partial=job('completed','success').slice(0,4);
 const skipped=job('completed','success');
 skipped[3]={...skipped[3],conclusion:'skipped'};
 for(const jobs of [partial,skipped]){
  const result=await qaSameHeadDedupe(args(fake([run(100)],{100:jobs})));
  assert.equal(result.skip,false,'all mandatory real jobs must pass');
 }
});
test('in-progress established QA replaces duplicate, but preflight alone does not',()=>{
 assert.equal(priorQaRunCanSubstitute(run(100,{status:'in_progress',conclusion:null}),
  job('queued',null),{sha,branch,currentId:200}),true);
 assert.equal(priorQaRunCanSubstitute(run(100,{status:'in_progress',conclusion:null}),
  [{name:'P0 Supabase Free - reject superseded PR before QA',status:'in_progress'}],
  {sha,branch,currentId:200}),false);
});
test('GitHub outages/uncertainty fail closed; cannot silently bypass certification',async()=>{
 await assert.rejects(qaSameHeadDedupe({...args(fake([],{})),apiBase:'https://wrong.site/'}),/ENDPOINT_INVALID/);
 await assert.rejects(qaSameHeadDedupe({...args(fake([],{})),sha:'invalid'}),/ARGS_INVALID/);
 await assert.rejects(qaSameHeadDedupe(args(async()=>({ok:false,status:503}))),/GITHUB_HTTP_503/);
 await assert.rejects(qaSameHeadDedupe(args(fake(Array.from({length:101},(_,i)=>run(i+1)),{}))),
  /RUN_LIST_UNVERIFIED/);
});
test('all remote write workflows remain required for unique candidate and push',async()=>{
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
