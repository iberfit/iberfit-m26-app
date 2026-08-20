import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC64.2B wearable initial sync starts only after fail-closed local verification',()=>{
  const app=read('src/m26/app/application.js');
  const wearable=read('src/m26/wearables/controller.js');

  const setupStart=app.indexOf('async function setupAuthenticated()');
  assert.ok(setupStart>=0);

  const setupEnd=app.indexOf('\n  function guardSessionNavigation',setupStart);
  assert.ok(setupEnd>setupStart);

  const setup=app.slice(setupStart,setupEnd);

  const controllerReady=setup.indexOf("qaStage('rc64-controller-mounts-ready')");
  const verificationAwait=setup.indexOf("qaStage('rc64-verification-await-start')");
  const verificationCall=setup.indexOf('await refreshVerificationState({repository:operationRepository,store});');
  const verificationReady=setup.indexOf("qaStage('rc64-verification-ready')");
  const wearableMount=setup.indexOf('wearables.mount();');
  const wearableReady=setup.indexOf("qaStage('rc64-wearables-post-verification-mount-ready')");
  const setupReady=setup.indexOf("qaStage('rc64-setup-ready')");

  for(const [name,value] of Object.entries({
    controllerReady,
    verificationAwait,
    verificationCall,
    verificationReady,
    wearableMount,
    wearableReady,
    setupReady,
  })){
    assert.ok(value>=0,`missing ${name}`);
  }

  assert.ok(controllerReady<verificationAwait);
  assert.ok(verificationAwait<verificationCall);
  assert.ok(verificationCall<verificationReady);
  assert.ok(verificationReady<wearableMount);
  assert.ok(wearableMount<wearableReady);
  assert.ok(wearableReady<setupReady);

  // Exactly one wearable mount exists in authenticated setup.
  assert.equal(
    [...setup.matchAll(/wearables\.mount\(\);/gu)].length,
    1,
  );

  // Verification remains fail-closed and awaited; this is not a bypass.
  assert.match(
    setup,
    /await refreshVerificationState\(\{repository:operationRepository,store\}\);/u,
  );

  // Wearable sync behavior is preserved; only its startup ordering changes.
  assert.match(wearable,/void remoteSync\.flush\(\)\.catch/u);
  assert.match(wearable,/globalThis\.addEventListener\?\.\(\s*'online'/u);
  assert.match(wearable,/async function syncPending\(\)/u);

  // No timing workaround is introduced into product code.
  const changedWindow=setup.slice(
    Math.max(0,verificationAwait-300),
    Math.min(setup.length,wearableReady+300),
  );
  assert.doesNotMatch(changedWindow,/setTimeout|sleep|delay|20_000|20_500|90_000/u);
});

test('RC64.2B IndexedDB v3 and shared-open hardening remain intact',()=>{
  const source=read('src/m26/platform/key-value-store.js');
  assert.match(source,/M26_BROWSER_INDEXED_DB_SCHEMA_VERSION=3/u);
  assert.match(source,/canonicalIndexedDbOpenRegistries=new WeakMap\(\)/u);
  assert.match(source,/M26_BROWSER_PRIMARY_STORAGE_DEADLINE_MS=2000/u);
});
