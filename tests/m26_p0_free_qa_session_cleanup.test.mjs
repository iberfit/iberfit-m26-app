import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trustedQaCleanupPage,
  releaseQaSessionInPage,
  releaseQaSessionBeforeContextClose,
} from '../qa/rc64/qa-session-cleanup.mjs';

const QA_ORIGIN='https://m26-canary.iberfit.cl';
const QA_API='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const REF='gjztkdwfmunnzhtvxrsu';
const KEY='iberfit:m26:session:v1';
const MOCK_TOKEN='eyJ'+'a'.repeat(52)+'.'+'b'.repeat(52)+'.'+'c'.repeat(52);
const config=Object.freeze({
  qaOrigin:QA_ORIGIN,apiOrigin:QA_API,projectRef:REF,storageKey:KEY,
});
function storage(raw){
  const map=new Map(raw?[[KEY,JSON.stringify(raw)]]:[]);
  return {
    getItem:key=>map.get(key)??null,
    removeItem:key=>{map.delete(key);},
    setItem:(key,value)=>{map.set(key,value);},
  };
}
function fixture(email='qa.rc74.client-b@iberfit.cl',token=MOCK_TOKEN){
  return {token,refreshToken:'synthetic-not-logged',user:{id:'synthetic',email}};
}
function makeScope({
  email='qa.rc74.client-b@iberfit.cl',
  location=QA_ORIGIN,
  runtime={},
  fetchImpl=async()=>({ok:true,status:204}),
  value=fixture(email),
}={}){
  const localStorage=storage(value);
  const sessionStorage=storage();
  const scope={
    location:{origin:location},
    localStorage,sessionStorage,
    __IBERFIT_M26_RUNTIME__:{
      qaOnly:true,enabled:true,projectRef:REF,url:QA_API,
      publishableKey:'sb_publishable_'+'x'.repeat(24),...runtime,
    },
    fetch:fetchImpl,
  };
  return {scope,localStorage,sessionStorage};
}

test('Free QA cleanup accepts only exact HTTPS Canary origin',()=>{
  assert.equal(trustedQaCleanupPage(QA_ORIGIN+'/'),true);
  assert.equal(trustedQaCleanupPage(QA_ORIGIN+'/m26/'),true);
  for(const value of [
    'https://app.iberfit.cl/','https://m26-canary.iberfit.cl.evil.example/',
    'http://m26-canary.iberfit.cl/','https://user@'+new URL(QA_ORIGIN).host+'/',
    'https://gjztkdwfmunnzhtvxrsu.supabase.co/',null,
  ])assert.equal(trustedQaCleanupPage(value),false);
});

test('Free QA cleanup revokes exactly one local-scoped JWT for a known QA fixture',async()=>{
  const recorded=[];
  const {scope,localStorage}=makeScope({
    fetchImpl:async(url,options)=>{recorded.push({url,options});return {ok:true,status:204};},
  });
  assert.equal(await releaseQaSessionInPage({...config,scope}),'released');
  assert.equal(recorded.length,1);
  assert.equal(recorded[0].url,QA_API+'/auth/v1/logout?scope=local');
  assert.equal(recorded[0].options.method,'POST');
  assert.equal(recorded[0].options.credentials,'omit');
  assert.equal(recorded[0].options.headers.Authorization,'Bearer '+MOCK_TOKEN);
  assert.equal(localStorage.getItem(KEY),null);
  assert.ok(recorded[0].options.signal);
});

test('Free QA cleanup skips PROD/mixed runtime and non-fixture user without HTTP',async()=>{
  for(const runtime of [
    {qaOnly:false},{enabled:false},{projectRef:'pjhmrhejsoofmouedavw'},
    {url:'https://pjhmrhejsoofmouedavw.supabase.co'},
  ]){
    let requests=0;
    const {scope}=makeScope({runtime,fetchImpl:async()=>{requests++;return {ok:true};}});
    assert.equal(await releaseQaSessionInPage({...config,scope}),'skipped');
    assert.equal(requests,0);
  }
  let requests=0;
  const {scope}=makeScope({email:'person@example.com',
    fetchImpl:async()=>{requests++;return {ok:true};}});
  assert.equal(await releaseQaSessionInPage({...config,scope}),'no-session');
  assert.equal(requests,0);
});

test('Free QA cleanup does not clear a newly authenticated owner while its old logout finishes',async()=>{
  const replacement=fixture('qa.rc74.client-a@iberfit.cl','eyJ'+'q'.repeat(52)+'.'+'w'.repeat(52)+'.'+'e'.repeat(52));
  const {scope,localStorage}=makeScope();
  scope.fetch=async()=>{localStorage.setItem(KEY,JSON.stringify(replacement));return {ok:true};};
  assert.equal(await releaseQaSessionInPage({...config,scope}),'released');
  assert.equal(JSON.parse(localStorage.getItem(KEY)).token,replacement.token);
});

test('Free QA cleanup fails closed on rejected logout without pretending success',async()=>{
  const {scope,localStorage}=makeScope({fetchImpl:async()=>({ok:false,status:401})});
  assert.equal(await releaseQaSessionInPage({...config,scope}),'failed');
  assert.ok(localStorage.getItem(KEY));
  scope.fetch=async()=>{throw Error('offline');};
  assert.equal(await releaseQaSessionInPage({...config,scope}),'failed');
  assert.ok(localStorage.getItem(KEY));
});

test('Free QA wrapper evaluates only in Canary and returns no sensitive result',async()=>{
  let evaluations=0;
  const {scope}=makeScope();
  const page={
    url:()=>QA_ORIGIN+'/m26/',
    isClosed:()=>false,
    evaluate:async(fn,args)=>{evaluations++;return fn({...args,scope});},
  };
  assert.equal(await releaseQaSessionBeforeContextClose(page),'released');
  assert.equal(evaluations,1);
  const prod={...page,url:()=> 'https://app.iberfit.cl/'};
  assert.equal(await releaseQaSessionBeforeContextClose(prod),'skipped');
  assert.equal(evaluations,1);
  const closed={...page,isClosed:()=>true};
  assert.equal(await releaseQaSessionBeforeContextClose(closed),'skipped');
  assert.equal(evaluations,1);
});
