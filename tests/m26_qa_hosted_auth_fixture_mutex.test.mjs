import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../.github/workflows/'+p,import.meta.url),'utf8');
const hosted=read('hosted-auth-security-hardening.yml');
const admin=read('admin-webauthn-recurring.yml');
const coach=read('coach-webauthn-recurring.yml');
const canary=read('canary-exact-deploy.yml');
const remote=readFileSync(new URL('../scripts/remote-gates/run_authenticated_readonly_gate.mjs',import.meta.url),'utf8');

test('Hosted Auth cannot assert the QA Client role during temporary Admin elevation',()=>{
  const job=hosted.slice(hosted.indexOf('  harden-and-verify-qa:'));
  assert.match(job,/environment: m26-canary-readonly/u);
  assert.match(job,/concurrency:\s*\n\s*group: iberfit-qa-shared-auth-readonly\s*\n\s*queue: max\s*\n\s*cancel-in-progress: false/u);
  assert.match(job,/node scripts\/remote-gates\/run_authenticated_readonly_gate\.mjs/u);
  assert.match(admin,/group: iberfit-qa-shared-auth-readonly/u);
  assert.match(coach,/group: iberfit-qa-shared-auth-readonly/u);
  assert.match(canary,/group: iberfit-qa-shared-auth-readonly/u);
});
test('temporary Admin fixture is restored and pure-client role isolation stays strict',()=>{
  assert.match(admin,/action:"prepare",target:"admin"/u);
  assert.match(admin,/state\.adminRoleActive == true/u);
  assert.match(admin,/action:"reset",target:"admin"/u);
  assert.match(admin,/state\.adminRoleActive == false/u);
  assert.match(admin,/name: Cleanup ephemeral Admin QA WebAuthn fixture\s*\n\s*if: always\(\)/u);
  assert.match(remote,/applicationRoles\.includes\('admin'\)\|\|applicationRoles\.includes\('coach'\)/u);
  assert.match(remote,/RC74_4_CLIENT_ROLE_CONTEXT_MISMATCH/u);
  assert.doesNotMatch(hosted,/sleep [0-9]|ALLOW_ADMIN_CLIENT_DUAL_ROLE/u);
});
