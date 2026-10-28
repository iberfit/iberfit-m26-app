import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHydrationCoordinator} from '../src/m26/app/hydration-coordinator.js';
import {createM26Transport,M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN} from '../src/m26/supabase-transport.js';
import {createPrivilegedHistoryAssembler} from '../src/m26/domain/privileged-history-assembler.js';

const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const CLIENT='10000000-0000-4000-8000-000000000001';
const DATE='2026-10-21T12:00:00.000Z';
const core=()=>({environment:'QA',user:{role:'coach'},remoteRevisions:{},data:{
  clients:[{id:CLIENT}],m26Entities:[],domainEvents:[],sessionExecutions:[],
}});
const response=payload=>new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
const runtime={enabled:true,qaOnly:true,projectRef:M26_QA_PROJECT_REF,url:M26_QA_SUPABASE_ORIGIN,publishableKey:'synthetic-key',timeoutMs:8000};

test('B36 cancellation aborts current owner read and prevents a queued redundant hydration pass',async()=>{
  const slow=deferred(),seen=[];
  const owner={},coordinator=createHydrationCoordinator(({signal,reason})=>{
    seen.push({signal,reason});return slow.promise;
  },{getOwner:()=>owner});
  const first=coordinator.request({reason:'login'});
  const second=coordinator.request({reason:'foreground'});
  await tick();
  assert.equal(seen.length,1);
  assert.equal(coordinator.cancel(),true);
  assert.equal(seen[0].signal.aborted,true);
  slow.resolve('obsolete');
  await assert.rejects(first,/M26_HYDRATION_CANCELLED/);
  await assert.rejects(second,/M26_HYDRATION_CANCELLED/);
  assert.equal(seen.length,1,'obsolete requests may never dispatch another pass');
  assert.equal(coordinator.cancel(),false);
});

test('B36 canonical bootstrap uses request abort without retrying',async()=>{
  const calls=[];
  const transport=createM26Transport(runtime,{fetchImpl:(_,options)=>{
    calls.push(options);
    return new Promise((_,reject)=>{
      options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
    });
  }});
  const controller=new AbortController();
  const pending=transport.bootstrap('synthetic-token',{signal:controller.signal});
  await tick();
  assert.equal(calls.length,1);
  controller.abort();
  await assert.rejects(pending,/M26_REQUEST_CANCELLED/);
  assert.equal(calls.length,1,'cancelled read may not trigger a retry');
});

test('B36 QA historical fan-out aborts in-flight reads; never assembles a partial privileged snapshot',async()=>{
  const calls=[];
  const transport=createM26Transport(runtime,{fetchImpl:(url,options)=>{
    const path=new URL(url).pathname;
    calls.push({path,signal:options.signal});
    if(path.endsWith('/iberfit_bootstrap_v26_core_u37_qa'))return Promise.resolve(response(core()));
    return new Promise((_,reject)=>{
      options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
    });
  }});
  const controller=new AbortController();
  const pending=transport.bootstrapQaCoachWithHistory('synthetic-token',{signal:controller.signal});
  for(let i=0;i<15&&calls.length<4;i++)await tick();
  assert.equal(calls.length,4,'three bounded history workers after the core');
  controller.abort();
  await assert.rejects(pending,/M26_REQUEST_CANCELLED|U39_HISTORY_CANCELLED/);
  assert.equal(calls.length,4,'no further pagination after cancellation');
  assert.equal(calls.every(c=>c.signal.aborted),true);
});

test('B36 sorting preserves descending bigint tie breaks',()=>{
  const owner={},assembler=createPrivilegedHistoryAssembler(core(),{owner,profile:'u38-qa-adaptive'});
  const emptyRequest={cursor:null,snapshotAt:null,expectedCount:null};
  const makePage=(section,records)=>({schema:'iberfit.u35.privileged-history-page.qa.v1',
    section,snapshotAt:DATE,records,totalCount:records.length,hasMore:false,nextCursor:null,remoteRevisions:{}});
  for(const section of ['m26Entities','domainEvents','sessionExecutions']){
    const records=section==='domainEvents'?[1,3,2].map(id=>({client_id:CLIENT,id,created_at:DATE})):[];
    assembler.accept({owner,clientId:CLIENT,section,request:emptyRequest,page:makePage(section,records)});
  }
  assert.deepEqual(assembler.finish({owner}).data.domainEvents.map(e=>e.id),[3,2,1]);
  const source=readFileSync(new URL('../src/m26/domain/privileged-history-assembler.js',import.meta.url),'utf8');
  assert.match(source,/function sortEventsOnce\(records\)/);
  assert.doesNotMatch(source,/function compareEvents\(/);
});

test('B36 cancellation also fences logout, account switch, expiry and app teardown',()=>{
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const a=app.indexOf('function surfaceRetriableSessionFailure(');
  const b=app.indexOf('function discardSessionAfterFailure(',a);
  assert.ok(a>=0&&b>a);
  assert.match(app.slice(a,b),/hydrationCoordinator\.cancel\(\)/);
  assert.match(app,/function finishLogout\([^\n]+\)\{hydrationCoordinator\.cancel\(\)/);
  assert.match(app,/if\(action==='use-another-account'\)\{\s*hydrationCoordinator\.cancel\(\)/);
  assert.match(app,/function discardSessionAfterFailure\([^\n]+\)\{\s*hydrationCoordinator\.cancel\(\)/);
  assert.match(app,/async function hydratePass\(\{reason='bootstrap',ownerSession,signal\}/);
  assert.match(app,/bootstrapQaCoachWithHistory\(currentToken\(\),\{assertOwner:requireOwner,signal\}\)/);
});
