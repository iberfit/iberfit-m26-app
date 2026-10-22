import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const entry=readFileSync(new URL('../public/m26/app.js',import.meta.url),'utf8');
const begin=entry.indexOf('async function loadFullApplication()');
const end=entry.indexOf('if(runtime.enabled)',begin);
assert.ok(begin>=0&&end>begin,'canonical entrypoint must be present');
const block=entry.slice(begin,end);

test('U48 downloads app module concurrently with full-theme stylesheet activation',()=>{
  const adaptive=block.indexOf('ensureAdaptiveLayoutStyle();');
  const signature=block.indexOf('ensureSignatureUxV2Style();');
  const start=block.indexOf("const preloadedModule=import('/src/m26/app/application.js')");
  const styleAwait=block.indexOf('await activateFullStyles();');
  const moduleAwait=block.indexOf('const loadedModule=await bootstrapDeadline(');
  const create=block.indexOf('createM26Application()');
  const mount=block.indexOf('app.mount()');
  assert.ok(adaptive>=0&&signature>adaptive&&start>signature);
  assert.ok(start<styleAwait,'module fetch must not waterfall behind CSS');
  assert.ok(styleAwait<moduleAwait,'mount must still wait for full-theme activation');
  assert.ok(moduleAwait<create&&create<mount,'create/mount must await validated module');
});

test('U48 retains explicit bounded import and fail-closed errors, without unhandled prefetch rejection',()=>{
  assert.match(block,/const preloadedModule=import\('\/src\/m26\/app\/application\.js'\)\.then\(\s*module=>\(\{module,error:null\}\),\s*error=>\(\{module:null,error\}\)/u);
  assert.match(block,/bootstrapDeadline\(\s*preloadedModule,\s*BOOTSTRAP_PHASE_TIMEOUTS\.module,\s*'M26_BOOTSTRAP_MODULE_TIMEOUT'/u);
  assert.match(block,/if\(loadedModule\.error\)throw loadedModule\.error;/u);
  assert.match(block,/bootstrapDeadline\(\s*app\.mount\(\),\s*BOOTSTRAP_PHASE_TIMEOUTS\.mount/u);
  assert.match(entry,/surfaceDeferredFullAppFailure\(error\)/u);
  assert.match(entry,/M26_BOOTSTRAP_MODULE_TIMEOUT/u);
  assert.doesNotMatch(block,/setTimeout\([^)]*reload/u);
});

test('U48 Canary live warning keeps the fail-closed gate and stores only error categories',()=>{
  const gate=readFileSync(new URL('../scripts/prelaunch/check_live_canary_gate.mjs',import.meta.url),'utf8');
  assert.match(gate,/const bootstrapWarningCodes=\[\]/u);
  assert.match(gate,/startsWith\('\[IBERFIT:bootstrap\]'\)/u);
  assert.match(gate,/M26_BOOTSTRAP_UNCLASSIFIED/u);
  assert.match(gate,/bootstrapWarningCodes,/u);
  assert.match(gate,/invariant\(visibleWarnings\.length===0,'PRELAUNCH_LIVE_WARNING_VISIBLE'\)/u);
});

test('U48 Coach QA records only allowlisted auth stage/code, not credentials or network data',()=>{
  const spec=readFileSync(new URL('../qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs',import.meta.url),'utf8');
  assert.match(spec,/__IBERFIT_M26_QA_SAFE_AUTH_STAGES__/u);
  assert.match(spec,/\^rc64-\[a-z0-9-\]\{1,64\}\$/u);
  assert.match(spec,/\^M26_\[A-Z0-9_\]\{2,120\}\$/u);
  assert.match(spec,/evidence\.safeAuthStages=await page\.evaluate/u);
  assert.doesNotMatch(spec,/evidence\.safeAuthStages\s*=\s*.*(?:token|password|headers|request\.url)/u);
});
