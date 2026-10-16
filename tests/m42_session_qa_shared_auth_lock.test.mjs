import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/session-qa-isolated.yml',import.meta.url),'utf8');
const gate=readFileSync(new URL('../scripts/remote-gates/run_authenticated_readonly_gate.mjs',import.meta.url),'utf8');

test('M42 QA session readonly gate shares the exact serialized auth credential lock',()=>{
  const job=workflow.split('  qa-readonly:\n')[1];
  assert.ok(job,'the authenticated QA job is required');
  assert.match(job,/\n    concurrency:\n      group: iberfit-qa-shared-auth-readonly\n      queue: max\n      cancel-in-progress: false\n/);
  assert.match(job,/\n    environment: m26-canary-readonly\n/);
  assert.match(job,/run: node scripts\/remote-gates\/run_authenticated_readonly_gate\.mjs/);
});

test('M42 Coach assurance retains fail-closed contract with values-free diagnostics',()=>{
  const source=gate.split("if(expectedRole==='coach'){")[1]?.split('// A privileged AAL1 coach')[0];
  assert.ok(source,'Coach-only assurance contract must exist');
  for(const check of ['ok','privileged','mfaRequired','webauthnRequired','credentialEnrolled','emailOtpAvailable','iberfitAssurance','supabaseAal','origin','rpId','privilegedRole']){
    assert.match(source,new RegExp(`\\b${check}:`));
  }
  assert.match(source,/failedCoachAssuranceChecks\.length/);
  assert.match(source,/RC65_C2_REMOTE_COACH_ASSURANCE_FAILED_FIELDS/);
  assert.match(source,/throw new Error\('RC65_C2_REMOTE_COACH_ASSURANCE_CONTRACT_FAILED'\)/);
  assert.doesNotMatch(source,/console\.(?:log|error)\((?:assurance|JSON\.stringify\(assurance)/);
});
