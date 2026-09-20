import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('scripts/remote-gates/run_authenticated_readonly_gate.mjs','utf8');

test('RC65-C2 remote gate keeps privileged Coach assurance while allowing primary-auth bootstrap reads',()=>{
  assert.match(source,/iberfit_privileged_assurance_context_v65d/u);
  assert.match(source,/credentialEnrolled!==true/u);
  assert.match(source,/webauthnRequired!==true/u);
  assert.match(source,/iberfitAssurance!=='required'/u);
  assert.match(source,/supabaseAal!=='aal1'/u);
  assert.match(source,/const bootstrapResult=await rpcResult\('iberfit_bootstrap_v26',session\.token,\{\}\);/u);
  assert.match(source,/bootstrapResult\?\.status!==200/u);
  assert.match(source,/bootstrapRole!=='coach'/u);
  assert.match(source,/RC65_C2_REMOTE_COACH_PRIMARY_AUTH_READ_MISMATCH/u);
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

test('RC65-C2 remote gate evidence separates primary-auth reads from privileged assurance without credential material',()=>{
  assert.match(source,/privilegedGate:\{/u);
  assert.match(source,/iberfitAssurance:'required'/u);
  assert.match(source,/credentialEnrolled:true/u);
  assert.match(source,/webauthnRequired:true/u);
  assert.match(source,/primaryAuthRead:\{ok:true,status:200/u);
  assert.doesNotMatch(source,/web_authn_credential|public_key_b64|credentialResponse|challengeId/u);
});