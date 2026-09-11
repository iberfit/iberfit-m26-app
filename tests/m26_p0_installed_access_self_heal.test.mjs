import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/m26/app.js','utf8').replace(/\r\n/g,'\n');

test('P0 installed access checks the canonical service worker before authenticated bootstrap completes',()=>{
  const updateIndex=source.indexOf('void prepareInstalledPwaUpdate().catch(()=>{});');
  const fullAppIndex=source.indexOf('async function loadFullApplication()');
  const runtimeBootIndex=source.indexOf('if(runtime.enabled){');
  assert.ok(updateIndex>=0);
  assert.ok(fullAppIndex>updateIndex);
  assert.ok(runtimeBootIndex>fullAppIndex);
  assert.match(source,/register\(IBERFIT_CANONICAL_SW,\{scope:'\/',updateViaCache:'none'\}\)/u);
  assert.match(source,/registration\.update\?\.\(\)/u);
  assert.match(source,/waiting\.postMessage\?\.\(\{type:'SKIP_WAITING'\}\)/u);
  assert.match(source,/controllerchange/u);
});

test('P0 bootstrap never leaves the installed app as a dead disabled login screen',()=>{
  assert.match(source,/startBootstrapWatchdog\(\);/u);
  assert.match(source,/8000/u);
  assert.match(source,/La carga está tardando más de lo normal\./u);
  assert.match(source,/data-bootstrap-action="repair"/u);
  assert.match(source,/try\{\s*await loadFullApplication\(\);\s*\}catch\(error\)\{\s*clearBootstrapWatchdog\(\);\s*renderBootstrapRecovery\(error\);\s*\}/u);
  assert.match(source,/La aplicación no terminó de cargar/u);
  assert.match(source,/Reintentar carga/u);
  assert.match(source,/Reparar la app y recargar/u);
  assert.match(source,/No necesitas desinstalar IBERFIT/u);
});

test('P0 repair is surgical: clears only IBERFIT shell cache and workers, never account or local training data',()=>{
  assert.match(source,/IBERFIT_SHELL_CACHE_PREFIX='iberfit-m26-'/u);
  assert.match(source,/startsWith\(IBERFIT_SHELL_CACHE_PREFIX\)/u);
  assert.match(source,/\['\/m26\/iberfit-sw\.js','\/m26\/sw\.js'\]/u);
  assert.match(source,/registration\.unregister/u);
  assert.doesNotMatch(source,/localStorage\?*\.clear|localStorage\.clear/u);
  assert.doesNotMatch(source,/sessionStorage\?*\.clear|sessionStorage\.clear/u);
  assert.doesNotMatch(source,/indexedDB\.deleteDatabase|deleteDatabase\(/u);
  assert.doesNotMatch(source,/iberfit:m26:session|vault\.clear/u);
  assert.match(source,/No borra tus datos de cuenta ni los borradores locales/u);
});

test('P0 optional stylesheet failure degrades presentation instead of killing authentication',()=>{
  const start=source.indexOf('async function activateFullStyles()');
  const end=source.indexOf('function ensureAdaptiveLayoutStyle()',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/Promise\.allSettled/u);
  assert.doesNotMatch(block,/await Promise\.all\(/u);
  assert.match(block,/M26_STYLE_RECOVERY_ACTIVE/u);
});

test('P0 reload guard prevents service-worker activation loops and is removed after successful boot',()=>{
  assert.match(source,/BOOTSTRAP_UPDATE_RELOAD_KEY='m26:bootstrap-update-reload-v1'/u);
  assert.match(source,/getItem\?\.\(BOOTSTRAP_UPDATE_RELOAD_KEY\)==='1'/u);
  assert.match(source,/setItem\?\.\(BOOTSTRAP_UPDATE_RELOAD_KEY,'1'\)/u);
  assert.match(source,/clearBootstrapReloadGuard\(\);/u);
  assert.match(source,/globalThis\.location\?\.reload\?\.\(\)/u);
});
