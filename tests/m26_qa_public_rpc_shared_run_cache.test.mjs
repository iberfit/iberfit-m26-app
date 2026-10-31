import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createQaPublicRpcMemo,SUPABASE_ORIGIN} from '../qa/rc64/secure-current-source-auth.mjs';

const CAT='/rest/v1/rpc/iberfit_exercise_catalog_public_v1';
const PUB='sb_publishable_unit_test_example_key_12345678';
const makeReq=(key=PUB)=>({
  method:()=> 'POST',url:()=>SUPABASE_ORIGIN+CAT,
  headers:()=>({apikey:key,authorization:'Bearer '+key}),
  postData:()=>JSON.stringify({p_limit:200,p_offset:0}),
});
function route(body='[{"id":"public-synthetic"}]',status=200){
  const seen={network:0,fulfill:[],abort:[]};
  return {seen,async fetch(){seen.network++;return {
    status:()=>status,body:async()=>Buffer.from(body),
    headers:()=>({'content-type':'application/json'})};},
    async fulfill(result){seen.fulfill.push(result)},
    async abort(reason){seen.abort.push(reason)},
  };
}
async function rootFor(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'m26-p0-public-shared-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return dir;
}
test('public read hits REAL QA once then shares identical bytes across distinct workers',async t=>{
  const root=await rootFor(t),req=makeReq(),url=new URL(req.url());
  const one=createQaPublicRpcMemo({sharedCacheRoot:root}),first=route();
  assert.equal(await one.serve(first,req,url),true);
  assert.equal(first.seen.network,1);
  const other=createQaPublicRpcMemo({sharedCacheRoot:root}),second=route();
  assert.equal(await other.serve(second,req,url),true);
  assert.equal(second.seen.network,0);
  assert.deepEqual(second.seen.fulfill[0].body,first.seen.fulfill[0].body);
  assert.equal(other.stats().sharedHits,1);
  const names=await fs.readdir(root);
  assert.equal(names.filter(x=>x.endsWith('.json')).length,1);
  const saved=await fs.readFile(path.join(root,names[0]),'utf8');
  assert.doesNotMatch(saved,/Bearer|JWT|password|service_role|access_token/u);
});
test('stale public copy always falls back to real network, never extends TTL',async t=>{
  const root=await rootFor(t),req=makeReq(),url=new URL(req.url());let clock=1000;
  const opts={sharedCacheRoot:root,now:()=>clock};
  const a=route();await createQaPublicRpcMemo(opts).serve(a,req,url);
  clock+=600001;
  const b=route();await createQaPublicRpcMemo(opts).serve(b,req,url);
  assert.equal(a.seen.network+b.seen.network,2);
});
test('corrupt on-disk copy cannot spoof a successful public response',async t=>{
  const root=await rootFor(t),req=makeReq(),url=new URL(req.url());
  const original=route();await createQaPublicRpcMemo({sharedCacheRoot:root}).serve(original,req,url);
  const [name]=(await fs.readdir(root)).filter(x=>x.endsWith('.json'));
  const filename=path.join(root,name);
  const row=JSON.parse(await fs.readFile(filename,'utf8'));
  row.body=Buffer.from('[{"id":"poison"}]').toString('base64');
  await fs.writeFile(filename,JSON.stringify(row));
  const next=route();await createQaPublicRpcMemo({sharedCacheRoot:root}).serve(next,req,url);
  assert.equal(next.seen.network,1);
  assert.deepEqual(next.seen.fulfill[0].body,original.seen.fulfill[0].body);
});
test('JWT, malformed public data and API failures never enter cross-worker cache',async t=>{
  const root=await rootFor(t),url=new URL(SUPABASE_ORIGIN+CAT);
  const jwt=makeReq('test.private.jwt');
  const privateRoute=route();
  assert.equal(await createQaPublicRpcMemo({sharedCacheRoot:root}).serve(privateRoute,jwt,url),false);
  for(const candidate of [route('{"private":"not array"}'),route('{"message":"denied"}',403)]){
    const req=makeReq();
    await createQaPublicRpcMemo({sharedCacheRoot:root}).serve(candidate,req,url);
    assert.equal(candidate.seen.network,1);
  }
  assert.deepEqual((await fs.readdir(root)).filter(x=>x.endsWith('.json')),[]);
});
test('cache roots are scoped: separate job and SHA cannot reuse a different run',async t=>{
  const root=await rootFor(t),other=await rootFor(t),req=makeReq(),url=new URL(req.url());
  const one=route();await createQaPublicRpcMemo({sharedCacheRoot:root}).serve(one,req,url);
  const two=route();await createQaPublicRpcMemo({sharedCacheRoot:other}).serve(two,req,url);
  assert.equal(one.seen.network+two.seen.network,2);
});
