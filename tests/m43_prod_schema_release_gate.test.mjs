import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED,QUERY,certify,verify} from '../scripts/ops/verify_m43_prod_schema.mjs';

const ready=Object.fromEntries(REQUIRED.map(k=>[k,true]));
test('M43 release gate covers new-plan/session preflight, Client privacy, grants and definer scope',()=>{
  assert.equal(REQUIRED.length,32);
  assert.match(QUERY,/\bSELECT\b/);
  assert.match(QUERY,/initial_plan_preflight/);
  assert.match(QUERY,/initial_session_preflight/);
  assert.match(QUERY,/client_revisions_filter/);
  assert.match(QUERY,/client_events_redacted/);
  assert.match(QUERY,/preflight_anon_denied/);
  assert.match(QUERY,/client_execution_http_projection/);
  assert.match(QUERY,/client_legacy_execution_http_projection/);
  assert.match(QUERY,/client_execution_authenticated_denied/);
  assert.match(QUERY,/client_execution_semantic_privacy/);
  assert.match(QUERY,/client_publication_semantic_privacy/);
  assert.match(QUERY,/client_publication_helpers_unreachable/);
  assert.match(QUERY,/domain_entities_auth_direct_read_denied/);
  assert.match(QUERY,/domain_entities_service_read_preserved/);
  assert.equal(certify([ready]).checks,32);
});
test('M43 production gate fails closed on incomplete or malformed backend contracts',()=>{
  for(const key of REQUIRED){
    assert.throws(()=>certify([{...ready,[key]:false}]),new RegExp('M43_PRODUCTION_SCHEMA_INCOMPATIBLE:'+key));
  }
  for(const x of [null,{},[],[ready,ready],{result:[null]}]){
    assert.throws(()=>certify(x),/M43_PRODUCTION_RESPONSE_INVALID/);
  }
});
test('M43 production verifier rejects QA ref, missing token and HTTP failures',async()=>{
  await assert.rejects(verify({projectRef:'gjztkdwfmunnzhtvxrsu',accessToken:'abcdefghijklmnop'}),/M43_PRODUCTION_PROJECT_INVALID/);
  await assert.rejects(verify({projectRef:'pjhmrhejsoofmouedavw',accessToken:'short'}),/M43_PRODUCTION_ACCESS_TOKEN_MISSING/);
  await assert.rejects(verify({projectRef:'pjhmrhejsoofmouedavw',accessToken:'abcdefghijklmnop',
    fetchImpl:async()=>({ok:false,status:403})}),/M43_PRODUCTION_QUERY_HTTP_403/);
});
test('M43 production verifier uses read-only management endpoint only and sanitizes outcome',async()=>{
  let requested=false;
  const result=await verify({projectRef:'pjhmrhejsoofmouedavw',accessToken:'abcdefghijklmnop',
    fetchImpl:async(url,options)=>{
      assert.match(url,/\/database\/query\/read-only$/);
      assert.equal(options.method,'POST');
      const body=JSON.parse(options.body);
      assert.equal(body.query,QUERY);
      requested=true;
      return {ok:true,json:async()=>[ready]};
    }});
  assert.equal(requested,true);
  assert.deepEqual(result,{ready:true,checks:32});
});
