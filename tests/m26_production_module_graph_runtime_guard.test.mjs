import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyProductionModuleGraph} from '../scripts/verify_production_module_graph.mjs';

const SOURCE_SHA='8c7fa3c3310b08d2126014a9912fd459ff9bec2e';
const SOURCE_BRANCH='canary/rc74-4';
const PROD_REF='pjhmrhejsoofmouedavw';
const PROD_URL=`https://${PROD_REF}.supabase.co`;
const QA_REF='gjztkdwfmunnzhtvxrsu';

test('deep production preflight accepts canonical runtime followed by installed-app release guard',async()=>{
  const versionId=`26.0.0-production.${SOURCE_SHA.slice(0,12)}`;
  const runtime={
    enabled:true,
    version:versionId,
    projectRef:PROD_REF,
    url:PROD_URL,
    publishableKey:'sb_publishable_contract_test_123456789',
    qaOnly:false,
    sourceSha:SOURCE_SHA
  };
  const runtimeSource=`window.__IBERFIT_M26_RUNTIME__ = Object.freeze(${JSON.stringify(runtime)});
;(function iberfitReleaseGuard(current){
  const state={phase:'repair',nested:{safe:true}};
  if(current?.sourceSha&&state.nested.safe)globalThis.__IBERFIT_RELEASE_GUARD_TEST__=state;
})(window.__IBERFIT_M26_RUNTIME__);
`;
  const versionSource=JSON.stringify({
    version:versionId,
    sourceSha:SOURCE_SHA,
    sourceBranch:SOURCE_BRANCH,
    environment:'PRODUCTION',
    projectRef:PROD_REF,
    qaOnly:false,
    production:true
  });
  const html='<form data-auth-form="login"></form><img src="/public/isotipo-iberfit.png"><link href="/src/m26/design/auth-native.css"><script src="/m26/runtime-config.js"></script><script src="/m26/app.js"></script>';
  const app=`
installMinimalAuthBootstrap();
const transport=()=>import('/src/m26/supabase-transport.js');
const vault=()=>import('/src/m26/app/session-vault.js');
createSessionVault().save(session);
const application=()=>import('/src/m26/app/application.js');
`;
  const application='continueAfterFirstFactor authAssuranceContext M26_MFA_IDENTITY_MISMATCH normalizeAuthorizedRoles';
  const worker='function isReleasePinnedPath(){} async function releaseCacheFirst(){} async function releaseNavigationResponse(){} event.respondWith(releaseCacheFirst(request))';
  const rootWorker="const pinnedShell=true; cache.match('/m26/index.html'); fetchWithDeadline();";
  const jsPaths=new Set([
    '/m26/app.js',
    '/src/m26/app/application.js',
    '/src/m26/supabase-transport.js',
    '/src/m26/app/session-vault.js',
    '/m26/sw.js',
    '/m26/iberfit-sw.js'
  ]);

  const fetchImpl=async url=>{
    const requestPath=new URL(url).pathname;
    let body='';
    if(requestPath==='/m26/version.json')body=versionSource;
    else if(requestPath==='/m26/runtime-config.js')body=runtimeSource;
    else if(requestPath==='/m26/index.html'||requestPath==='/')body=html;
    else if(requestPath==='/m26/app.js')body=app;
    else if(requestPath==='/src/m26/app/application.js')body=application;
    else if(requestPath==='/m26/sw.js')body=worker;
    else if(requestPath==='/m26/iberfit-sw.js')body=rootWorker;
    else if(requestPath==='/src/m26/supabase-transport.js'||requestPath==='/src/m26/app/session-vault.js')body='export {};';
    else return new Response('',{status:404});

    const headers=new Headers();
    if(jsPaths.has(requestPath))headers.set('content-type','text/javascript; charset=utf-8');
    if(requestPath==='/m26/runtime-config.js')headers.set('cache-control','no-store');
    if(requestPath==='/m26/index.html'){
      headers.set('content-security-policy',"default-src 'self'; script-src 'self'; worker-src 'self';");
      headers.set('x-content-type-options','nosniff');
    }
    return new Response(body,{status:200,headers});
  };

  const result=await verifyProductionModuleGraph({
    baseUrl:'https://preview.iberfit-m26-production.pages.dev',
    sourceSha:SOURCE_SHA,
    sourceBranch:SOURCE_BRANCH,
    prodProjectRef:PROD_REF,
    prodSupabaseUrl:PROD_URL,
    qaProjectRef:QA_REF,
    attempts:1,
    delayMs:1,
    timeoutMs:1000,
    fetchImpl,
    sleepImpl:async()=>{}
  });

  assert.equal(result.ok,true);
  assert.equal(result.sourceSha,SOURCE_SHA);
  assert.equal(result.version,versionId);
});
