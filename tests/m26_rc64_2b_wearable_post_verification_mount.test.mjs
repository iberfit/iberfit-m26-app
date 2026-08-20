import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC64.2B authenticated shell arms local services without initial persistence IO and preserves future reconnect refresh',()=>{
  const app=read('src/m26/app/application.js');
  const wearable=read('src/m26/wearables/controller.js');
  const pwa=read('src/m26/platform/pwa.js');
  const telemetry=read('src/m26/telemetry/remote-sync.js');
  const conflict=read('src/m26/engagement/conflict-center.js');

  const setupStart=app.indexOf('async function setupAuthenticated()');
  const setupEnd=app.indexOf('\n  function guardSessionNavigation',setupStart);
  assert.ok(setupStart>=0&&setupEnd>setupStart);
  const setup=app.slice(setupStart,setupEnd);

  const finalRender=setup.indexOf("qaStage('rc64-final-render-ready')");
  const setupReady=setup.indexOf("qaStage('rc64-setup-ready')");
  const localBoundary=setup.indexOf("qaStage('rc64-post-login-local-reconciliation-start')");
  const localArmed=setup.indexOf("qaStage('rc64-post-login-local-services-armed')");

  assert.ok(finalRender>=0);
  assert.ok(setupReady>finalRender);
  assert.ok(localBoundary>setupReady);
  assert.ok(localArmed>localBoundary);

  assert.doesNotMatch(setup,/void refreshVerificationState/u);
  assert.doesNotMatch(setup,/void restoreExecution\(\)/u);
  assert.doesNotMatch(setup,/rc64-post-login-verification-ready/u);
  assert.doesNotMatch(setup,/rc64-post-login-recovery-ready/u);

  assert.match(setup,/wearables\.mount\(\{syncInitial:false\}\)/u);
  assert.match(setup,/connectivityStop=sync\.start\(\{emitInitial:false\}\)/u);
  assert.match(setup,/telemetrySyncStop=telemetryRemoteSync\.start\(\{flushInitial:false\}\)/u);

  const refreshMatches=setup.match(/refreshVerificationState/g)||[];
  assert.equal(refreshMatches.length,1);
  assert.match(
    setup,
    /onResult:async\(\)=>\{\s*await refreshVerificationState\(\{repository:operationRepository,store\}\);\s*render\(\);\s*\},/u,
  );

  assert.match(wearable,/mount\(\{syncInitial=true\}=\{\}\)/u);
  assert.match(wearable,/if\(syncInitial\)\{/u);
  assert.match(pwa,/start\(\{emitInitial=true\}=\{\}\)/u);
  assert.match(telemetry,/start\(\{target=globalThis,flushInitial=true\}=\{\}\)/u);

  assert.match(conflict,/action==='refresh'/u);
  assert.match(conflict,/await refreshVerificationState\(\{repository,store\}\)/u);
  assert.match(conflict,/const record=\(await repository\.list\(\)\)\.find/u);

  assert.doesNotMatch(setup,/setTimeout|sleep|delay|20_000|20_500|90_000|AUTH_TIMEOUT/u);
});

test('RC64.2B IndexedDB hardening and command acknowledgement policy remain present',()=>{
  const storage=read('src/m26/platform/key-value-store.js');
  const bus=read('src/m26/command-bus.js');

  assert.match(storage,/M26_BROWSER_INDEXED_DB_SCHEMA_VERSION=3/u);
  assert.match(storage,/canonicalIndexedDbOpenRegistries=new WeakMap\(\)/u);
  assert.match(storage,/M26_BROWSER_PRIMARY_STORAGE_DEADLINE_MS=2000/u);
  assert.match(bus,/repository/u);
  assert.doesNotMatch(
    read('src/m26/app/application.js'),
    /confirmed\s*=\s*true|status\s*=\s*['"]confirmed['"]/u,
  );
});
