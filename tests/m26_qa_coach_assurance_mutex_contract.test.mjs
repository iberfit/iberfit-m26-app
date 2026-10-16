import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const shared='iberfit-qa-shared-auth-readonly';
const session=load('.github/workflows/session-qa-isolated.yml');
const recurring=load('.github/workflows/coach-webauthn-recurring.yml');
const canary=load('.github/workflows/canary-exact-deploy.yml');
const remote=load('scripts/remote-gates/run_authenticated_readonly_gate.mjs');

test('P0 #974: synthetic Coach assurance read never races active WebAuthn ceremony',()=>{
  const job=session.slice(session.indexOf('  qa-readonly:'));
  assert.match(job,/concurrency:\s*\n\s+group: iberfit-qa-shared-auth-readonly\s*\n\s+queue: max\s*\n\s+cancel-in-progress: false/);
  const coachJob=recurring.slice(recurring.indexOf('  live-coach-webauthn:'));
  assert.match(coachJob,/concurrency:\s*\n\s+group: iberfit-qa-shared-auth-readonly\s*\n\s+queue: max\s*\n\s+cancel-in-progress: false/);
  const canaryJob=canary.slice(canary.indexOf('  qa-auth-readonly-preflight:'));
  assert.match(canaryJob,/concurrency:\s*\n\s+group: iberfit-qa-shared-auth-readonly\s*\n\s+queue: max\s*\n\s+cancel-in-progress: false/);
  assert.equal([session,recurring,canary].every(x=>x.includes(shared)),true);
  assert.match(job,/environment: m26-canary-readonly/);
  assert.match(job,/M26_QA_ONLY: 'true'/);
  assert.match(job,/run: node scripts\/remote-gates\/run_authenticated_readonly_gate\.mjs/);
});

test('P0 #974: remote failure reports fixed check labels, never secret-bearing values',()=>{
  assert.match(remote,/credentialEnrolled!==false/);
  assert.match(remote,/webauthnRequired!==true/);
  assert.match(remote,/mfaRequired!==true/);
  assert.match(remote,/iberfitAssurance!=='required'/);
  assert.match(remote,/supabaseAal!=='aal1'/);
  assert.match(remote,/bootstrapResult\?\.status!==403/);
  assert.match(remote,/const failedChecks=\[/);
  assert.match(remote,/\.filter\(\(entry\)=>entry\[1\]\)\.map\(\(entry\)=>entry\[0\]\)/);
  assert.match(remote,/failedChecks\.join\(','\)/);
  assert.doesNotMatch(remote,/console\.log\(assurance\)|JSON\.stringify\(assurance\)/);
  assert.doesNotMatch(remote,/throw new Error\([^)]*session\.userId/);
});
