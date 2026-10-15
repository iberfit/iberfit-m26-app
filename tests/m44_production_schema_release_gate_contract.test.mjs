import test from 'node:test';
import assert from 'node:assert/strict';
import {PROD_REF,REQUIRED,QUERY,certify,verify} from '../scripts/ops/verify_m44_prod_schema.mjs';
const proof=()=>Object.fromEntries(REQUIRED.map(x=>[x,true]));
test('M44 PROD release gate: all 20 critical predicates, read-only schema source',()=>{
 assert.equal(PROD_REF,'pjhmrhejsoofmouedavw');
 assert.equal(REQUIRED.length,20);
 assert.match(QUERY,/current_setting\(''role'',true\)/);
 assert.match(QUERY,/iberfit_evolution_report_issuances_v1/);
 assert.match(QUERY,/iberfit-evolution-issued-reports/);
 assert.match(QUERY,/finalizer_service_only/);
 assert.match(QUERY,/anon_rpc_denied/);
 assert.doesNotMatch(QUERY,/\b(?:insert|delete|update|truncate|drop|alter|grant|revoke|create)\s+(?:into|from|table|function|on)/i);
 assert.deepEqual(certify([proof()]),{ready:true,checks:20});
});
test('M44 PROD release gate denies partial migrations, role ACL weakness and malformed evidence',()=>{
 for(const key of REQUIRED){
  const row=proof(); row[key]=false;
  assert.throws(()=>certify([row]),new RegExp('M44_PROD_SCHEMA_NOT_READY:'+key));
 }
 assert.throws(()=>certify([]),/RESPONSE_INVALID/);
 assert.throws(()=>certify([proof(),proof()]),/RESPONSE_INVALID/);
 assert.throws(()=>certify({result:{}}),/RESPONSE_INVALID/);
 const row=proof(); delete row.finalizer_service_only;
 assert.throws(()=>certify([row]),/M44_PROD_SCHEMA_NOT_READY:finalizer_service_only/);
});
test('M44 PROD gate rejects wrong target and never calls remote system',async()=>{
 let called=false;
 const fetchImpl=async()=>{called=true;throw Error('must not call');};
 await assert.rejects(verify({projectRef:'gjztkdwfmunnzhtvxrsu',accessToken:'a'.repeat(25),fetchImpl}),/TARGET_MISMATCH/);
 assert.equal(called,false);
 await assert.rejects(verify({projectRef:PROD_REF,accessToken:'',fetchImpl}),/ACCESS_TOKEN_MISSING/);
 assert.equal(called,false);
});
test('M44 PROD gate uses management read-only endpoint and rejects failures',async()=>{
 let requests=0;
 const fetchImpl=async(url,options)=>{
  requests++;
  assert.equal(url,'https://api.supabase.com/v1/projects/'+PROD_REF+'/database/query/read-only');
  assert.equal(options.method,'POST');
  assert.match(options.headers.Authorization,/^Bearer /);
  assert.equal(JSON.parse(options.body).query,QUERY);
  return {ok:true,status:200,json:async()=>[proof()]};
 };
 const result=await verify({projectRef:PROD_REF,accessToken:'test_PAT_is_fake_and_not_logged',fetchImpl});
 assert.deepEqual(result,{ready:true,checks:20});
 assert.equal(requests,1);
 await assert.rejects(verify({projectRef:PROD_REF,accessToken:'x'.repeat(25),fetchImpl:async()=>({ok:false,status:401})}),/QUERY_HTTP_401/);
 await assert.rejects(verify({projectRef:PROD_REF,accessToken:'x'.repeat(25),fetchImpl:async()=>({ok:true,json:async()=>{throw Error('bad');}})}),/RESPONSE_NOT_JSON/);
 await assert.rejects(verify({projectRef:PROD_REF,accessToken:'x'.repeat(25),fetchImpl:async()=>{throw Error('offline');}}),/DATABASE_UNREACHABLE/);
});
