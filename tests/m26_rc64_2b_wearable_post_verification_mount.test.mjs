import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC64.2B authenticated shell completes before local reconciliation services',()=>{
  const app=read('src/m26/app/application.js');
  const wearable=read('src/m26/wearables/controller.js');
  const conflict=read('src/m26/engagement/conflict-center.js');

  const setupStart=app.indexOf('async function setupAuthenticated()');
  const setupEnd=app.indexOf('\n  function guardSessionNavigation',setupStart);
  assert.ok(setupStart>=0&&setupEnd>setupStart);
  const setup=app.slice(setupStart,setupEnd);

  const controllerReady=setup.indexOf("qaStage('rc64-controller-mounts-ready')");
  const finalRender=setup.indexOf("qaStage('rc64-final-render-ready')");
  const setupReady=setup.indexOf("qaStage('rc64-setup-ready')");
  const reconciliationStart=setup.indexOf("qaStage('rc64-post-login-local-reconciliation-start')");
  const verificationCall=setup.indexOf('void refreshVerificationState({repository:operationRepository,store})');
  const wearableMount=setup.indexOf('wearables.mount();');
  const recoveryCall=setup.indexOf('void restoreExecution()');

  for(const [name,value] of Object.entries({
    controllerReady,
    finalRender,
    setupReady,
    reconciliationStart,
    verificationCall,
    wearableMount,
    recoveryCall,
  })){
    assert.ok(value>=0,`missing ${name}`);
  }

  assert.ok(controllerReady<finalRender);
  assert.ok(finalRender<setupReady);
  assert.ok(setupReady<reconciliationStart);
  assert.ok(reconciliationStart<verificationCall);
  assert.ok(setupReady<wearableMount);
  assert.ok(setupReady<recoveryCall);

  // No local persistence operation is awaited before setup-ready.
  const critical=setup.slice(0,setupReady);
  assert.doesNotMatch(
    critical,
    /await refreshVerificationState|await restoreExecution|wearables\.mount\(\)/u,
  );

  // Background verification still projects records when local storage responds.
  assert.match(
    setup,
    /void refreshVerificationState\(\{repository:operationRepository,store\}\)\s*\.then\(\(\)=>\{/u,
  );
  assert.match(setup,/rc64-post-login-verification-ready/u);

  // Verification actions continue to re-check the repository at interaction time.
  assert.match(
    conflict,
    /const record=\(await repository\.list\(\)\)\.find/u,
  );
  assert.match(
    conflict,
    /await refreshVerificationState\(\{repository,store\}\)/u,
  );

  // Wearable sync behavior remains available; only startup criticality changes.
  assert.match(wearable,/void remoteSync\.flush\(\)\.catch/u);
  assert.match(wearable,/async function syncPending\(\)/u);

  // No timeout inflation or fake delay is introduced into the product path.
  assert.doesNotMatch(
    setup,
    /20_000|20_500|90_000|AUTH_TIMEOUT|setTimeout\(/u,
  );
});

test('RC64.2B IndexedDB hardening and command acknowledgement policy remain present',()=>{
  const storage=read('src/m26/platform/key-value-store.js');
  const bus=read('src/m26/command-bus.js');

  assert.match(storage,/M26_BROWSER_INDEXED_DB_SCHEMA_VERSION=3/u);
  assert.match(storage,/canonicalIndexedDbOpenRegistries=new WeakMap\(\)/u);
  assert.match(storage,/M26_BROWSER_PRIMARY_STORAGE_DEADLINE_MS=2000/u);

  // Existing command-bus contract remains ACK/repository based; startup does not
  // manufacture confirmation of an operation.
  assert.match(bus,/repository/u);
  assert.doesNotMatch(
    read('src/m26/app/application.js'),
    /confirmed\s*=\s*true|status\s*=\s*['"]confirmed['"]/u,
  );
});
