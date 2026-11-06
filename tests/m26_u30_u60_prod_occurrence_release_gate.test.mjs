import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROD_REF,REQUIRED_VERSIONS,REQUIRED,QUERY,certify,verify,
} from '../scripts/ops/verify_u30_u60_prod_schema.mjs';

const valid=Object.freeze(Object.fromEntries(REQUIRED.map(key=>[key,true])));
const token='safe-fixture-token-only-for-tests';
test('U30–U60 production guard insists on all eight exact versions, RLS, RPC and receipt fence',()=>{
  assert.equal(REQUIRED_VERSIONS.length,8);
  assert.equal(new Set(REQUIRED_VERSIONS).size,8);
  for(const version of REQUIRED_VERSIONS)assert.match(QUERY,new RegExp(version,'u'));
  assert.match(QUERY,/supabase_migrations\.schema_migrations/u);
  assert.match(QUERY,/u60_dated_execution_update_receipt/u);
  assert.match(QUERY,/u60_typed_execution_fence/u);
  assert.match(QUERY,/has_table_privilege\('authenticated'/u);
  assert.doesNotMatch(QUERY,/\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+public\.|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE)\b/iu);
  assert.deepEqual(certify([valid]),{ready:true,checks:12,versions:8,readOnly:true});
});
test('U30–U60 guard rejects any missing version or one unsafe privilege, including false zeros',()=>{
  for(const key of REQUIRED){
    assert.throws(()=>certify([{...valid,[key]:false}]),new RegExp('U30_U60_PROD_SCHEMA_NOT_READY:'+key,'u'));
    assert.throws(()=>certify([{...valid,[key]:null}]),new RegExp('U30_U60_PROD_SCHEMA_NOT_READY:'+key,'u'));
  }
  assert.throws(()=>certify([]),/U30_U60_PROD_RESPONSE_INVALID/u);
  assert.throws(()=>certify([{...valid},{...valid}]),/U30_U60_PROD_RESPONSE_INVALID/u);
  assert.throws(()=>certify([{...valid,all_eight_installed:1}]),/U30_U60_PROD_SCHEMA_NOT_READY/u);
});
test('U30–U60 guard checks exact project, read-only endpoint and fails on server/network error',async()=>{
  const calls=[];
  const fetchImpl=async(url,opts)=>{calls.push({url,opts});return{ok:true,json:async()=>[valid]};};
  const done=await verify({projectRef:PROD_REF,accessToken:token,fetchImpl});
  assert.equal(done.ready,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.supabase.com/v1/projects/'+PROD_REF+'/database/query/read-only');
  assert.equal(calls[0].opts.method,'POST');
  assert.equal(JSON.parse(calls[0].opts.body).query,QUERY);
  await assert.rejects(verify({projectRef:'gjztkdwfmunnzhtvxrsu',accessToken:token,fetchImpl}),/U30_U60_PROD_TARGET_MISMATCH/u);
  await assert.rejects(verify({projectRef:PROD_REF,accessToken:'',fetchImpl}),/U30_U60_PROD_ACCESS_TOKEN_MISSING/u);
  await assert.rejects(verify({projectRef:PROD_REF,accessToken:token,fetchImpl:async()=>({ok:false,status:401})}),/U30_U60_PROD_QUERY_HTTP_401/u);
  await assert.rejects(verify({projectRef:PROD_REF,accessToken:token,fetchImpl:async()=>{throw Error('network');}}),/U30_U60_PROD_DATABASE_UNREACHABLE/u);
});
test('Protected production promotion is fail-closed in both release modes, without mutating schema',async()=>{
  const {readFile}=await import('node:fs/promises');
  const workflow=await readFile(new URL('../.github/workflows/production-promote.yml',import.meta.url),'utf8');
  const trigger=(workflow.match(/run: node scripts\/ops\/verify_u30_u60_prod_schema\.mjs/gu)||[]);
  assert.equal(trigger.length,1);
  const position=workflow.indexOf(trigger[0]);
  const firstDeploy=workflow.indexOf('wrangler@');
  assert.ok(position>0);
  assert.ok(firstDeploy<0||position<firstDeploy);
  const prior=workflow.slice(Math.max(0,position-380),position);
  assert.doesNotMatch(prior,/\n\s*if:/u,'must never be bypassed for frontend-only promotion');
  const coach=await readFile(new URL('../.github/workflows/coach-webauthn-recurring.yml',import.meta.url),'utf8');
  assert.equal((coach.match(/'src\/m26\/domain\/qa-canonical-summary-transport\.js'/gu)||[]).length,2,
    'QA Coach U81 change must trigger live MFA tests on PR and Canary push');
  assert.equal((coach.match(/'src\/m26\/domain\/privileged-history-assembler\.js'/gu)||[]).length,2);
});
