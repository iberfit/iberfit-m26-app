import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createM26Transport,isTransientReadOnlyAssuranceTransportFailure,
  M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN,
} from '../src/m26/supabase-transport.js';
import {AUTH_BUSY_WATCHDOG_MS} from '../src/m26/app/application.js';

const assurance={ok:true,privileged:false,privilegedRole:null,mfaRequired:false,
  webauthnRequired:false,credentialEnrolled:false,iberfitAssurance:'not-required',supabaseAal:'aal1'};
const failure=(status,code='unexpected')=>new Response(JSON.stringify({message:'failure',code}),{
  status,headers:{'content-type':'application/json'},
});
function harness(steps){
  const calls=[],delays=[];
  const transport=createM26Transport({
    enabled:true,qaOnly:true,projectRef:M26_QA_PROJECT_REF,
    url:M26_QA_SUPABASE_ORIGIN,publishableKey:'synthetic-public-test-key',
    host:'m26-canary.iberfit.cl',version:'26.0',timeoutMs:3000,
  },{
    authRetryDelay:async milliseconds=>delays.push(milliseconds),
    fetchImpl:async(url,opts)=>{
      calls.push({path:new URL(url).pathname,authorization:opts.headers.authorization,method:opts.method});
      const next=steps[calls.length-1];
      if(next instanceof Error)throw next;
      if(next instanceof Response)return next;
      return new Response(JSON.stringify(assurance),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  return {transport,calls,delays};
}

test('Only transient transport failures or upstream gateway statuses are retryable',()=>{
  for(const error of [
    new TypeError('Failed to fetch'),
    new TypeError('Load failed'),
    new Error('M26_TIMEOUT'),
    Object.assign(new Error('Bad gateway'),{status:502}),
    Object.assign(new Error('Unavailable'),{status:503}),
    Object.assign(new Error('Timeout'),{status:504}),
  ])assert.equal(isTransientReadOnlyAssuranceTransportFailure(error),true,error.message);
  for(const error of [
    Object.assign(new Error('JWT expired'),{status:401}),
    Object.assign(new Error('not authorized'),{status:403}),
    Object.assign(new Error('statement timeout'),{status:500,body:{code:'57014'}}),
    Object.assign(new TypeError('Failed to fetch'),{status:401}),
    new Error('M26_RESPONSE_TOO_LARGE'),
    new Error('M26_AUTH_ASSURANCE_INVALID_RESPONSE'),
  ])assert.equal(isTransientReadOnlyAssuranceTransportFailure(error),false,error.message);
});

test('Read-only assurance retries a network request once with same JWT and server check',async()=>{
  const h=harness([new TypeError('Failed to fetch')]);
  const result=await h.transport.authAssuranceContext('same-synthetic-jwt');
  assert.equal(result.privileged,false);
  assert.equal(result.webauthnRequired,false);
  assert.equal(h.calls.length,2);
  assert.deepEqual(h.delays,[220]);
  assert.ok(h.calls.every(c=>c.path==='/rest/v1/rpc/iberfit_privileged_assurance_context_v65d'
    &&c.method==='POST'&&c.authorization==='Bearer same-synthetic-jwt'));
  assert.equal(AUTH_BUSY_WATCHDOG_MS,18000,'Do not lengthen the no-freeze UI watchdog');
});

test('Read-only assurance also retries one request timeout or 503',async()=>{
  for(const first of [Object.assign(new Error('network abort'),{name:'AbortError'}),failure(503)]){
    const h=harness([first]);
    const result=await h.transport.authAssuranceContext('synthetic-jwt');
    assert.equal(result.ok,true);
    assert.equal(h.calls.length,2);
    assert.deepEqual(h.delays,[220]);
  }
});

test('Transient outage is bounded: second failure propagates without loops',async()=>{
  const h=harness([new TypeError('Failed to fetch'),new TypeError('Failed to fetch')]);
  await assert.rejects(()=>h.transport.authAssuranceContext('synthetic-jwt'),/Failed to fetch/u);
  assert.equal(h.calls.length,2);
  assert.deepEqual(h.delays,[220]);
});

test('No retry for JWT denials, forbidden, SQL 500 or malformed success body',async()=>{
  for(const first of [
    failure(401,'PGRST302'),failure(403),failure(500,'57014'),
    new Response(JSON.stringify({...assurance,ok:false}),{status:200,headers:{'content-type':'application/json'}}),
  ]){
    const h=harness([first]);
    await assert.rejects(()=>h.transport.authAssuranceContext('synthetic-jwt'));
    assert.equal(h.calls.length,1);
    assert.deepEqual(h.delays,[]);
  }
});

test('Transient and future-iat recovery use independent finite budgets',async()=>{
  const skew=()=>new Response(JSON.stringify({code:'PGRST303',message:'JWT issued at future'}),{
    status:401,headers:{'content-type':'application/json'}});
  const h=harness([new TypeError('Failed to fetch'),skew(),skew(),skew(),skew()]);
  await assert.rejects(()=>h.transport.authAssuranceContext('synthetic-jwt'));
  assert.equal(h.calls.length,5);
  assert.deepEqual(h.delays,[220,350,800,1300]);
});
