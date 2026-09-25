import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('scripts/remote-gates/run_authenticated_readonly_gate.mjs','utf8');

test('RC65-C2 remote gate keeps privileged Coach requirements and fail-closes primary-auth bootstrap until assurance',()=>{
  assert.match(source,/iberfit_privileged_assurance_context_v65d/u);
  assert.match(source,/credentialEnrolled!==false/u);
  assert.match(source,/webauthnRequired!==true/u);
  assert.match(source,/iberfitAssurance!=='required'/u);
  assert.match(source,/supabaseAal!=='aal1'/u);
  assert.match(source,/const bootstrapResult=await rpcResult\('iberfit_bootstrap_v26',session\.token,\{\}\);/u);
  assert.match(source,/bootstrapResult\?\.status!==403/u);
  assert.match(source,/bootstrapCode!==COACH_BOOTSTRAP_ASSURANCE_SQLSTATE/u);
  assert.match(source,/bootstrapMessage!==COACH_BOOTSTRAP_ASSURANCE_MESSAGE/u);
  assert.match(source,/RC65_C2_REMOTE_COACH_PRIMARY_AUTH_FAIL_CLOSED_MISMATCH/u);
});

test('RC65-C2 remote gate does not attempt to automate or mutate WebAuthn',()=>{
  assert.doesNotMatch(source,/\/functions\/v1\/iberfit-webauthn-v1/u);
  assert.doesNotMatch(source,/\/auth\/v1\/factors/u);
  assert.doesNotMatch(source,/registration-options|registration-verify|authentication-options|authentication-verify/u);
  assert.match(source,/mode:'authenticated-readonly'/u);
  assert.match(source,/mutationsPerformed:false/u);
});

test('RC65-C2 remote gate keeps both Client bootstraps and privacy/isolation controls',()=>{
  assert.match(source,/const accounts=\[[\s\S]*client_a[\s\S]*client_b/u);
  assert.match(source,/const bootstrap=await rpc\('iberfit_bootstrap_v26',session\.token,\{\}\);/u);
  assert.match(source,/inspectClientBootstrap\(bootstrap,clientId\)/u);
  assert.match(source,/assertDistinctQaClientIds\(qaClientIds,RC29_QA_CLIENTS_NOT_DISTINCT\)/u);
});

test('RC65-C2 remote gate evidence records the disposable Coach fixture without credential material',()=>{
  assert.match(source,/privilegedGate:\{/u);
  assert.match(source,/iberfitAssurance:'required'/u);
  assert.match(source,/credentialEnrolled:false/u);
  assert.match(source,/webauthnRequired:true/u);
  assert.match(source,/primaryAuthRead:\{[\s\S]*?ok:true,status:403,expectedBlocked:true,code:bootstrapCode,message:bootstrapMessage/u);
  assert.doesNotMatch(source,/web_authn_credential|public_key_b64|credentialResponse|challengeId/u);
});