import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../scripts/remote-gates/run_authenticated_readonly_gate.mjs', import.meta.url),
  'utf8',
);

const coachBlockStart = source.indexOf("if(expectedRole==='coach')");
const clientBlockStart = source.indexOf('const applicationContext=', coachBlockStart);
assert.ok(coachBlockStart >= 0, 'coach gate must exist');
assert.ok(clientBlockStart > coachBlockStart, 'client gate must follow coach gate');
const coachBlock = source.slice(coachBlockStart, clientBlockStart);
const clientBlock = source.slice(clientBlockStart);

test('privileged coach AAL1 bootstrap is certified fail-closed until IBERFIT assurance', () => {
  assert.match(source, /COACH_BOOTSTRAP_ASSURANCE_SQLSTATE='42501'/);
  assert.match(source, /COACH_BOOTSTRAP_ASSURANCE_MESSAGE='IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED'/);
  assert.match(coachBlock, /rpcResult\('iberfit_bootstrap_v26',session\.token,\{\}\)/);
  assert.match(coachBlock, /bootstrapResult\?\.status!==403/);
  assert.match(coachBlock, /bootstrapCode!==COACH_BOOTSTRAP_ASSURANCE_SQLSTATE/);
  assert.match(coachBlock, /bootstrapMessage!==COACH_BOOTSTRAP_ASSURANCE_MESSAGE/);
  assert.match(coachBlock, /RC65_C2_REMOTE_COACH_PRIMARY_AUTH_FAIL_CLOSED_MISMATCH/);
});

test('coach evidence records the expected security block instead of claiming bootstrap access', () => {
  assert.match(coachBlock, /primaryAuthRead:\{/);
  assert.match(coachBlock, /ok:true,status:403,expectedBlocked:true/);
  assert.doesNotMatch(coachBlock, /primaryAuthRead:\{ok:true,status:200/);
  assert.doesNotMatch(coachBlock, /bootstrapRole/);
});

test('coach assurance contract remains strict before testing bootstrap fail-closed behavior', () => {
  const assuranceCheck = coachBlock.indexOf('RC65_C2_REMOTE_COACH_ASSURANCE_CONTRACT_FAILED');
  const bootstrapCall = coachBlock.indexOf("rpcResult('iberfit_bootstrap_v26'");
  assert.ok(assuranceCheck >= 0);
  assert.ok(bootstrapCall > assuranceCheck);
  assert.match(coachBlock, /assurance\?\.iberfitAssurance!=='required'/);
  assert.match(coachBlock, /assurance\?\.supabaseAal!=='aal1'/);
  assert.match(coachBlock, /assurance\?\.webauthnRequired!==true/);
});

test('non-privileged client bootstrap read remains a successful authenticated RPC', () => {
  assert.match(clientBlock, /rpc\('iberfit_bootstrap_v26',session\.token,\{\}\)/);
  assert.match(clientBlock, /RC74_4_ROLE_MISMATCH/);
  assert.match(clientBlock, /inspectClientBootstrap\(bootstrap,clientId\)/);
});
