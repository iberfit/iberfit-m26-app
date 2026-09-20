import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('scripts/remote-gates/run_authenticated_readonly_gate.mjs','utf8').replace(/\r\n/g,'\n');

test('remote read-only gate keeps QA clients non-privileged and coach privileged',()=>{
  assert.doesNotMatch(source,/CLIENT_A_MULTIAPP_CONTEXT_MISMATCH|CLIENT_A_MULTIAPP_ASSURANCE_CONTRACT_FAILED/u);
  assert.match(source,/!applicationRoles\.includes\('client'\)\|\|applicationRoles\.includes\('admin'\)\|\|applicationRoles\.includes\('coach'\)/u);
  assert.match(source,/assurance\?\.privileged!==false/u);
  assert.match(source,/assurance\?\.mfaRequired!==false/u);
  assert.match(source,/assurance\?\.webauthnRequired!==false/u);
  assert.match(source,/RC65_C2_REMOTE_COACH_ASSURANCE_CONTRACT_FAILED/u);
  assert.match(source,/assurance\?\.privileged!==true/u);
  assert.match(source,/reportedRole!=='coach'/u);
});
