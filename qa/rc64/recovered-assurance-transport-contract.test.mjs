import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRecoveredAssuranceTransport,ASSURANCE_FAILURE_LABEL as label} from './recovered-assurance-transport-contract.mjs';
const good=()=>({events:['issued','requestfailed','issued','http-200'],
 networkFailureCodes:['net::ERR_ABORTED'],externalFailures:[label],serverAssuranceVerified:true});
test('one genuine failed-then-successful read-only assurance is proven',()=>{
 const result=evaluateRecoveredAssuranceTransport(good());
 assert.equal(result.recovered,true);
 assert.deepEqual(result.remainingFailures,[]);
});
test('never conceals other failed requests',()=>{
 const a=good();a.externalFailures.push('POST qa-supabase /rest/v1/rpc/iberfit_bootstrap_v26');
 const r=evaluateRecoveredAssuranceTransport(a);
 assert.equal(r.recovered,true);
 assert.deepEqual(r.remainingFailures,['POST qa-supabase /rest/v1/rpc/iberfit_bootstrap_v26']);
});
test('rejects malformed, denied, missing, late or multiple assurance failures',()=>{
 const bad=[
  x=>{x.events=['issued','requestfailed','issued','http-401'];},
  x=>{x.events=['issued','requestfailed','issued','http-403'];},
  x=>{x.events=['issued','requestfailed','issued','http-500'];},
  x=>{x.events=['issued','http-200','issued','requestfailed'];},
  x=>{x.events=['issued','http-200'];},
  x=>{x.events=['issued','requestfailed','issued','requestfailed','issued','http-200'];},
  x=>{x.serverAssuranceVerified=false;},
  x=>{x.networkFailureCodes=['NETWORK_FAILURE_UNCLASSIFIED'];},
  x=>{x.networkFailureCodes=['net::ERR_CERT_AUTHORITY_INVALID'];},
  x=>{x.networkFailureCodes=[];},
  x=>{x.networkFailureCodes=['net::ERR_ABORTED','net::ERR_ABORTED'];},
  x=>{x.externalFailures=[label,label];},
 ];
 for(const mutate of bad){const e=good();mutate(e);
  const r=evaluateRecoveredAssuranceTransport(e);
  assert.equal(r.recovered,false);
  assert.deepEqual(r.remainingFailures,e.externalFailures);
 }
});
test('invalid evidence remains unrecovered',()=>{
 for(const bad of [null,{},[],{events:'invalid',externalFailures:[label]},{
  ...good(),externalFailures:null}]){
  assert.equal(evaluateRecoveredAssuranceTransport(bad).recovered,false);
 }
});
