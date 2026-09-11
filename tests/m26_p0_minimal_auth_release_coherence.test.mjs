import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyProductionModuleGraph} from '../scripts/verify_production_module_graph.mjs';

const SHA='1234567890abcdef1234567890abcdef12345678';
const BRANCH='canary/rc74-4';
const PROD_REF='pjhmrhejsoofmouedavw';
const PROD_URL='https://'+PROD_REF+'.supabase.co';
const QA_REF='gjztkdwfmunnzhtvxrsu';
const VERSION='26.0.0-production.'+SHA.slice(0,12);

const index=[
  '<form data-auth-form="login"></form>',
  '<img src="/public/isotipo-iberfit.png">',
  '<link href="/src/m26/design/auth-native.css">',
  '<script src="/m26/runtime-config.js"></script>',
  '<script type="module" src="/src/m26/experience/session-haptics.js"></script>',
  '<script type="module" src="/m26/app.js"></script>',
].join('');

const app=[
  'function installMinimalAuthBootstrap(){}',
  "import('/src/m26/supabase-transport.js');",
  "import('/src/m26/app/session-vault.js');",
  'createSessionVault().save(session);',
  "import('/src/m26/app/application.js');",
].join('\n');

const application=[
  "import './child.js';",
  'const continueAfterFirstFactor=true;',
  'const authAssuranceContext=true;',
  'const M26_MFA_IDENTITY_MISMATCH=true;',
  'const normalizeAuthorizedRoles=true;',
].join('\n');

const worker=[
  'function isReleasePinnedPath(pathname){}',
  'async function releaseCacheFirst(request){}',
  'async function releaseNavigationResponse(request){}',
  'event.respondWith(releaseCacheFirst(request));',
].join('\n');

const rootWorker=[
  'const pinnedShell=true;',
  "cache.match('/m26/index.html');",
  'fetchWithDeadline(request);',
].join('\n');

function runtime(){
  return 'window.__IBERFIT_M26_RUNTIME__ = Object.freeze('+JSON.stringify({
    enabled:true,
    version:VERSION,
    projectRef:PROD_REF,
    url:PROD_URL,
    publishableKey:'sb_publishable_contract_test_123456789',
    qaOnly:false,
  })+');';
}

function version(){
  return JSON.stringify({
    release:'IBERFIT_M26_PRODUCTION_'+SHA.slice(0,12).toUpperCase(),
    version:VERSION,
    sourceSha:SHA,
    sourceBranch:BRANCH,
    environment:'PRODUCTION',
    projectRef:PROD_REF,
    qaOnly:false,
    production:true,
  });
}

function response(body,{type='application/javascript',cache='no-cache',security=false}={}){
  const headers={
    'content-type':type,
    'cache-control':cache,
  };
  if(security){
    headers['content-security-policy']="default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self' "+PROD_URL;
    headers['x-content-type-options']='nosniff';
  }
  return new Response(body,{status:200,headers});
}

function fetcher({htmlAt=null}={}){
  return async value=>{
    const path=new URL(value).pathname;
    if(path==='/m26/version.json')return response(version(),{type:'application/json',cache:'no-store'});
    if(path==='/m26/runtime-config.js')return response(runtime(),{cache:'no-store'});
    if(path==='/m26/index.html'||path==='/')return response(index,{type:'text/html',security:true});
    if(path===htmlAt)return response('<!doctype html><html></html>',{type:'text/html'});
    const modules={
      '/m26/app.js':app,
      '/src/m26/app/application.js':application,
      '/src/m26/app/child.js':'export const child=true;',
      '/src/m26/supabase-transport.js':'export const transport=true;',
      '/src/m26/app/session-vault.js':'export const vault=true;',
      '/src/m26/experience/session-haptics.js':'export const haptics=true;',
      '/m26/sw.js':worker,
      '/m26/iberfit-sw.js':rootWorker,
    };
    if(path in modules)return response(modules[path]);
    return new Response('',{status:404});
  };
}

test('P0 deep production gate validates exact release identity and recursive module graph',async()=>{
  const result=await verifyProductionModuleGraph({
    baseUrl:'https://app.example.test',
    sourceSha:SHA,
    sourceBranch:BRANCH,
    prodProjectRef:PROD_REF,
    prodSupabaseUrl:PROD_URL,
    qaProjectRef:QA_REF,
    attempts:1,
    delayMs:1,
    timeoutMs:200,
    fetchImpl:fetcher(),
    sleepImpl:async()=>{},
  });
  assert.equal(result.ok,true);
  assert.equal(result.version,VERSION);
  assert.ok(result.moduleCount>=6);
});

test('P0 deep production gate rejects HTML returned for an executable module',async()=>{
  await assert.rejects(
    verifyProductionModuleGraph({
      baseUrl:'https://app.example.test',
      sourceSha:SHA,
      sourceBranch:BRANCH,
      prodProjectRef:PROD_REF,
      prodSupabaseUrl:PROD_URL,
      qaProjectRef:QA_REF,
      attempts:1,
      delayMs:1,
      timeoutMs:200,
      fetchImpl:fetcher({htmlAt:'/src/m26/app/child.js'}),
      sleepImpl:async()=>{},
    }),
    /PROD_DEEP_JS_MIME_INVALID:\/src\/m26\/app\/child\.js/u,
  );
});

test('production runtime diagnostic version is derived from exact source SHA',()=>{
  const generator=fs.readFileSync('scripts/generate_final_production_runtime_config.mjs','utf8');
  assert.match(generator,/const shortSha=sourceSha\.slice\(0,12\)/u);
  assert.match(generator,/26\.0\.0-production\.\$\{shortSha\}/u);
  assert.match(generator,/IBERFIT_M26_PRODUCTION_\$\{shortSha\.toUpperCase\(\)\}/u);
});
