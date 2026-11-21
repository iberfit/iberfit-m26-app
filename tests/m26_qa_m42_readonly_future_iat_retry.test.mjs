import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {qaM42ReadOnlyRpcWithFutureIatRetry} from '../scripts/remote-gates/qa_m42_readonly_future_iat_retry.mjs';

const future={status:401,body:{code:'PGRST303',message:'JWT issued at future'}};
const expired={status:401,body:{code:'PGRST303',message:'JWT expired'}};
const valid={status:200,body:'coach'};
function capture(outputs){
  const calls=[],delays=[],send=async(path,request)=>{
    calls.push({path,...request});
    return outputs[Math.min(calls.length-1,outputs.length-1)];
  };
  return {calls,delays,send,sleep:async ms=>{delays.push(ms)}};
}
test('M42 profile role, thin client identity and bootstrap retry ONLY typed future-iat using identical JWT',async()=>{
 for(const name of ['iberfit_current_role_v26','iberfit_client_id','iberfit_bootstrap_v26']){
  const t=capture([future,valid]);
  const result=await qaM42ReadOnlyRpcWithFutureIatRetry({name,token:'synthetic-jwt',send:t.send,sleep:t.sleep});
  assert.equal(result.status,200);
  assert.equal(t.calls.length,2);
  assert.deepEqual(t.delays,[350]);
  assert.deepEqual([...new Set(t.calls.map(c=>c.token))],['synthetic-jwt']);
  assert.ok(t.calls.every(c=>c.method==='POST'&&c.path==='/rest/v1/rpc/'+name));
 }
});
test('M42 cannot retry expired/invalid/403 or mutating endpoints',async()=>{
 for(const name of ['iberfit_execute_command_v26','iberfit_current_role_v26']){
  for(const response of [expired,{status:403,body:future.body},{status:401,body:{code:'PGRST302',message:'JWT issued at future'}}]){
   const t=capture([response,valid]);
   const result=await qaM42ReadOnlyRpcWithFutureIatRetry({name,token:'synthetic-jwt',send:t.send,sleep:t.sleep});
   assert.equal(result.status,response.status);assert.equal(t.calls.length,1);assert.deepEqual(t.delays,[]);
  }
 }
 const t=capture([future,valid]);
 await qaM42ReadOnlyRpcWithFutureIatRetry({name:'iberfit_execute_command_v26',token:'synthetic-jwt',send:t.send,sleep:t.sleep});
 assert.equal(t.calls.length,1);
});
test('M42 retries at most 3 times, exhausting future-iat remains a failing 401',async()=>{
 const t=capture([future,future,future,future,valid]);
 const result=await qaM42ReadOnlyRpcWithFutureIatRetry({name:'iberfit_current_role_v26',token:'synthetic-jwt',send:t.send,sleep:t.sleep});
 assert.equal(result.status,401);assert.equal(t.calls.length,4);
 assert.deepEqual(t.delays,[350,800,1300]);
});
test('M42 real gate uses only centralized exact clock skew helper',()=>{
 const source=readFileSync(new URL('../scripts/remote-gates/run_qa_m42_avatar_private_gate.mjs',import.meta.url),'utf8');
 assert.match(source,/qaM42ReadOnlyRpcWithFutureIatRetry\(\{name,token,json,send\}\)/u);
 assert.doesNotMatch(source,/if\(r\.status===401\)|retryAny|skipRoleCheck/u);
});

test('V45 synthetic QA reuses bounded future-iat identity reads',()=>{
  const source=readFileSync(new URL('../scripts/remote-gates/run_qa_connected360_v45_write_gate.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("QA_READ_ONLY_IDENTITY_RPCS=new Set(['iberfit_current_role_v26','iberfit_client_id'])"));
  assert.ok(source.includes('if(QA_READ_ONLY_IDENTITY_RPCS.has(name))'));
  assert.ok(source.includes('qaM42ReadOnlyRpcWithFutureIatRetry({'));
  assert.ok(source.includes("return request('/rest/v1/rpc/'+name,{token,payload});"));
  assert.doesNotMatch(source,/retryAny401|ignorePgrst303/iu);
});
