import test from 'node:test';
import assert from 'node:assert/strict';
import {readOnlyPublicProbeWithRetry} from '../scripts/audit/public-probe-retry.mjs';

test('Transient aborted public catalog probe retries one read at most',async()=>{
 let n=0,wait=0;
 const response=await readOnlyPublicProbeWithRetry(async()=>{
  if(++n===1)throw Object.assign(new Error('aborted'),{name:'AbortError'});
  return {ok:true,status:200};
 },{delay:async()=>{wait++;}});
 assert.equal(n,2);assert.equal(wait,1);assert.deepEqual(response,{ok:true,status:200});
});
test('Anonymous security or HTTP failures do not generate extra Supabase traffic',async()=>{
 for(const error of [
  Object.assign(new Error('Forbidden'),{name:'Error',status:403}),
  Object.assign(new Error('Unauthorized'),{name:'Error',status:401}),
 ]){
  let n=0;
  await assert.rejects(readOnlyPublicProbeWithRetry(async()=>{n++;throw error;}),e=>e===error);
  assert.equal(n,1);
 }
 let n=0;
 const result=await readOnlyPublicProbeWithRetry(async()=>{n++;return {ok:false,status:403};});
 assert.equal(result.status,403);assert.equal(n,1);
});
test('A second aborted probe stays critical and cannot be reported as success',async()=>{
 let n=0;
 await assert.rejects(readOnlyPublicProbeWithRetry(async()=>{n++;throw Object.assign(new Error('network down'),{name:'AbortError'});}),/network down/);
 assert.equal(n,2);
});
