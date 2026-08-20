import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC64.2B authenticated smoke recognizes the canonical setup boundary then verifies visible shell',()=>{
  const smoke=read('qa/rc64/authenticated-smoke.spec.mjs');

  assert.match(
    smoke,
    /const canonicalAuthenticatedShell=page\.locator\(\s*`\.m26-shell\[data-m26-role="\$\{account\.role\}"\]`\s*\)/u,
  );

  assert.match(
    smoke,
    /item\.stage==='rc64-login-setup-ready'/u,
  );
  assert.match(
    smoke,
    /kind:'authenticated-setup-ready'/u,
  );
  assert.match(
    smoke,
    /const setupOutcome=new Promise/u,
  );

  assert.doesNotMatch(
    smoke,
    /const authenticatedRole=page\.locator/u,
  );
  assert.doesNotMatch(
    smoke,
    /roleOutcome=authenticatedRole/u,
  );
  assert.doesNotMatch(
    smoke,
    /waitFor\(\{state:'visible',timeout:20_000\}\)/u,
  );

  assert.match(
    smoke,
    /canonicalAuthenticatedShell[\s\S]{0,240}\.toHaveCount\(1\)/u,
  );
  assert.match(
    smoke,
    /canonicalAuthenticatedShell[\s\S]{0,320}\.toBeVisible\(\{timeout:3_000\}\)/u,
  );
  assert.match(
    smoke,
    /getByRole\('button',\{name:'Cerrar sesión',exact:true\}\)/u,
  );

  // This changes the success signal, not the auth deadline or mutation protections.
  assert.match(smoke,/20_500/u);
  assert.match(smoke,/RC64_2B_AUTH_TIMEOUT/u);
  assert.match(smoke,/const READ_ONLY_RPCS=new Set/u);
  assert.match(smoke,/route\.abort\('blockedbyclient'\)/u);
  assert.match(smoke,/mutationsPerformed:false/u);

  // Runtime errors still win the race and fail the gate.
  assert.match(smoke,/runtimeFailureState/u);
  assert.match(smoke,/kind:'runtime-failure'/u);
  assert.match(
    smoke,
    /Promise\.race\(\[\s*setupOutcome,\s*runtimeOutcome,\s*deadlineOutcome,\s*\]\)/u,
  );
});

test('RC64.2B product setup boundary remains before post-login local reconciliation',()=>{
  const app=read('src/m26/app/application.js');

  const setupReady=app.indexOf("qaStage('rc64-setup-ready')");
  const postLogin=app.indexOf("qaStage('rc64-post-login-local-reconciliation-start')");
  const loginSetupReady=app.indexOf("qaStage('rc64-login-setup-ready')");

  assert.ok(setupReady>=0);
  assert.ok(postLogin>setupReady);
  assert.ok(loginSetupReady>setupReady);
});
