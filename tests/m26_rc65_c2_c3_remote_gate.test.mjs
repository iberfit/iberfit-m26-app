import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('scripts/remote-gates/run_authenticated_readonly_gate.mjs','utf8');

test('RC65-C2 remote gate treats privileged Coach pre-WebAuthn 403 as the required security result',()=>{
  assert.match(source,/iberfit_privileged_assurance_context_v65d/u);
  assert.match(source,/credentialEnrolled!==true/u);
  assert.match(source,/webauthnRequired!==true/u);
  assert.match(source,/iberfitAssurance!=='required'/u);
  assert.match(source,/supabaseAal!=='aal1'/u);
  assert.match(source,/blocked\?\.status!==403/u);
  assert.match(source,/IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED/u);
  assert.match(source,/RC65_C2_REMOTE_COACH_FAIL_CLOSED_MISMATCH/u);
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

test('RC65-C2 remote gate evidence records Coach gate without credential material',()=>{
  assert.match(source,/privilegedGate:\{/u);
  assert.match(source,/message:'IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED'/u);
  assert.match(source,/credentialEnrolled:true/u);
  assert.match(source,/webauthnRequired:true/u);
  assert.doesNotMatch(source,/web_authn_credential|public_key_b64|credentialResponse|challengeId/u);
});
