import test from 'node:test';
import assert from 'node:assert/strict';
import {createM26Transport,isBootstrapStatementTimeout,isFutureIssuedJwtClockSkew,M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN} from '../src/m26/supabase-transport.js';

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

const futureJwt={code:'PGRST303',message:'JWT issued at future'};

test('future JWT skew classifier excludes generic 401, expired or malformed JWT and other status',()=>{
  assert.equal(isFutureIssuedJwtClockSkew({status:401,body:futureJwt}),true);
  for(const error of [
    {status:403,body:futureJwt},
    {status:401,body:{code:'PGRST301',message:futureJwt.message}},
    {status:401,body:{code:'PGRST303',message:'JWT expired'}},
    {status:401,body:{code:'PGRST303',message:'JWT claims parsing failed'}},
    {status:401,body:{message:futureJwt.message}},
    {status:500,body:futureJwt},
  ])assert.equal(isFutureIssuedJwtClockSkew(error),false);
});

test('future-iat skew recovery retries read-only bootstrap with same JWT and original RPC',async()=>{
  const f=fixture([{status:401,body:futureJwt},{status:200,body:readBody}]);
  assert.deepEqual(await f.transport.bootstrap(token),readBody);
  assert.deepEqual(f.delays,[350]);
  assert.equal(f.calls.length,2);
  for(const call of f.calls){
    assert.equal(call.pathname,'/rest/v1/rpc/iberfit_bootstrap_v26');
    assert.equal(call.method,'POST');
    assert.equal(call.auth,'Bearer '+token);
  }
});

test('future-iat skew failure stops after exactly three retries and no infinite loop',async()=>{
  const f=fixture(Array.from({length:4},()=>({status:401,body:futureJwt})));
  await assert.rejects(f.transport.bootstrap(token),error=>
    error.status===401&&error.body?.code==='PGRST303');
  assert.equal(f.calls.length,4);
  assert.deepEqual(f.delays,[350,800,1300]);
});

test('future-iat skew and SQL statement timeout have separate finite retry budgets',async()=>{
  const f=fixture([{status:401,body:futureJwt},{status:500,body:timeoutBody},{status:200,body:readBody}]);
  assert.deepEqual(await f.transport.bootstrap(token),readBody);
  assert.equal(f.calls.length,3);
  assert.deepEqual(f.delays,[350,220]);
});

test('future JWT skew cannot cause a mutating-command retry or retry expired bootstrap JWT',async()=>{
  const f=fixture([{status:401,body:futureJwt}]);
  await assert.rejects(f.transport.execute(token,{type:'synthetic-command'}),error=>error.status===401);
  assert.equal(f.calls.length,1);
  assert.deepEqual(f.delays,[]);
  const expired=fixture([{status:401,body:{code:'PGRST303',message:'JWT expired'}}]);
  await assert.rejects(expired.transport.bootstrap(token),error=>error.status===401);
  assert.equal(expired.calls.length,1);
  assert.deepEqual(expired.delays,[]);
});
