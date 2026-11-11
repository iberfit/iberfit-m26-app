import test from 'node:test';
import assert from 'node:assert/strict';
import {PROD_REF,REQUIRED} from '../scripts/ops/verify_u30_u60_prod_schema.mjs';
import {ACTIVATION_REQUIRED,ACTIVATION_QUERY,certifyActivation,verifyActivation} from '../scripts/ops/verify_u30_u60_prod_activation_readonly.mjs';
const approved=Object.freeze({...Object.fromEntries(REQUIRED.map(x=>[x,true])),
  ...Object.fromEntries(ACTIVATION_REQUIRED.map(x=>[x,true]))});
const token='synthetic-activation-token-for-tests';
test('A activation requires original 12 schema checks plus both authenticated RPC grants',()=>{
 assert.equal(REQUIRED.length,12);
 assert.equal(ACTIVATION_REQUIRED.length,2);
 assert.equal(certifyActivation([approved]).activationReady,true);
 for(const name of ACTIVATION_REQUIRED){
  for(const state of [false,null,0,undefined]){
   assert.throws(()=>certifyActivation([{...approved,[name]:state}]),new RegExp('U60_PROD_NOT_ACTIVATED:'+name));
  }
 }
 for(const name of REQUIRED)assert.throws(()=>certifyActivation([{...approved,[name]:false}]),/U30_U60_PROD_SCHEMA_NOT_READY/);
});
test('A activation gate is read-only, explicit-target, and rejects anonymous/public grants',()=>{
 assert.match(ACTIVATION_QUERY,/u60_authenticated_execute/);
 assert.match(ACTIVATION_QUERY,/detail_authenticated_execute/);
 assert.match(ACTIVATION_QUERY,/has_function_privilege\('authenticated'/);
 assert.match(ACTIVATION_QUERY,/supabase_migrations\.schema_migrations/);
 assert.doesNotMatch(ACTIVATION_QUERY,/\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+public\.|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE|GRANT\s+EXECUTE)\b/i);
});
test('A activation cannot be treated as complete just because generic release guard is green',async()=>{
 let networkCalls=0;
 const fetchImpl=async(url,options)=>{
  networkCalls++;
  assert.equal(url,'https://api.supabase.com/v1/projects/'+PROD_REF+'/database/query/read-only');
  assert.equal(options.method,'POST');
  assert.equal(JSON.parse(options.body).query,ACTIVATION_QUERY);
  return{ok:true,json:async()=>[{...approved,detail_authenticated_execute:false}]};
 };
 await assert.rejects(verifyActivation({projectRef:PROD_REF,accessToken:token,fetchImpl}),/U60_PROD_NOT_ACTIVATED:detail_authenticated_execute/);
 assert.equal(networkCalls,1);
 await assert.rejects(verifyActivation({projectRef:'gjztkdwfmunnzhtvxrsu',accessToken:token,fetchImpl}),/U60_ACTIVATION_TARGET_MISMATCH/);
 await assert.rejects(verifyActivation({projectRef:PROD_REF,accessToken:'',fetchImpl}),/U60_ACTIVATION_ACCESS_TOKEN_MISSING/);
 assert.equal(networkCalls,1);
 const ok=await verifyActivation({projectRef:PROD_REF,accessToken:token,fetchImpl:async()=>({ok:true,json:async()=>[approved]})});
 assert.equal(ok.authenticatedGrants,2);
 await assert.rejects(verifyActivation({projectRef:PROD_REF,accessToken:token,fetchImpl:async()=>({ok:false,status:403})}),/U60_ACTIVATION_HTTP_403/);
});
