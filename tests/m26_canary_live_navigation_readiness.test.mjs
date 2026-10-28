import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {navigateCanaryLiveForCertification} from '../scripts/prelaunch/canary-live-navigation.mjs';

const gate=await readFile(new URL('../scripts/prelaunch/check_live_canary_gate.mjs',import.meta.url),'utf8');

function fakePage({failAt=null}={}){
  const calls=[];
  const page={
    goto:async (url,options)=>{
      calls.push({step:'goto',url,options});
      if(failAt==='goto')throw new Error('DOCUMENT_TIMEOUT');
      return {ok:()=>true};
    },
    waitForFunction:async(predicate,arg,options)=>{
      calls.push({step:'document-ready',predicate:String(predicate),arg,options});
      if(failAt==='document')throw new Error('DOCUMENT_NOT_READY');
    },
    locator:(selector)=>({
      waitFor:async (options)=>{
        calls.push({step:'login-visible',selector,options});
        if(failAt==='login')throw new Error('LOGIN_NOT_VISIBLE');
      },
    }),
  };
  return {page,calls};
}

test('continuous background network does not block live Canary navigation if the actual login is ready',async()=>{
  const {page,calls}=fakePage();
  const response=await navigateCanaryLiveForCertification(page,'https://m26-canary.iberfit.cl/?prelaunch=42');
  assert.equal(response.ok(),true);
  assert.deepEqual(calls.map(x=>x.step),['goto','document-ready','login-visible']);
  assert.deepEqual(calls[0].options,{waitUntil:'domcontentloaded',timeout:45_000});
  assert.match(calls[1].predicate,/document\.readyState==='complete'/u);
  assert.deepEqual(calls[1].options,{timeout:30_000});
  assert.equal(calls[2].selector,'form[data-auth-form="login"]');
  assert.deepEqual(calls[2].options,{state:'visible',timeout:30_000});
});

test('document or login readiness failure remains blocking; no silent retry or synthetic success',async()=>{
  for(const [failAt,error] of [['goto','DOCUMENT_TIMEOUT'],['document','DOCUMENT_NOT_READY'],['login','LOGIN_NOT_VISIBLE']]){
    const {page}=fakePage({failAt});
    await assert.rejects(
      navigateCanaryLiveForCertification(page,'https://m26-canary.iberfit.cl/'),
      new RegExp(error,'u'),
    );
  }
});

test('live QA gate keeps the original fail-closed safety assertions and uses visible-login readiness',()=>{
  assert.match(gate,/navigateCanaryLiveForCertification\(page,/u);
  assert.doesNotMatch(gate,/waitUntil:'networkidle'/u);
  for(const guard of [
    'PRELAUNCH_LIVE_DEPLOY_SHA_MISMATCH',
    'PRELAUNCH_LIVE_VERSION_PROJECT_MISMATCH',
    'PRELAUNCH_LIVE_RUNTIME_NOT_QA',
    'PRELAUNCH_LIVE_FORBIDDEN_SUPABASE_ORIGIN',
    'PRELAUNCH_LIVE_UNEXPECTED_MUTATION_REQUEST',
    'PRELAUNCH_LIVE_LOGIN_FORM_MISSING',
    'PRELAUNCH_LIVE_ENTER_DISABLED',
    'PRELAUNCH_LIVE_WARNING_VISIBLE',
    'PRELAUNCH_LIVE_PAGE_ERROR',
    'PRELAUNCH_LIVE_CONSOLE_ERROR',
    'PRELAUNCH_LIVE_HORIZONTAL_OVERFLOW',
  ])assert.ok(gate.includes(guard),`guard missing: ${guard}`);
  assert.match(gate,/name:'desktop',width:1440,height:1000/u);
  assert.match(gate,/name:'mobile',width:390,height:844/u);
});
