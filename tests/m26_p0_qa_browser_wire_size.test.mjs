import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createQaSupabasePayloadFootprint} from '../qa/rc64/supabase-payload-footprint.mjs';
const url='https://gjztkdwfmunnzhtvxrsu.supabase.co/rest/v1/rpc/iberfit_bootstrap_v26';
test('all completed browser wire sizes observed, private data never logged',async()=>{
 const context=new EventEmitter(),observer=createQaSupabasePayloadFootprint();
 observer.attach(context);
 let sizeCalls=0;
 for(let i=0;i<5;i++){
  const request={url:()=>url,sizes:async()=>{sizeCalls++;return {responseBodySize:100+i,responseHeadersSize:25};}};
  context.emit('response',{url:request.url,request:()=>request,status:()=>200,body:async()=>new Uint8Array(300)});
  context.emit('requestfinished',request);
 }
 const result=await observer.flush();
 const row=result.endpoints.find(x=>x.group==='rpc:iberfit_bootstrap_v26');
 assert.equal(row.requests,5);
 assert.equal(row.sampledResponses,3);
 assert.equal(row.observedWireResponses,5);
 assert.equal(row.observedWireBodyBytes,510);
 assert.equal(result.observedAllWireBodyBytes,510);
 assert.equal(sizeCalls,8);
 assert.equal(result.requestsIssuedByObserver,0);
 assert.equal(result.responseBodyPersisted,false);
 assert.equal(context.listenerCount('requestfinished'),0);
});
test('unavailable browser wire telemetry is recoverable and does not alter auth',async()=>{
 const context=new EventEmitter(),observer=createQaSupabasePayloadFootprint();
 observer.attach(context);
 const req={url:()=>url,sizes:async()=>{throw Error('not available')}};
 context.emit('response',{url:req.url,request:()=>req,status:()=>403,body:async()=>new Uint8Array(0)});
 context.emit('requestfinished',req);
 const result=await observer.flush();
 assert.equal(result.endpoints[0].httpErrors,1);
 assert.equal(result.endpoints[0].observedWireUnavailable,1);
});
