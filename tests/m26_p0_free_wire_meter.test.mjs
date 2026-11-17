import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createQaSupabaseWireMeter,classifyQaSupabaseRoute}
  from '../qa/rc64/qa-supabase-wire-meter.mjs';
const qa='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const emit=(page,url,bytes)=>page.emit('requestfinished',{
  url:()=>url,sizes:async()=>({responseBodySize:bytes}),
});
test('passive QA meter observes exact origin without recording secrets',async()=>{
  const page=new EventEmitter(),meter=createQaSupabaseWireMeter(page);
  emit(page,qa+'/rest/v1/rpc/iberfit_bootstrap_v26?access_token=do-not-log',1706139);
  emit(page,qa+'/rest/v1/rpc/iberfit_exercise_catalog_public_v1',1200);
  emit(page,qa+'/auth/v1/user?token=secret',500);
  emit(page,'https://pjhmrhejsoofmouedavw.supabase.co/rest/v1/rpc/iberfit_bootstrap_v26',8000);
  emit(page,'https://another.example.net/api/private?key=secret',99);
  const result=await meter.stop();
  assert.equal(result.requests,3);
  assert.equal(result.responseBodyBytes,1707839);
  assert.deepEqual(result.byCategory.bootstrap,{requests:1,responseBodyBytes:1706139});
  assert.deepEqual(result.byCategory.auth,{requests:1,responseBodyBytes:500});
  assert.equal(result.extraSupabaseRequests,0);
  assert.equal(result.billableEgressVerified,false);
  assert.doesNotMatch(JSON.stringify(result),/do-not-log|access_token|key=|secret|pjhmrhe/u);
  emit(page,qa+'/rest/v1/rpc/iberfit_bootstrap_v26',9);
  assert.equal((await meter.stop()).requests,3);
});
test('invalid byte measures are flagged, never counted as savings',async()=>{
  const page=new EventEmitter(),meter=createQaSupabaseWireMeter(page);
  emit(page,qa+'/storage/v1/object/test',-1);
  emit(page,qa+'/functions/v1/test',NaN);
  page.emit('requestfinished',{url:()=>qa+'/rest/v1/rpc/private',sizes:async()=>{throw Error('private token');}});
  emit(page,qa+'/rest/v1/rpc/another',0);
  const result=await meter.stop();
  assert.equal(result.invalidMeasurements,3);
  assert.equal(result.requests,1);
  assert.equal(result.responseBodyBytes,0);
  assert.doesNotMatch(JSON.stringify(result),/private token/u);
});
test('meter scope is locked to QA; route classes have no identifiers',()=>{
  const page=new EventEmitter();
  assert.throws(()=>createQaSupabaseWireMeter(page,{origin:'https://pjhmrhejsoofmouedavw.supabase.co'}),/SCOPE_INVALID/);
  assert.equal(classifyQaSupabaseRoute('/rest/v1/rpc/private_function'),'other-rpc');
  assert.equal(classifyQaSupabaseRoute('/storage/v1/object/private/photo.jpg'),'storage');
});
