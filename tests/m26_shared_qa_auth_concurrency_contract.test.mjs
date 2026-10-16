import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const sharedGroup='iberfit-qa-shared-auth-readonly';

const daily=read('.github/workflows/daily-use-visual-evidence.yml');
const device=read('.github/workflows/device-experience-gate.yml');
const remote=read('.github/workflows/remote-gates.yml');
const realWrite=read('.github/workflows/qa-real-write-cert.yml');
const adminWebauthn=read('.github/workflows/admin-webauthn-recurring.yml');
const coachWebauthn=read('.github/workflows/coach-webauthn-recurring.yml');

function jobBlock(source,start,next){
  const begin=source.indexOf(start);
  assert.notEqual(begin,-1,`missing job start: ${start}`);
  const end=next?source.indexOf(next,begin+start.length):-1;
  return source.slice(begin,end===-1?source.length:end);
}

test('shared authenticated QA jobs use one queued non-cancelling cross-workflow concurrency group',()=>{
  const dailyCapture=jobBlock(daily,'  capture:');
  const deviceAuth=jobBlock(device,'  client-coach-qa:','\n  admin-task-matrix:');
  const remotePreflight=jobBlock(remote,'  preflight:');
  const realWriteJob=jobBlock(realWrite,'  qa-real-write:');
  const adminLive=jobBlock(adminWebauthn,'  live-admin-webauthn:','\n  gate:');
  const coachLive=jobBlock(coachWebauthn,'  live-coach-webauthn:','\n  gate:');

  for(const [name,block] of [
    ['daily capture',dailyCapture],
    ['device authenticated matrix',deviceAuth],
    ['remote authenticated gate',remotePreflight],
    ['real-write certification',realWriteJob],
    ['admin WebAuthn live certification',adminLive],
    ['coach WebAuthn live certification',coachLive],
  ]){
    assert.match(block,new RegExp(`concurrency:\\s+group: ${sharedGroup}\\s+queue: max\\s+cancel-in-progress: false`,'u'),`${name} must serialize shared QA credentials`);
    assert.match(block,/environment: m26-canary-readonly/u,`${name} must remain on the authorized read-only QA environment`);
  }
});

test('synthetic and PWA device jobs are not unnecessarily serialized behind shared authenticated QA accounts',()=>{
  const admin=jobBlock(device,'  admin-task-matrix:','\n  pwa-upgrade:');
  const pwa=jobBlock(device,'  pwa-upgrade:','\n  gate:');
  assert.doesNotMatch(admin,new RegExp(sharedGroup,'u'));
  assert.doesNotMatch(pwa,new RegExp(sharedGroup,'u'));
});


test('remote gates separate browser preparation from the credential-shared mutex',()=>{
  const preparation=jobBlock(remote,'  prepare-ui:','\n  preflight:');
  const authorized=jobBlock(remote,'  preflight:','\n  exercise-media-broker-probe:');
  assert.match(preparation,/container:\s+image: mcr\.microsoft\.com\/playwright:v1\.62\.1-noble@sha256:[a-f0-9]{64}/u);
  assert.match(preparation,/PLAYWRIGHT_BROWSERS_PATH: \/ms-playwright/u);
  assert.match(preparation,/Generar candidatos visuales canónicos Linux RC64\.2B/u);
  assert.match(preparation,/Verify Playwright browser cache/u);
  assert.doesNotMatch(preparation,/iberfit-qa-shared-auth-readonly|M26_QA_COACH_PASSWORD|M26_QA_CLIENT_A_PASSWORD/u);
  assert.match(authorized,/needs: prepare-ui/u);
  assert.match(authorized,/container:\s+image: mcr\.microsoft\.com\/playwright:v1\.62\.1-noble@sha256:[a-f0-9]{64}/u);
  assert.match(authorized,/concurrency:\s+group: iberfit-qa-shared-auth-readonly\s+queue: max\s+cancel-in-progress: false/u);
  assert.match(authorized,/environment: m26-canary-readonly/u);
  assert.doesNotMatch(authorized,/Generar candidatos visuales canónicos Linux|Restore Playwright browser cache|playwright install-deps/u);
  for(const authenticated of [
    'Ejecutar gate autenticado sin mutaciones',
    'Ejecutar smoke autenticado RC64.2B sobre fuente actual sin mutaciones',
    'Capturar evidencia visual autenticada RC64 sin mutaciones',
  ]){
    assert.ok(authorized.includes(authenticated),'Authenticated check left the protected preflight: '+authenticated);
    assert.ok(!preparation.includes(authenticated),'Authenticated check leaked to preparation: '+authenticated);
  }
  assert.match(authorized,/run: npm ci/u);
  assert.match(authorized,/QA_BROWSER_MISSING/u);
  assert.match(authorized,/if: .*github\.event_name.*READ_ONLY_REMOTE_GATE/u);
});


test('authenticated remote preflight runs as unprivileged Playwright user without dropping Firefox',()=>{
  const preparation=jobBlock(remote,'  prepare-ui:','\n  preflight:');
  const authorized=jobBlock(remote,'  preflight:','\n  exercise-media-broker-probe:');
  assert.match(authorized,/container:\s+image: mcr\.microsoft\.com\/playwright:v1\.62\.1-noble@sha256:[a-f0-9]{64}[\s\S]*?options: --user 1000:1000/u);
  assert.doesNotMatch(preparation,/options: --user 1000:1000/u);
  assert.match(authorized,/run: npm run quality:rc64:auth-smoke/u);
  assert.match(authorized,/M26_QA_ONLY: 'true'/u);
  assert.match(authorized,/group: iberfit-qa-shared-auth-readonly/u);
  const config=read('playwright.authenticated.config.mjs');
  for(const browser of ['authenticated-readonly-chromium','authenticated-readonly-webkit','authenticated-readonly-firefox']){
    assert.ok(config.includes(browser),'Do not drop browser coverage: '+browser);
  }
  const proof=read('.github/workflows/remote-gates-browser-uid-proof.yml');
  assert.match(proof,/pull_request:/u);
  assert.match(proof,/options: --user 1000:1000/u);
  assert.match(proof,/process\.getuid\(\)/u);
  assert.match(proof,/firefox\.launch\(\)/u);
  assert.match(proof,/webkit\.launch\(\)/u);
  assert.match(proof,/chromium\.launch\(\)/u);
  assert.doesNotMatch(proof,/M26_QA_.*(?:EMAIL|PASSWORD)|secrets\.|service_role/u);
});
