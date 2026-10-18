import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createM26Transport,isFutureIssuedJwtClockSkew,
  M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN,
} from '../src/m26/supabase-transport.js';
import {sessionFailureRequiresFreshLogin} from '../src/m26/app/application.js';

const future={code:'PGRST303',message:'JWT issued at future'};
const okBody={
  ok:true,privileged:false,privilegedRole:null,mfaRequired:false,
  webauthnRequired:false,credentialEnrolled:false,
  iberfitAssurance:'not-required',supabaseAal:'aal1',
};
function makeError(code='PGRST303',message='JWT issued at future',status=401){
  return Object.assign(new Error(message),{status,body:{code,message}});
}
function harness({failures=[],successBody=okBody}={}){
  const calls=[],delays=[];
  const transport=createM26Transport({
    enabled:true,qaOnly:true,projectRef:M26_QA_PROJECT_REF,
    url:M26_QA_SUPABASE_ORIGIN,publishableKey:'public-qa-test-key',
    host:'m26-canary.iberfit.cl',version:'26.0',timeoutMs:3000,
  },{
    authRetryDelay:async(ms)=>{delays.push(ms);},
    fetchImpl:async(url,options)=>{
      const pathname=new URL(url).pathname;
      calls.push({pathname,method:options.method,authorization:options.headers.authorization});
      assert.match(pathname,/^\/rest\/v1\/rpc\/iberfit_privileged_assurance_context_v65d$/);
      const failure=failures[calls.length-1];
      if(failure)return new Response(JSON.stringify(failure.body),{
        status:failure.status,headers:{'content-type':'application/json'},
      });
      return new Response(JSON.stringify(successBody),{
        status:200,headers:{'content-type':'application/json'},
      });
    },
  });
  return {transport,calls,delays};
}

test('only exact future-issued JWT clock skew is recoverable, not arbitrary auth denial',()=>{
  assert.equal(isFutureIssuedJwtClockSkew(makeError()),true);
  assert.equal(sessionFailureRequiresFreshLogin(makeError()),false);
  assert.equal(isFutureIssuedJwtClockSkew(makeError('PGRST303','JWT expired')),false);
  assert.equal(isFutureIssuedJwtClockSkew(makeError('PGRST302','JWT issued at future')),false);
  assert.equal(isFutureIssuedJwtClockSkew(makeError('PGRST303','JWT issued at future',403)),false);
  for(const error of [
    makeError('PGRST303','JWT expired'),
    makeError('PGRST302','JWT issued at future'),
    makeError('invalid_token','JWT rejected'),
    makeError('anything','Unauthorized'),
  ]){
    assert.equal(sessionFailureRequiresFreshLogin(error),true,error.message);
  }
  assert.equal(sessionFailureRequiresFreshLogin(makeError('bad','forbidden',403)),false);
});

test('assurance RPC retries only future-iat with same token and validates the response',async()=>{
  const h=harness({failures:[{status:401,body:future}]});
  const result=await h.transport.authAssuranceContext('synthetic-auth-token');
  assert.equal(result.mfaRequired,false);
  assert.equal(result.privileged,false);
  assert.equal(h.calls.length,2);
  assert.deepEqual(h.delays,[350]);
  assert.deepEqual([...new Set(h.calls.map(x=>x.authorization))],['Bearer synthetic-auth-token']);
  assert.ok(h.calls.every(x=>x.method==='POST'));
});

test('clock skew retry is finite and an exhausted 401 preserves recoverable sign-in, not privilege',async()=>{
  const h=harness({failures:Array.from({length:5},()=>({status:401,body:future}))});
  let failure=null;
  try{await h.transport.authAssuranceContext('synthetic-auth-token');}
  catch(error){failure=error;}
  assert.ok(failure);
  assert.equal(failure.status,401);
  assert.equal(failure.body.code,'PGRST303');
  assert.equal(sessionFailureRequiresFreshLogin(failure),false);
  assert.deepEqual(h.delays,[350,800,1300]);
  assert.equal(h.calls.length,4);
});

test('invalid, expired or forbidden JWT is never retried, and privilege is never assumed',async()=>{
  for(const reason of [
    {status:401,body:{code:'PGRST303',message:'JWT expired'}},
    {status:401,body:{code:'PGRST302',message:'JWT issued at future'}},
    {status:403,body:{code:'PGRST303',message:'JWT issued at future'}},
  ]){
    const h=harness({failures:[reason]});
    await assert.rejects(()=>h.transport.authAssuranceContext('synthetic-auth-token'));
    assert.equal(h.calls.length,1);
    assert.deepEqual(h.delays,[]);
  }
  const invalid=harness({successBody:{ok:true,privileged:false}});
  await assert.rejects(()=>invalid.transport.authAssuranceContext('synthetic-auth-token'),/M26_AUTH_ASSURANCE_INVALID_RESPONSE/);
  assert.equal(invalid.calls.length,1);
});

test('auth retries do not apply to other RPC calls or redefine terminal session policy',()=>{
  assert.equal(sessionFailureRequiresFreshLogin({status:401,body:{code:'refresh_token_not_found'}}),true);
  assert.equal(sessionFailureRequiresFreshLogin(new Error('M26_REFRESH_IDENTITY_MISMATCH')),true);
  assert.equal(sessionFailureRequiresFreshLogin(new Error('M26_MFA_IDENTITY_MISMATCH')),true);
});
