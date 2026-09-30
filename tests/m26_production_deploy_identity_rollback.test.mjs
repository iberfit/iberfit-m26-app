import test from 'node:test';
import assert from 'node:assert/strict';

import {verifyProductionSurface} from '../scripts/verify_production_surface.mjs';
import {
  classifyLiveSha,
  isRestoredIdentity,
  isRestoredReleaseIdentity,
} from '../scripts/ops/rollback_production_on_failure.mjs';

const SOURCE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PREVIOUS_SHA='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SOURCE_BRANCH='canary/rc74-4';
const PROD_REF='pjhmrhejsoofmouedavw';
const PROD_URL='https://pjhmrhejsoofmouedavw.supabase.co';
const QA_REF='gjztkdwfmunnzhtvxrsu';
const WORKER_VERSION='m26-prod-aaaaaaaaaaaa';
const PREVIOUS_WORKER_VERSION='m26-prod-bbbbbbbbbbbb';

function sources(wrapperVersion=WORKER_VERSION){
  return {
    '/m26/version.json':JSON.stringify({
      sourceSha:SOURCE_SHA,
      sourceBranch:SOURCE_BRANCH,
      environment:'PRODUCTION',
      production:true,
      qaOnly:false,
      projectRef:PROD_REF,
      serviceWorkerVersion:WORKER_VERSION,
    }),
    '/m26/runtime-config.js':`window.__IBERFIT_M26_RUNTIME__ = Object.freeze(${JSON.stringify({
      enabled:true,
      qaOnly:false,
      projectRef:PROD_REF,
      url:PROD_URL,
      sourceSha:SOURCE_SHA,
      publishableKey:'sb_publishable_test',
    })});`,
    '/m26/index.html':'/public/isotipo-iberfit.png /src/m26/design/auth-native.css',
    '/m26/sw.js':`const VERSION='${WORKER_VERSION}';\nconst PREVIOUS_VERSION='${PREVIOUS_WORKER_VERSION}';\n`,
    '/m26/iberfit-sw.js':`const IBERFIT_SERVICE_WORKER_RELEASE='${wrapperVersion}';\nimportScripts('/m26/sw.js');\n`,
  };
}

test('production certification requires consecutive coherent release passes',async()=>{
  let requestCount=0;
  const perAttempt=[
    sources(),
    sources(PREVIOUS_WORKER_VERSION),
    sources(),
    sources(),
  ];
  const fetchImpl=async(url)=>{
    const attempt=Math.floor(requestCount/5);
    requestCount+=1;
    const path=new URL(url).pathname;
    return new Response(perAttempt[Math.min(attempt,perAttempt.length-1)][path],{status:200});
  };
  const retries=[];
  const result=await verifyProductionSurface({
    baseUrl:'https://app.iberfit.cl',
    sourceSha:SOURCE_SHA,
    sourceBranch:SOURCE_BRANCH,
    prodProjectRef:PROD_REF,
    prodSupabaseUrl:PROD_URL,
    qaProjectRef:QA_REF,
    attempts:6,
    delayMs:1,
    stablePasses:2,
    timeoutMs:1000,
    fetchImpl,
    sleepImpl:async()=>{},
    onRetry:(entry)=>retries.push(entry.code),
  });
  assert.equal(result.attempt,4);
  assert.ok(retries.includes('PROD_SURFACE_SERVICE_WORKER_WRAPPER_VERSION_MISMATCH'));
  assert.equal(retries.filter(code=>code==='PROD_SURFACE_STABILITY_CONFIRMATION_PENDING').length,2);
});

test('rollback release identity requires version, worker and wrapper to converge together',()=>{
  const version={
    sourceSha:PREVIOUS_SHA,
    environment:'PRODUCTION',
    projectRef:PROD_REF,
    qaOnly:false,
    production:true,
  };
  const swSource=`const VERSION='${PREVIOUS_WORKER_VERSION}';\nconst PREVIOUS_VERSION='m26-prod-cccccccccccc';\n`;
  const wrapperSource=`const IBERFIT_SERVICE_WORKER_RELEASE='${PREVIOUS_WORKER_VERSION}';\nimportScripts('/m26/sw.js');\n`;
  assert.equal(isRestoredIdentity(version,{previousSha:PREVIOUS_SHA,prodRef:PROD_REF}),true);
  assert.equal(isRestoredReleaseIdentity({version,swSource,wrapperSource},{previousSha:PREVIOUS_SHA,prodRef:PROD_REF}),true);
  assert.equal(isRestoredReleaseIdentity({
    version,
    swSource,
    wrapperSource:wrapperSource.replace(PREVIOUS_WORKER_VERSION,WORKER_VERSION),
  },{previousSha:PREVIOUS_SHA,prodRef:PROD_REF}),false);
});

test('rollback classification remains fail-closed for third-party live identity',()=>{
  assert.equal(classifyLiveSha(SOURCE_SHA,SOURCE_SHA,PREVIOUS_SHA),'rollback-required');
  assert.equal(classifyLiveSha(PREVIOUS_SHA,SOURCE_SHA,PREVIOUS_SHA),'already-restored');
  assert.throws(
    ()=>classifyLiveSha('cccccccccccccccccccccccccccccccccccccccc',SOURCE_SHA,PREVIOUS_SHA),
    /PRODUCTION_ROLLBACK_LIVE_SHA_UNEXPECTED/,
  );
});
