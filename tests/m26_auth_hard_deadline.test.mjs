import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  withAuthOperationTimeout,
  __authOperationTimeoutInternals,
} from '../src/m26/app/auth-operation-timeout.js';

const {
  DEFAULT_AUTH_OPERATION_TIMEOUT_MS,
  normalizedAuthOperationTimeoutMs,
}=__authOperationTimeoutInternals;

test('auth hard deadline has a bounded production default',()=>{
  assert.equal(DEFAULT_AUTH_OPERATION_TIMEOUT_MS,12_000);
  assert.equal(normalizedAuthOperationTimeoutMs(undefined),12_000);
  assert.equal(normalizedAuthOperationTimeoutMs(1),750);
  assert.equal(normalizedAuthOperationTimeoutMs(999_999),60_000);
});

test('an auth backend operation that never settles is released by the hard deadline',async()=>{
  const startedAt=Date.now();
  await assert.rejects(
    ()=>withAuthOperationTimeout(
      ()=>new Promise(()=>{}),
      {timeoutMs:750,code:'M26_TEST_AUTH_TIMEOUT'},
    ),
    /M26_TEST_AUTH_TIMEOUT/u,
  );
  assert.ok(Date.now()-startedAt<2_000,'auth UI must not wait indefinitely for a stalled backend operation');
});

test('WebAuthn authentication bounds backend stages and avoids a redundant post-verify roundtrip',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  const start=source.indexOf('async function continueMfaWithWebAuthn()');
  const end=source.indexOf('function surfaceRetriableSessionFailure',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/boundedMfaBackend\(\(\)=>transport\.enrollWebAuthn/u);
  assert.match(block,/boundedMfaBackend\(\(\)=>transport\.challengeWebAuthn/u);
  assert.match(block,/boundedMfaBackend\(\(\)=>transport\.verifyWebAuthn/u);
  assert.match(block,/next\.privilegedRole!==expectedRole/u);
  assert.doesNotMatch(block,/transport\.authAssuranceContext/u);
  assert.doesNotMatch(block,/transport\.authUser/u);
  assert.match(source,/POST_MFA_SETUP_TIMEOUT_MS=12_000/u);
  assert.match(source,/M26_WEBAUTHN_BACKEND_TIMEOUT/u);
  assert.match(source,/M26_POST_MFA_SETUP_TIMEOUT/u);
  assert.match(source,/OPTIONAL_AUTH_BOOTSTRAP_TIMEOUT_MS=4_000/u);
  assert.match(source,/AUTH_CATALOG_TIMEOUT_MS=6_000/u);
  assert.match(source,/optionalAuthBootstrap\(\s*\(\)=>rc39Transport\.extensions/u);
  assert.match(source,/optionalAuthBootstrap\(\s*\(\)=>adminTransport\.applicationContextOptional/u);
  assert.match(source,/optionalAuthBootstrap\(\s*\(\)=>transport\.wearableBootstrap/u);
  assert.match(source,/function reportSoftDiagnostic/u);
  assert.ok(source.includes('reportSoftDiagnostic(`optional-auth-bootstrap-'));
  const optionalStart=source.indexOf('async function optionalAuthBootstrap');
  const optionalEnd=source.indexOf('\n  }\n',optionalStart)+4;
  const optionalBlock=source.slice(optionalStart,optionalEnd);
  assert.doesNotMatch(optionalBlock,/reportDiagnostic\(/u);
  assert.match(source,/withAuthOperationTimeout\(\s*\(\)=>fetchCatalog\(\)/u);
  assert.match(block,/authMode='post-mfa-loading'/u);
  assert.match(block,/beginAuthAttempt\('post-mfa-setup'\)/u);
  assert.match(source,/function surfaceRetriableSessionFailure[\s\S]{0,180}?invalidateAuthAttempt\(\)/u);
  assert.match(source,/Verificación segura confirmada\. Cargando IBERFIT…/u);
});

test('device re-enrollment also bounds backend calls so recovery cannot freeze',()=>{
  const source=fs.readFileSync('src/m26/app/access-ui.js','utf8');
  assert.match(source,/boundedDeviceBackend\(\(\)=>transport\.authUser/u);
  assert.match(source,/boundedDeviceBackend\(\(\)=>transport\.enrollWebAuthn/u);
  assert.match(source,/boundedDeviceBackend\(\(\)=>transport\.challengeWebAuthn/u);
  assert.match(source,/boundedDeviceBackend\(\(\)=>transport\.verifyWebAuthn/u);
  assert.match(source,/boundedDeviceBackend\(\(\)=>transport\.authAssuranceContext/u);
});


test('post-MFA mobile handoff paints authenticated shell before catalog and heavy controllers',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  const start=source.indexOf('async function setupAuthenticated()');
  const end=source.indexOf('function guardSessionNavigation',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);

  const hydrateReady=block.indexOf("qaStage('rc64-setup-hydrate-ready')");
  const progressiveMount=block.indexOf('shell.mount({progressive:true})');
  const firstPaint=block.indexOf('await yieldWorkspacePaint()');
  const catalogLoad=block.indexOf('()=>fetchCatalog()');
  const controllersReady=block.indexOf("qaStage('rc64-setup-controllers-ready')");
  const fullRoute=block.indexOf("qaStage('rc64-shell-route-ready')");
  const authComplete=block.indexOf('completeAuthAttempt(authAttemptId)');
  const progressiveControllers=block.indexOf('progressiveControllerMountPromise=(async()=>{');

  assert.ok(hydrateReady>=0);
  assert.ok(progressiveMount>hydrateReady);
  assert.ok(firstPaint>progressiveMount);
  assert.ok(catalogLoad>firstPaint);
  assert.ok(controllersReady>catalogLoad);
  assert.ok(fullRoute>controllersReady);
  assert.ok(authComplete>fullRoute);
  assert.ok(progressiveControllers>authComplete);
  assert.match(source,/function yieldWorkspacePaint\(\{timeoutMs=180\}=\{\}\)/u);
  assert.match(source,/requestAnimationFrame\(\(\)=>\{\s*windowLike\.requestAnimationFrame\(finish\)/u);
  assert.match(source,/setTimeout\?\.\(finish,Math\.max\(50,Math\.min\(Number\(timeoutMs\)\|\|180,500\)\)\)/u);
  assert.match(source,/function yieldMainThread\(\{timeoutMs=32\}=\{\}\)/u);
  assert.match(source,/async function mountControllersProgressively/u);
  assert.match(source,/async function mountControllersProgressively[\s\S]{0,1800}?qaStage\('rc64-controller-mounts-ready'\)/u);
  assert.match(source,/root\.dataset\.m26Interactive='ready'/u);
  assert.match(source,/root\.dataset\.m26Controllers='mounting'/u);
  assert.match(source,/root\.dataset\.m26Controllers='ready'/u);
  assert.match(source,/cancelProgressiveControllerMounts\(\)/u);
  assert.match(block,/const controllerEntries=\[/u);
  assert.match(block,/\{name:'workflow',controller:workflow\}/u);
  assert.match(block,/\{name:'session',controller:sessionController\}/u);
  assert.match(block,/progressiveControllerMountPromise=\(async\(\)=>\{/u);
});

test('progressive shell mount never computes the heavy route before the first authenticated frame',()=>{
  const source=fs.readFileSync('src/m26/shell/shell-controller.js','utf8');
  assert.match(source,/function renderWorkspaceFrame\(state=store\.getState\(\)\)/u);
  assert.match(source,/renderM26Shell\(viewModel,''\)/u);
  assert.match(source,/m26:shell-frame-ready/u);
  assert.match(source,/function mount\(\{progressive=false\}=\{\}\)/u);
  assert.match(source,/if\(progressive&&authenticated\)\{\s*renderWorkspaceFrame\(state\);\s*return;\s*\}/u);
});

test('mobile native editable controls keep an interaction hold and preserve focus across shell rerenders',()=>{
  const source=fs.readFileSync('src/m26/shell/shell-controller.js','utf8');

  assert.match(source,/const NATIVE_SELECT_INTERACTION_HOLD_MS=30_000/u);
  assert.match(source,/function schedulePointerRelease\(control\)/u);
  assert.match(source,/tag==='select'\?NATIVE_SELECT_INTERACTION_HOLD_MS:INTERACTION_RELEASE_GRACE_MS/u);
  assert.match(source,/root\.addEventListener\('pointercancel',onPointerCancel/u);
  assert.match(source,/root\.addEventListener\('focusin',onFocusIn\)/u);
  assert.match(source,/function rerenderPreservingControl\(control\)/u);
  assert.match(source,/if\(snapshot\?\.settingsOpen\)[\s\S]{0,220}?settings\.open=true/u);
  assert.match(source,/replacement\?\.focus\?\.\(\{preventScroll:true\}\)/u);

  const localeStart=source.indexOf("const localeSelector=event.target.closest?.('[data-m26-ui-locale]')");
  const preferenceStart=source.indexOf('// RC71_2_PREFERENCES_CHANGE_BEGIN',localeStart);
  assert.ok(localeStart>=0&&preferenceStart>localeStart);
  const localeBlock=source.slice(localeStart,preferenceStart);
  assert.match(localeBlock,/rerenderPreservingControl\(localeSelector\)/u);
  assert.doesNotMatch(localeBlock,/focusMain\(\)/u);

  assert.match(source,/switchClient\(selector\.value,\{openExpediente:false,source:selector,preserveSourceFocus:true\}\)/u);
});

