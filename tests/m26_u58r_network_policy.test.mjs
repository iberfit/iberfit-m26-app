import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyU58LoginState} from '../qa/coach-webauthn-recurring/u58-existing-session-client.mjs';
import {isRetryableReadOnlyRequest,classifyTransientNetworkIssue} from '../scripts/remote-gates/readonly-network-policy.mjs';

test('U58 retries only an explicit client connection error, never credentials or unknown auth',()=>{
  assert.equal(classifyU58LoginState({clientShellVisible:false,connectionErrorVisible:false}),'pending');
  assert.equal(classifyU58LoginState({clientShellVisible:false,connectionErrorVisible:true}),'retryable-network-error');
  assert.equal(classifyU58LoginState({clientShellVisible:true,connectionErrorVisible:true}),'ready');
});
test('read-only gate retries exact safe routes but never a write',()=>{
  for(const name of ['iberfit_environment','iberfit_privileged_assurance_context_v65d',
    'iberfit_bootstrap_v26','iberfit_application_context_v14','iberfit_appointment_change_requests_v13']){
    assert.equal(isRetryableReadOnlyRequest({method:'POST',pathname:'/rest/v1/rpc/'+name}),true);
  }
  assert.equal(isRetryableReadOnlyRequest({method:'GET',pathname:'/rest/v1/domain_command_registry_v26'}),true);
  for(const name of ['iberfit_execute_command_v26','m26_draft_upsert_v431','iberfit_web_push_send']){
    assert.equal(isRetryableReadOnlyRequest({method:'POST',pathname:'/rest/v1/rpc/'+name}),false);
  }
  assert.equal(isRetryableReadOnlyRequest({method:'POST',pathname:'/auth/v1/token'}),false);
  assert.equal(isRetryableReadOnlyRequest({method:'POST',pathname:'/rest/v1/domain_command_registry_v26'}),false);
});
test('network classification does not leak underlying exception details',()=>{
  assert.equal(classifyTransientNetworkIssue({name:'TimeoutError',message:'sensitive'}),'TIMEOUT');
  assert.equal(classifyTransientNetworkIssue({name:'AbortError',message:'sensitive'}),'TIMEOUT');
  assert.equal(classifyTransientNetworkIssue({name:'TypeError',message:'sensitive'}),'NETWORK');
  assert.equal(classifyTransientNetworkIssue({name:'Error',message:'Invalid password'}),null);
});
