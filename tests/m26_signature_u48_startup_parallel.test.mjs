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
