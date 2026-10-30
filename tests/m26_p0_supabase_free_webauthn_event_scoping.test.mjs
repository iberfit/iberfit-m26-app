import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const required = ["src/m26/app/**","src/m26/security/**","src/m26/shell/role-policy.js","src/m26/supabase-transport.js","src/m26/production-state.js","src/m26/qa/authenticated-canary.js","src/m26/rc39/multi-role.js","src/m26/ui/i18n-surface-p0-client-auth.js","src/m26/design/auth-native.css","src/m26/design/role-surfaces.js","supabase/functions/iberfit-webauthn-v1/**","supabase/functions/iberfit-email-assurance-v1/**","supabase/functions/iberfit-qa-webauthn-cert-broker/**","supabase/migrations/**","supabase/qa-migrations/**","qa/rc64/secure-current-source-auth.mjs","playwright.authenticated.config.mjs","playwright.authenticated-visual.config.mjs",".github/workflows/canary-exact-deploy.yml",".github/workflows/production-promote.yml"];
const scopes={"coach":["qa/coach-webauthn-recurring/**","qa/coach-iri-document-privileged/**","playwright.coach-webauthn-recurring.config.mjs","playwright.coach-iri-document-privileged.config.mjs","tests/m26_coach_webauthn_recurring_contract.test.mjs","tests/m26_u56_coach_publish_scope.test.mjs","docs/DEVICE_EXPERIENCE_POLICY.md"],"admin":["src/m26/admin/**","qa/admin-webauthn-recurring/**","qa/admin-media-review-live-cert.mjs","qa/admin-catalog-live-cert.mjs","playwright.admin-webauthn-recurring.config.mjs","supabase/functions/iberfit-catalog-admin/**","tests/m26_admin_webauthn_recurring_contract.test.mjs"]};
function workflow(role){
 const content=readFileSync('.github/workflows/'+role+'-webauthn-recurring.yml','utf8');
 const pull=content.split('  pull_request:')[1]?.split('  push:')[0]||'';
 const push=content.split('  push:')[1]?.split('  workflow_dispatch:')[0]||'';
 const extract=s=>[...s.matchAll(/      - '([^']+)'/g)].map(x=>x[1]);
 return {content,pull,push,prPaths:extract(pull),pushPaths:extract(push)};
}
for(const role of ['coach','admin']){
 test('Free QA '+role+': PR and Canary push retain scoped auth gates',()=>{
  const w=workflow(role);
  assert.match(w.pull,/branches: \[canary\/rc74-4\]/);
  assert.match(w.push,/branches: \[canary\/rc74-4\]/);
  assert.deepEqual(w.pushPaths,w.prPaths);
  assert.ok(w.prPaths.length>=20);
  for(const path of [...required,...scopes[role],'.github/workflows/'+role+'-webauthn-recurring.yml']){
    assert.ok(w.prPaths.includes(path),role+' required auth scope omitted: '+path);
  }
  for(const path of ['README.md','docs/**','qa/**','src/**','src/m26/**','public/**','public/m26/**']){
    assert.ok(!w.pushPaths.includes(path),role+' unexpectedly broad trigger: '+path);
  }
  assert.match(w.content,/workflow_dispatch:/);
  assert.match(w.content,/environment: m26-canary-readonly/);
  assert.match(w.content,/group: iberfit-qa-shared-auth-readonly/);
  assert.match(w.content,/queue: max/);
  assert.match(w.content,/cancel-in-progress: false/);
  assert.match(w.content,/id-token: write/);
 });
}
