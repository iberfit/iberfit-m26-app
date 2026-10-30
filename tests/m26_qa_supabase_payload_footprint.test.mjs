import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createQaSupabasePayloadFootprint} from '../qa/rc64/supabase-payload-footprint.mjs';
const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
function response(path,{size=100,status=200,throws=false}={}){
 let reads=0;
 return {url:()=>QA+path,status:()=>status,
  body:async()=>{reads++;if(throws)throw Error('unavailable');return Buffer.alloc(size);},
  reads:()=>reads};
}
test('aggregates already received payload sizes without new HTTP or data leaks',async()=>{
 const ctx=new EventEmitter(),m=createQaSupabasePayloadFootprint();
 m.attach(ctx);
 const a=response('/rest/v1/rpc/iberfit_bootstrap_v26?secret=DO_NOT_LOG',{size:2048});
 const b=response('/rest/v1/rpc/iberfit_bootstrap_v26?secret=ALSO_DO_NOT_LOG',{size:1024});
 ctx.emit('response',a);ctx.emit('response',b);
 const out=await m.flush();
 assert.equal(a.reads()+b.reads(),2);
 assert.equal(out.requestsIssuedByObserver,0);
 assert.equal(out.responseBodyPersisted,false);
 assert.equal(out.endpoints[0].group,'rpc:iberfit_bootstrap_v26');
 assert.equal(out.endpoints[0].requests,2);
 assert.equal(out.endpoints[0].meanSampledDecodedBytes,1536);
 assert.ok(!JSON.stringify(out).includes('DO_NOT_LOG'));
});
test('private Storage paths collapse to fixed labels without owner identifier',async()=>{
 const ctx=new EventEmitter(),m=createQaSupabasePayloadFootprint();
 m.attach(ctx);
 ctx.emit('response',response('/storage/v1/object/authenticated/iberfit-profile-avatars/SECRET_OWNER/avatar.webp',{status:404,size:35}));
 const out=await m.flush();
 assert.equal(out.endpoints[0].group,'storage:private-avatar');
 assert.equal(out.endpoints[0].httpErrors,1);
 assert.ok(!JSON.stringify(out).includes('SECRET_OWNER'));
});
test('external origins are never inspected; unrecognized paths are aggregated',async()=>{
 const ctx=new EventEmitter(),m=createQaSupabasePayloadFootprint();
 m.attach(ctx);
 ctx.emit('response',{url:()=> 'https://somewhere.else/private',status:()=>200,
   body:async()=>{throw Error('MUST_NOT_READ')}});
 ctx.emit('response',response('/rest/v1/private_sensitive_table?user=NOT_LOG'));
 const out=await m.flush();
 assert.deepEqual(out.endpoints.map(x=>x.group),['rest:other']);
 assert.ok(!JSON.stringify(out).includes('private_sensitive_table'));
});
test('bounded maximum of three samples per endpoint while counting all requests',async()=>{
 const ctx=new EventEmitter(),m=createQaSupabasePayloadFootprint();m.attach(ctx);
 const items=Array.from({length:11},()=>response('/rest/v1/rpc/iberfit_exercise_catalog_public_v1'));
 items.forEach(r=>ctx.emit('response',r));
 const out=await m.flush();
 assert.equal(out.endpoints[0].requests,11);
 assert.equal(out.endpoints[0].sampledResponses,3);
 assert.equal(items.reduce((n,r)=>n+r.reads(),0),3);
});
test('body API errors never turn QA to pass and HTTP errors stay accounted',async()=>{
 const ctx=new EventEmitter(),m=createQaSupabasePayloadFootprint();m.attach(ctx);
 ctx.emit('response',response('/rest/v1/rpc/iberfit_exercise_catalog_public_v1',{throws:true,status:401}));
 const out=await m.flush();
 assert.equal(out.endpoints[0].httpErrors,1);
 assert.equal(out.endpoints[0].unreadableSamples,1);
 assert.equal(out.endpoints[0].sampledResponses,0);
});
