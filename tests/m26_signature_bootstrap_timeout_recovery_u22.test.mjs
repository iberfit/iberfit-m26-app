import test from 'node:test';
import assert from 'node:assert/strict';
import {createM26Transport,isBootstrapStatementTimeout,M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN} from '../src/m26/supabase-transport.js';

const token='qa-synthetic-nonsecret-token';
const timeoutBody={code:'57014',message:'canceling statement due to statement timeout'};
const readBody={user:{role:'coach'},data:{clients:[]},environment:'qa'};
function fixture(statuses){
  const calls=[],delays=[];
  const transport=createM26Transport({
    enabled:true,qaOnly:true,projectRef:M26_QA_PROJECT_REF,
    url:M26_QA_SUPABASE_ORIGIN,publishableKey:'synthetic-publishable-key-qa',
    timeoutMs:12000,version:'SIGNATURE-U22-RECOVERY-QA',
  },{
    fetchImpl:async(url,options)=>{
      const pathname=new URL(url).pathname;
      calls.push({pathname,method:options.method,auth:options.headers?.authorization});
      const response=statuses[Math.min(calls.length-1,statuses.length-1)];
      return new Response(JSON.stringify(response.body),{
        status:response.status,headers:{'content-type':'application/json'},
      });
    },
    authRetryDelay:async(ms)=>{delays.push(ms);},
  });
  return {transport,calls,delays};
}

test('statement timeout classifier is strict; auth and unrelated errors are never retryable',()=>{
  assert.equal(isBootstrapStatementTimeout({status:500,body:timeoutBody}),true);
  for(const error of [
    {status:401,body:timeoutBody},{status:403,body:timeoutBody},
    {status:503,body:timeoutBody},
    {status:500,body:{code:'57014',message:'canceling statement due to user request'}},
    {status:500,body:{code:'PGRST301',message:timeoutBody.message}},
    {status:500,body:{message:timeoutBody.message}},
    {status:500,body:{code:'57014'}},
    new Error('M26_TIMEOUT'),
  ])assert.equal(isBootstrapStatementTimeout(error),false);
});

test('read bootstrap retries exactly once on SQLSTATE 57014 preserving JWT and RPC',async()=>{
  const f=fixture([{status:500,body:timeoutBody},{status:200,body:readBody}]);
  assert.deepEqual(await f.transport.bootstrap(token),readBody);
  assert.equal(f.calls.length,2);
  assert.deepEqual(f.delays,[220]);
  for(const call of f.calls){
    assert.equal(call.pathname,'/rest/v1/rpc/iberfit_bootstrap_v26');
    assert.equal(call.method,'POST');
    assert.equal(call.auth,'Bearer '+token);
  }
});

test('two statement timeouts fail closed after one retry with no loop',async()=>{
  const f=fixture([{status:500,body:timeoutBody},{status:500,body:timeoutBody}]);
  await assert.rejects(f.transport.bootstrap(token),error=>
    error.status===500&&error.body?.code==='57014');
  assert.equal(f.calls.length,2);
  assert.deepEqual(f.delays,[220]);
});

test('unauthorized and unrelated errors never retry',async()=>{
  for(const [status,body] of [
    [401,{code:'PGRST303',message:'JWT expired'}],
    [403,{code:'42501',message:'permission denied'}],
    [500,{code:'XX000',message:'internal DB error'}],
  ]){
    const f=fixture([{status,body}]);
    await assert.rejects(f.transport.bootstrap(token));
    assert.equal(f.calls.length,1);
    assert.deepEqual(f.delays,[]);
  }
});

test('mutating command never retries even on SQLSTATE 57014',async()=>{
  const f=fixture([{status:500,body:timeoutBody}]);
  await assert.rejects(f.transport.execute(token,{type:'synthetic-command'}));
  assert.equal(f.calls.length,1);
  assert.deepEqual(f.delays,[]);
  assert.equal(f.calls[0].pathname,'/rest/v1/rpc/iberfit_execute_command_v26');
});

test('successful read bootstrap makes one request without delay',async()=>{
  const f=fixture([{status:200,body:readBody}]);
  assert.deepEqual(await f.transport.bootstrap(token),readBody);
  assert.equal(f.calls.length,1);
  assert.deepEqual(f.delays,[]);
});
