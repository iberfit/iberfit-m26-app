import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC64.2B verification pipeline trace is static bounded and diagnostic-only',()=>{
  const app=read('src/m26/app/application.js');
  const conflict=read('src/m26/engagement/conflict-center.js');
  const repository=read('src/m26/platform/offline-command-repository.js');
  const storage=read('src/m26/platform/key-value-store.js');
  const smoke=read('qa/rc64/authenticated-smoke.spec.mjs');

  assert.match(smoke,/qaStages\.length>=96/u);
  assert.doesNotMatch(smoke,/qaStages\.length>=40/u);

  for(const marker of [
    'rc64-shell-role-coach',
    'rc64-shell-role-client',
    'rc64-shell-role-admin',
    'rc64-shell-role-missing',
    'rc64-controller-shell-role-coach',
    'rc64-controller-shell-role-client',
    'rc64-controller-shell-role-admin',
    'rc64-controller-shell-role-missing',
    'rc64-verification-await-start',
  ]){
    assert.ok(app.includes(marker),`missing application marker ${marker}`);
  }

  for(const marker of [
    'rc64-verification-refresh-start',
    'rc64-verification-repository-list-start',
    'rc64-verification-repository-list-ready',
    'rc64-verification-project-start',
    'rc64-verification-project-ready',
    'rc64-verification-center-start',
    'rc64-verification-center-ready',
  ]){
    assert.ok(conflict.includes(marker),`missing verification marker ${marker}`);
  }

  for(const marker of [
    'rc64-operation-repository-list-start',
    'rc64-operation-storage-entries-start',
    'rc64-operation-storage-entries-ready',
    'rc64-operation-repository-normalize-ready',
  ]){
    assert.ok(repository.includes(marker),`missing repository marker ${marker}`);
  }

  for(const marker of [
    'rc64-browser-storage-entries-start',
    'rc64-browser-storage-keys-start',
    'rc64-browser-storage-session-keys-ready',
    'rc64-browser-storage-primary-keys-start',
    'rc64-browser-storage-primary-keys-ready',
    'rc64-browser-storage-memory-keys-ready',
    'rc64-browser-storage-keys-ready',
    'rc64-browser-storage-entry-keys-ready',
    'rc64-browser-storage-entries-ready',
  ]){
    assert.ok(storage.includes(marker),`missing storage marker ${marker}`);
  }

  // Instrumentation cannot change deadlines or error handling.
  assert.match(storage,/M26_BROWSER_PRIMARY_STORAGE_DEADLINE_MS=2000/u);
  assert.match(storage,/M26_PRIMARY_STORAGE_TIMEOUT/u);
  assert.doesNotMatch(app,/AUTH_TIMEOUT/u);
  assert.doesNotMatch(conflict,/setTimeout|Promise\.race/u);
  assert.doesNotMatch(repository,/setTimeout|Promise\.race/u);

  // Every qaStage invocation in newly instrumented modules is a static literal;
  // helper declarations are the only `qaStage(stage)` dynamic-looking occurrence.
  for(const source of [app,conflict,repository,storage]){
    const expressions=[...source.matchAll(/qaStage\(([^)]+)\)/gu)]
      .map((match)=>match[1].trim());
    const declarations=expressions.filter((expression)=>expression==='stage');
    const calls=expressions.filter((expression)=>expression!=='stage');
    assert.equal(declarations.length,1);
    assert.ok(calls.length>0);
    for(const expression of calls){
      assert.match(expression,/^'rc64-[a-z0-9-]+'$/u);
    }
  }

  // Privacy assertion applies to the NEW verification-pipeline markers only.
  // Historical RC64 markers (for example rc64-login-token-ready) predate this patch
  // and are validated by the existing first-paint trace contract.
  const newVerificationStages=[
    'rc64-shell-role-coach',
    'rc64-shell-role-client',
    'rc64-shell-role-admin',
    'rc64-shell-role-missing',
    'rc64-controller-shell-role-coach',
    'rc64-controller-shell-role-client',
    'rc64-controller-shell-role-admin',
    'rc64-controller-shell-role-missing',
    'rc64-verification-await-start',
    'rc64-verification-refresh-start',
    'rc64-verification-repository-list-start',
    'rc64-verification-repository-list-ready',
    'rc64-verification-project-start',
    'rc64-verification-project-ready',
    'rc64-verification-center-start',
    'rc64-verification-center-ready',
    'rc64-operation-repository-list-start',
    'rc64-operation-storage-entries-start',
    'rc64-operation-storage-entries-ready',
    'rc64-operation-repository-normalize-ready',
    'rc64-browser-storage-entries-start',
    'rc64-browser-storage-keys-start',
    'rc64-browser-storage-session-keys-ready',
    'rc64-browser-storage-primary-keys-start',
    'rc64-browser-storage-primary-keys-ready',
    'rc64-browser-storage-memory-keys-ready',
    'rc64-browser-storage-keys-ready',
    'rc64-browser-storage-entry-keys-ready',
    'rc64-browser-storage-entries-ready',
  ];

  for(const stage of newVerificationStages){
    assert.match(stage,/^rc64-[a-z0-9-]{1,64}$/u);
    assert.doesNotMatch(
      stage,
      /email|password|token|authorization|apikey|client-id|user-id|health|pain|diagnosis/iu,
    );
    assert.ok(
      app.includes(stage)||
      conflict.includes(stage)||
      repository.includes(stage)||
      storage.includes(stage),
      `new verification marker not present in source: ${stage}`,
    );
  }
});
