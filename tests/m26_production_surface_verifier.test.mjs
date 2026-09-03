import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_SURFACE_CONTRACT,
  validateProductionSurface,
  verifyProductionSurface
} from '../scripts/verify_production_surface.mjs';

const SOURCE_SHA='8c7fa3c3310b08d2126014a9912fd459ff9bec2e';
const SOURCE_BRANCH='canary/rc74-4';
const PROD_REF='pjhmrhejsoofmouedavw';
const PROD_URL=`https://${PROD_REF}.supabase.co`;
const QA_REF='gjztkdwfmunnzhtvxrsu';

function fixtures(overrides={}){
  const version={
    sourceSha:SOURCE_SHA,
    sourceBranch:SOURCE_BRANCH,
    environment:'PRODUCTION',
    projectRef:PROD_REF,
    qaOnly:false,
    production:true,
    ...(overrides.version||{})
  };
  const runtime={
    enabled:true,
    projectRef:PROD_REF,
    url:PROD_URL,
    publishableKey:'sb_publishable_contract_test_123456789',
    qaOnly:false,
    ...(overrides.runtime||{})
  };
  return {
    versionSource:JSON.stringify(version),
    runtimeSource:`window.__IBERFIT_M26_RUNTIME__ = Object.freeze(${JSON.stringify(runtime)});`,
    indexSource:'<img src="/public/isotipo-iberfit.png"><link href="/src/m26/design/auth-native.css">',
    sourceSha:SOURCE_SHA,
    sourceBranch:SOURCE_BRANCH,
    prodProjectRef:PROD_REF,
    prodSupabaseUrl:PROD_URL,
    qaProjectRef:QA_REF
  };
}

test('production surface contract validates exact provenance, PROD runtime and visual identity',()=>{
  const result=validateProductionSurface(fixtures());
  assert.equal(result.ok,true);
  assert.equal(result.contract,PRODUCTION_SURFACE_CONTRACT);
  assert.equal(result.sourceSha,SOURCE_SHA);
});

test('production surface contract remains fail-closed for stale SHA, QA and privileged credentials',()=>{
  assert.throws(()=>validateProductionSurface(fixtures({version:{sourceSha:'0'.repeat(40)}})),/PROD_SURFACE_VERSION_SHA_MISMATCH/u);
  assert.throws(()=>validateProductionSurface(fixtures({runtime:{projectRef:QA_REF}})),/PROD_SURFACE_RUNTIME_QA_LEAK/u);
  assert.throws(()=>validateProductionSurface(fixtures({runtime:{publishableKey:['service','role'].join('_')}})),/PROD_SURFACE_RUNTIME_PRIVILEGED_KEY_FORBIDDEN/u);
});

test('production preflight retries transient propagation and validates one coherent deployed surface',async()=>{
  let versionRequests=0;
  const valid=fixtures();
  const fetchImpl=async url=>{
    const path=new URL(url).pathname;
    if(path==='/m26/version.json'){
      versionRequests+=1;
      const source=versionRequests===1
        ? fixtures({version:{sourceSha:'0'.repeat(40)}}).versionSource
        : valid.versionSource;
      return new Response(source,{status:200});
    }
    if(path==='/m26/runtime-config.js')return new Response(valid.runtimeSource,{status:200});
    if(path==='/m26/index.html')return new Response(valid.indexSource,{status:200});
    return new Response('',{status:404});
  };
  const retries=[];
  const result=await verifyProductionSurface({
    baseUrl:'https://preview.iberfit-m26-production.pages.dev',
    sourceSha:SOURCE_SHA,
    sourceBranch:SOURCE_BRANCH,
    prodProjectRef:PROD_REF,
    prodSupabaseUrl:PROD_URL,
    qaProjectRef:QA_REF,
    attempts:2,
    delayMs:1,
    timeoutMs:100,
    fetchImpl,
    sleepImpl:async()=>{},
    onRetry:event=>retries.push(event)
  });
  assert.equal(result.attempt,2);
  assert.equal(retries.length,1);
  assert.equal(retries[0].code,'PROD_SURFACE_VERSION_SHA_MISMATCH');
});
