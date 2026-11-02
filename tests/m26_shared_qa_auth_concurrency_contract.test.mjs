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
  assert.match(authorized,/container:\s+image: mcr\.microsoft\.com\/playwright:v1\.62\.1-noble@sha256:[a-f0-9]{64}/u);
  assert.doesNotMatch(preparation,/options: --user 1000:1000/u);
  assert.doesNotMatch(authorized,/options: --user 1000:1000/u);
  assert.match(authorized,/chown -R pwuser:pwuser \.tmp test-results playwright-report/u);
  assert.match(authorized,/runuser -u pwuser -- npm run quality:rc64:auth-smoke/u);
  assert.match(authorized,/M26_QA_ONLY: 'true'/u);
  assert.match(authorized,/group: iberfit-qa-shared-auth-readonly/u);
  const config=read('playwright.authenticated.config.mjs');
  for(const browser of ['authenticated-readonly-chromium','authenticated-readonly-webkit','authenticated-readonly-firefox']){
    assert.ok(config.includes(browser),'Do not drop browser coverage: '+browser);
  }
  const proof=read('.github/workflows/remote-gates-browser-uid-proof.yml');
  assert.match(proof,/pull_request:/u);
  assert.doesNotMatch(proof,/options: --user 1000:1000/u);
  assert.match(proof,/runuser -u pwuser -- node --input-type=module/u);
  assert.match(proof,/process\.getuid\(\)===0/u);
  assert.match(proof,/Object\.entries\(\{chromium,webkit,firefox\}\)/u);
  assert.match(proof,/await engine\.launch\(\)/u);
  assert.match(proof,/await browser\.close\(\)/u);
  assert.match(proof,/QA_NONROOT_BROWSER_OK/u);
  assert.doesNotMatch(proof,/M26_QA_.*(?:EMAIL|PASSWORD)|secrets\.|service_role/u);
});


test('P0 Free: stale PR revisions cannot start authenticated QA real-write suites',()=>{
  const guard=jobBlock(realWrite,'  pr-current-head:','\n  m42-avatar-private-real-qa:');
  assert.match(guard,/GITHUB_API_URL.*GITHUB_REPOSITORY.*pulls.*PR_NUMBER/u);
  assert.match(guard,/PR_SHA/u);
  assert.match(guard,/live_sha.*PR_SHA.*live_state.*open.*live_draft.*false/u);
  assert.match(guard,/current=false/u);
  // jq -e treats JSON false as an error; an open non-draft PR must not fail here.
  assert.match(guard,/jq -r '\.draft \| tostring'/u);
  assert.doesNotMatch(guard,/jq -er '\.draft'/u);
  assert.match(guard,/curl --fail --silent --show-error/u);
  assert.doesNotMatch(guard,/supabase\.co|M26_QA_.*PASSWORD|M26_SUPABASE_PUBLISHABLE_KEY/u);
  assert.match(realWrite,/pull-requests: read/u);
  for(const [job,next] of [
    ['m42-avatar-private-real-qa','connected360-v45-synthetic-write'],
    ['connected360-v45-synthetic-write','qa-real-write'],
    ['qa-real-write','m43-real-coach-client-qa'],
    ['m43-real-coach-client-qa','m43-real-client-browser'],
    ['m43-real-client-browser',null],
  ]){
    const block=jobBlock(realWrite,'  '+job+':',next?'\n  '+next+':':undefined);
    assert.match(block,/needs: .*pr-current-head/u,job+' must wait for current PR verification');
    assert.match(block,/needs\.pr-current-head\.outputs\.current == 'true'/u,job+' must skip stale PR');
    assert.match(block,/github\.event_name != 'pull_request' \|\| !github\.event\.pull_request\.draft/u);
    assert.match(block,/group: iberfit-qa-shared-auth-readonly\s+queue: max\s+cancel-in-progress: false/u);
  }
  const browser=jobBlock(realWrite,'  m43-real-client-browser:');
  assert.match(browser,/needs: \[pr-current-head, m43-real-coach-client-qa\]/u,
    'Do not bypass the real writer before authenticated Client browser tests');
});
