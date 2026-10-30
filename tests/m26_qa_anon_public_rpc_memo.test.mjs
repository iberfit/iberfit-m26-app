import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaPublicRpcMemo,SUPABASE_ORIGIN} from '../qa/rc64/secure-current-source-auth.mjs';

const PUB='sb_publishable_unit_test_example_key_12345678';
function request(path,body={p_limit:200,p_offset:0},key=PUB){
  return {method:()=> 'POST',url:()=>SUPABASE_ORIGIN+path,
    headers:()=>({apikey:key,authorization:'Bearer '+key}),
    postData:()=>JSON.stringify(body)};
}
function route({status=200,body='[{"id":"EX-1","name_es":"Test"}]',delay=null}={}){
  const calls={network:0,fulfilled:[],aborted:[]};
  return {calls,async fetch(opts){assert.equal(opts.maxRedirects,0);calls.network++;
    if(delay)await delay;return {status:()=>status,body:async()=>Buffer.from(body),
      headers:()=>({'content-type':'application/json; charset=utf-8'})};},
    async fulfill(value){calls.fulfilled.push(value);},
    async abort(error){calls.aborted.push(error);}};
}
const CAT='/rest/v1/rpc/iberfit_exercise_catalog_public_v1';
const PROFILES='/rest/v1/rpc/iberfit_exercise_measurement_profiles_public_v1';
test('same public response fetched once across isolated QA contexts, same bytes',async()=>{
 const memo=createQaPublicRpcMemo(),req=request(CAT);
 const first=route(),second=route();
 assert.equal(await memo.serve(first,req,new URL(req.url())),true);
 assert.equal(await memo.serve(second,req,new URL(req.url())),true);
 assert.equal(first.calls.network,1);
 assert.equal(second.calls.network,0);
 assert.equal(first.calls.fulfilled[0].status,200);
 assert.deepEqual(second.calls.fulfilled[0].body,first.calls.fulfilled[0].body);
 assert.equal(memo.stats().cacheHits,1);
});
test('different catalogue pages and public profiles are independent real reads',async()=>{
 const memo=createQaPublicRpcMemo();
 const a=request(CAT,{p_limit:200,p_offset:0}),b=request(CAT,{p_limit:200,p_offset:200}),p=request(PROFILES,{});
 for(const req of [a,b,p]){
   const r=route();assert.equal(await memo.serve(r,req,new URL(req.url())),true);
   assert.equal(r.calls.network,1);
 }
 assert.equal(memo.stats().entries,3);
});
test('cache expires and always revalidates from real QA after TTL',async()=>{
 let time=1000;const memo=createQaPublicRpcMemo({now:()=>time}),req=request(CAT);
 const first=route();await memo.serve(first,req,new URL(req.url()));
 time+=120_001;
 const next=route();await memo.serve(next,req,new URL(req.url()));
 assert.equal(first.calls.network+next.calls.network,2);
});
test('never intercept JWT-authenticated, privileged, avatar or off-origin requests',async()=>{
 const memo=createQaPublicRpcMemo(),jwt='fake.private.jwt',r=route();
 for(const req of [
   request('/rest/v1/rpc/iberfit_bootstrap_v26',{}),
   request('/rest/v1/rpc/iberfit_privileged_assurance_context_v65d',{}),
   request(CAT,{p_limit:200,p_offset:0},jwt),
   request(CAT,{p_limit:200,p_offset:0},'service_role'),
   request(CAT,{p_limit:999,p_offset:0}),
   request(PROFILES,{accountId:'private'}),
   {method:()=> 'GET',url:()=>SUPABASE_ORIGIN+'/storage/v1/object/authenticated/private/avatar.webp',
    headers:()=>({}),postData:()=>''},
 ]){
   assert.equal(await memo.serve(r,req,new URL(req.url())),false);
 }
 assert.equal(r.calls.network,0);
 assert.equal(memo.stats().entries,0);
});
test('never cache errors or non-array results; next call still contacts QA',async()=>{
 const memo=createQaPublicRpcMemo(),req=request(CAT);
 for(const first of [route({status:401,body:'{"message":"Unauthorized"}'}),
                     route({body:'{"object":"not an array"}'})]){
   await memo.serve(first,req,new URL(req.url()));
   assert.equal(first.calls.network,1);
 }
 const next=route();await memo.serve(next,req,new URL(req.url()));
 assert.equal(next.calls.network,1);
 assert.equal(memo.stats().entries,1);
});
test('parallel identical public requests share a single in-flight network fetch',async()=>{
 const memo=createQaPublicRpcMemo(),req=request(CAT);
 let finish;const delay=new Promise(r=>finish=r);
 const first=route({delay}),second=route();
 const a=memo.serve(first,req,new URL(req.url()));
 const b=memo.serve(second,req,new URL(req.url()));
 await Promise.resolve();finish();
 assert.deepEqual(await Promise.all([a,b]),[true,true]);
 assert.equal(first.calls.network+second.calls.network,1);
 assert.equal(first.calls.fulfilled.length,1);
 assert.equal(second.calls.fulfilled.length,1);
});
test('network failure is surfaced, not turned into successful fake response',async()=>{
 const memo=createQaPublicRpcMemo(),req=request(CAT);
 const r={calls:{aborts:0},async fetch(){throw Error('qa-offline');},
   async abort(){this.calls.aborts++;},async fulfill(){throw Error('must not fake success');}};
 assert.equal(await memo.serve(r,req,new URL(req.url())),true);
 assert.equal(r.calls.aborts,1);
 assert.equal(memo.stats().entries,0);
});
