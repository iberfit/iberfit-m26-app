import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCTION_DEEP_DEFAULT_ATTEMPTS,
  PRODUCTION_DEEP_DEFAULT_DELAY_MS,
  verifyProductionModuleGraph,
} from '../scripts/verify_production_module_graph.mjs';

const SHA='8c7fa3c3310b08d2126014a9912fd459ff9bec2e';
const BRANCH='canary/rc74-4';
const PROD_REF='pjhmrhejsoofmouedavw';
const PROD_URL=`https://${PROD_REF}.supabase.co`;
const QA_REF='gjztkdwfmunnzhtvxrsu';

function fixture(){
  const versionId=`26.0.0-production.${SHA.slice(0,12)}`;
  const version=JSON.stringify({
    version:versionId,
    sourceSha:SHA,
    sourceBranch:BRANCH,
    environment:'PRODUCTION',
    projectRef:PROD_REF,
    qaOnly:false,
    production:true,
  });
  const runtime=`window.__IBERFIT_M26_RUNTIME__ = Object.freeze(${JSON.stringify({
    enabled:true,
    version:versionId,
    projectRef:PROD_REF,
    url:PROD_URL,
    publishableKey:'sb_publishable_contract_test_123456789',
    qaOnly:false,
    sourceSha:SHA,
  })});`;
  const html='<form data-auth-form="login"></form><img src="/public/isotipo-iberfit.png"><link href="/src/m26/design/auth-native.css"><script src="/m26/runtime-config.js"></script><script type="module" src="/m26/app.js"></script>';
  const app=`
installMinimalAuthBootstrap();
const transport=()=>import('/src/m26/supabase-transport.js');
const vault=()=>import('/src/m26/app/session-vault.js');
createSessionVault().save(session);
const application=()=>import('/src/m26/app/application.js');
`;
  const application=`
import '../domain/optional-number.js';
continueAfterFirstFactor;
authAssuranceContext;
M26_MFA_IDENTITY_MISMATCH;
normalizeAuthorizedRoles;
`;
  const worker='function isReleasePinnedPath(){} async function releaseCacheFirst(){} async function releaseNavigationResponse(){} event.respondWith(releaseCacheFirst(request))';
  const rootWorker="const pinnedShell=true; cache.match('/m26/index.html'); fetchWithDeadline();";
  return {versionId,version,runtime,html,app,application,worker,rootWorker};
}

function response(body,{js=false,index=false,runtime=false,mime=null}={}){
  const headers=new Headers();
  if(js)headers.set('content-type',mime||'text/javascript; charset=utf-8');
  if(runtime)headers.set('cache-control','no-store');
  if(index){
    headers.set('content-security-policy',"default-src 'self'; script-src 'self'; worker-src 'self';");
    headers.set('x-content-type-options','nosniff');
  }
  return new Response(body,{status:200,headers});
}

test('deep verifier keeps strict MIME but retries bounded custom-domain propagation',async()=>{
  assert.equal(PRODUCTION_DEEP_DEFAULT_ATTEMPTS,8);
  assert.equal(PRODUCTION_DEEP_DEFAULT_DELAY_MS,2000);

  const f=fixture();
  let optionalRequests=0;
  const fetchImpl=async url=>{
    const path=new URL(url).pathname;
    if(path==='/m26/version.json')return response(f.version);
    if(path==='/m26/runtime-config.js')return response(f.runtime,{runtime:true});
    if(path==='/m26/index.html')return response(f.html,{index:true});
    if(path==='/')return response(f.html);
    if(path==='/m26/app.js')return response(f.app,{js:true});
    if(path==='/src/m26/app/application.js')return response(f.application,{js:true});
    if(path==='/src/m26/supabase-transport.js')return response('export {};',{js:true});
    if(path==='/src/m26/app/session-vault.js')return response('export {};',{js:true});
    if(path==='/m26/sw.js')return response(f.worker,{js:true});
    if(path==='/m26/iberfit-sw.js')return response(f.rootWorker,{js:true});
    if(path==='/src/m26/domain/optional-number.js'){
      optionalRequests+=1;
      return optionalRequests===1
        ?response('<!doctype html><html>propagating</html>',{js:true,mime:'text/html'})
        :response('export const finiteOptionalNumber=(value)=>value;', {js:true});
    }
    return new Response('',{status:404});
  };

  const retries=[];
  const sleeps=[];
  const result=await verifyProductionModuleGraph({
    baseUrl:'https://app.iberfit.cl',
    sourceSha:SHA,
    sourceBranch:BRANCH,
    prodProjectRef:PROD_REF,
    prodSupabaseUrl:PROD_URL,
    qaProjectRef:QA_REF,
    attempts:2,
    delayMs:17,
    timeoutMs:1000,
    fetchImpl,
    sleepImpl:async ms=>sleeps.push(ms),
    onRetry:event=>retries.push(event),
  });

  assert.equal(result.ok,true);
  assert.equal(result.sourceSha,SHA);
  assert.equal(optionalRequests,2);
  assert.deepEqual(sleeps,[17]);
  assert.equal(retries.length,1);
  assert.equal(retries[0].attempt,1);
  assert.equal(retries[0].totalAttempts,2);
  assert.match(retries[0].code,/PROD_DEEP_JS_MIME_INVALID:\/src\/m26\/domain\/optional-number\.js/u);
});

test('deep verifier still fails closed when invalid MIME persists beyond all attempts',async()=>{
  const f=fixture();
  const fetchImpl=async url=>{
    const path=new URL(url).pathname;
    if(path==='/m26/version.json')return response(f.version);
    if(path==='/m26/runtime-config.js')return response(f.runtime,{runtime:true});
    if(path==='/m26/index.html')return response(f.html,{index:true});
    if(path==='/')return response(f.html);
    if(path==='/m26/app.js')return response(f.app,{js:true});
    if(path==='/src/m26/app/application.js')return response(f.application,{js:true});
    if(path==='/src/m26/supabase-transport.js')return response('export {};',{js:true});
    if(path==='/src/m26/app/session-vault.js')return response('export {};',{js:true});
    if(path==='/m26/sw.js')return response(f.worker,{js:true});
    if(path==='/m26/iberfit-sw.js')return response(f.rootWorker,{js:true});
    if(path==='/src/m26/domain/optional-number.js'){
      return response('<html>still wrong</html>',{js:true,mime:'text/html'});
    }
    return new Response('',{status:404});
  };

  await assert.rejects(
    verifyProductionModuleGraph({
      baseUrl:'https://app.iberfit.cl',
      sourceSha:SHA,
      sourceBranch:BRANCH,
      prodProjectRef:PROD_REF,
      prodSupabaseUrl:PROD_URL,
      qaProjectRef:QA_REF,
      attempts:2,
      delayMs:1,
      timeoutMs:1000,
      fetchImpl,
      sleepImpl:async()=>{},
    }),
    /PROD_DEEP_JS_MIME_INVALID:\/src\/m26\/domain\/optional-number\.js/u,
  );
});
