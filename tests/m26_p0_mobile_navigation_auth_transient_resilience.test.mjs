import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createM26Transport,M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN} from '../src/m26/supabase-transport.js';
import {routeViewTransitionsEnabled,runRouteViewTransition} from '../src/m26/experience/route-view-transitions.js';

const runtime=Object.freeze({
  enabled:true,
  qaOnly:true,
  projectRef:M26_QA_PROJECT_REF,
  url:M26_QA_SUPABASE_ORIGIN,
  publishableKey:'sb_publishable_test_key',
  timeoutMs:1_000,
  version:'26.0.0-test',
  rpc:{
    bootstrap:'iberfit_bootstrap_v26',
    preflight:'iberfit_command_preflight_v26',
    execute:'iberfit_execute_command_v26',
  },
});

function authBody(){
  return {
    access_token:'token-test',
    refresh_token:'refresh-test',
    expires_at:2_000_000_000,
    user:{id:'11111111-1111-4111-8111-111111111111',email:'qa.rc74.client-a@iberfit.cl'},
  };
}
function jsonResponse(body,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{'content-type':'application/json'},
  });
}

test('password login retries exactly once after a transient 504 and then succeeds',async()=>{
  let calls=0;
  const delays=[];
  const transport=createM26Transport(runtime,{
    authRetryDelay:async(ms)=>{delays.push(ms);},
    fetchImpl:async()=>{
      calls+=1;
      if(calls===1)return jsonResponse({message:'gateway timeout'},504);
      return jsonResponse(authBody(),200);
    },
  });

  const session=await transport.login('qa.rc74.client-a@iberfit.cl','password-qa');
  assert.equal(calls,2);
  assert.deepEqual(delays,[220]);
  assert.equal(session.user.email,'qa.rc74.client-a@iberfit.cl');
});

test('password login retries one immediate network failure but never loops',async()=>{
  let calls=0;
  const transport=createM26Transport(runtime,{
    authRetryDelay:async()=>{},
    fetchImpl:async()=>{
      calls+=1;
      if(calls===1)throw new TypeError('Failed to fetch');
      return jsonResponse(authBody(),200);
    },
  });

  await transport.login('qa.rc74.client-a@iberfit.cl','password-qa');
  assert.equal(calls,2);
});

test('invalid credentials never trigger the transient login retry',async()=>{
  let calls=0;
  let delays=0;
  const transport=createM26Transport(runtime,{
    authRetryDelay:async()=>{delays+=1;},
    fetchImpl:async()=>{
      calls+=1;
      return jsonResponse({message:'invalid login credentials'},400);
    },
  });

  await assert.rejects(
    ()=>transport.login('qa.rc74.client-a@iberfit.cl','password-qa'),
    (error)=>Number(error?.status)===400,
  );
  assert.equal(calls,1);
  assert.equal(delays,0);
});

test('touch and coarse-pointer navigation bypasses decorative View Transitions',()=>{
  const fakeDocument={startViewTransition(){throw new Error('must not run on touch');}};
  const touchWindow={
    navigator:{maxTouchPoints:5},
    matchMedia(query){return {matches:query==='(pointer: coarse)'};},
  };
  assert.equal(routeViewTransitionsEnabled({documentLike:fakeDocument,windowLike:touchWindow}),false);

  let updates=0;
  const transition=runRouteViewTransition(
    ()=>{updates+=1;},
    {documentLike:fakeDocument,windowLike:touchWindow},
  );
  assert.equal(transition,null);
  assert.equal(updates,1);
});

test('fine-pointer desktop keeps bounded View Transitions available',()=>{
  let callback=null;
  const transition={finished:Promise.resolve(),skipTransition(){}};
  const fakeDocument={
    startViewTransition(fn){callback=fn;fn();return transition;},
  };
  const pointerWindow={
    navigator:{maxTouchPoints:0},
    matchMedia(){return {matches:false};},
    setTimeout,
    clearTimeout,
  };
  assert.equal(routeViewTransitionsEnabled({documentLike:fakeDocument,windowLike:pointerWindow}),true);

  let updates=0;
  const result=runRouteViewTransition(
    ()=>{updates+=1;},
    {documentLike:fakeDocument,windowLike:pointerWindow},
  );
  assert.equal(result,transition);
  assert.equal(typeof callback,'function');
  assert.equal(updates,1);
});

test('remote authenticated gate mirrors the same single transient token retry policy',()=>{
  const source=fs.readFileSync('scripts/remote-gates/run_authenticated_readonly_gate.mjs','utf8');
  assert.match(source,/authTokenRequest\?2:1/u);
  assert.match(source,/\[502,503,504\]/u);
  assert.match(source,/setTimeout\(resolve,220\)/u);
  assert.doesNotMatch(source,/attempt<3|attempt<=2/u);
});
