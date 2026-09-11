import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const sw=read('public/m26/sw.js');
const app=read('public/m26/app.js');
const application=read('src/m26/app/application.js');
const rootSw=read('public/m26/iberfit-sw.js');
const runtimeGenerator=read('scripts/generate_final_production_runtime_config.mjs');
const pwaUpgradeConfig=read('playwright.p0-pwa-upgrade.config.mjs');
const productionEntryConfig=read('playwright.production-entry.config.mjs');

test('P0 installed upgrade and live production entry certify desktop tablet and mobile device classes',()=>{
  for(const project of [
    'p0-installed-pwa-desktop-chromium',
    'p0-installed-pwa-tablet-chromium',
    'p0-installed-pwa-mobile-chromium',
  ])assert.ok(pwaUpgradeConfig.includes(project),`installed PWA matrix missing ${project}`);

  for(const project of [
    'production-entry-desktop-chromium',
    'production-entry-tablet-chromium',
    'production-entry-mobile-chromium',
  ])assert.ok(productionEntryConfig.includes(project),`production entry matrix missing ${project}`);
});

test('P0 upgrade precaches only the critical secure shell so one optional asset cannot pin an old installed release',()=>{
  assert.match(sw,/const CRITICAL_APP_SHELL=Object\.freeze\(\[/u);
  for(const asset of [
    '/m26/index.html',
    '/m26/app.js',
    '/m26/offline.html',
    '/public/isotipo-iberfit.png',
    '/src/m26/supabase-transport.js',
    '/src/m26/app/session-vault.js',
  ]){
    assert.ok(sw.includes(`'${asset}'`),`critical shell missing ${asset}`);
  }
  const start=sw.indexOf('async function installShell()');
  const end=sw.indexOf('async function warmReleaseShell()',start);
  assert.ok(start>=0&&end>start);
  const install=sw.slice(start,end);
  assert.match(install,/CRITICAL_APP_SHELL\.map\(\(url\)=>fetchShellAsset\(cache,url\)\)/u);
  assert.doesNotMatch(install,/queue=\[\.\.\.APP_SHELL\]/u);
});

test('P0 full release warming is best-effort and cannot fail service-worker installation',()=>{
  const start=sw.indexOf('async function warmReleaseShell()');
  const end=sw.indexOf('async function releaseCacheFirst',start);
  assert.ok(start>=0&&end>start);
  const warm=sw.slice(start,end);
  assert.match(warm,/APP_SHELL\.filter\(\(url\)=>!critical\.has\(url\)\)/u);
  assert.match(warm,/if\(await cache\.match\(url\)\)continue/u);
  assert.match(warm,/try\{[\s\S]*await fetchShellAsset\(cache,url\)[\s\S]*\}catch\{/u);
  assert.match(warm,/return Object\.freeze\(\{stored,failed\}\)/u);
  assert.match(sw,/event\.data\?\.type==='WARM_RELEASE'/u);
  assert.match(sw,/event\.waitUntil\?\.\(warmReleaseShell\(\)\)/u);
});

test('P0 keeps current and immediately previous release caches without ever serving cross-release JS',()=>{
  assert.match(sw,/const PREVIOUS_SHELL=`iberfit-\$\{PREVIOUS_VERSION\}-shell`/u);
  assert.match(sw,/key!==SHELL &&\s*key!==PREVIOUS_SHELL/u);
  const releaseStart=sw.indexOf('async function releaseCacheFirst');
  const releaseEnd=sw.indexOf('async function releaseNavigationResponse',releaseStart);
  const release=sw.slice(releaseStart,releaseEnd);
  assert.match(release,/const cache=await caches\.open\(SHELL\)/u);
  assert.match(release,/const cached=await cache\.match\(request\)/u);
  assert.doesNotMatch(release,/PREVIOUS_SHELL|caches\.match/u);
});

test('P0 protected auth, API and mutable release metadata remain outside service-worker cache',()=>{
  assert.match(sw,/const NEVER_CACHE_PREFIXES=\['\/auth\/v1\/','\/api\/','\/rest\/v1\/','\/rpc\/','\/functions\/'\]/u);
  assert.match(sw,/request\.method!=='GET'/u);
  assert.match(sw,/url\.origin!==self\.location\.origin/u);
  assert.match(sw,/isMutableReleaseMetadata\(url\.pathname\)/u);
  for(const path of ['/m26/runtime-config.js','/m26/version.json','/m26/sw.js','/m26/iberfit-sw.js']){
    assert.ok(sw.includes(`'${path}'`),`mutable metadata missing ${path}`);
  }
});

test('P0 root launch stays release-pinned while update recovery remains bounded',()=>{
  assert.match(rootSw,/const cache=await caches\.open\(SHELL\)/u);
  assert.match(rootSw,/const pinnedShell=await cache\.match\('\/m26\/index\.html'\)/u);
  assert.match(rootSw,/if\(pinnedShell\)return pinnedShell/u);
  assert.match(rootSw,/fetchWithDeadline\(/u);
  assert.doesNotMatch(rootSw,/PREVIOUS_SHELL/u);
});

test('P0 a newly activated release can force already-installed windows onto its own shell',()=>{
  assert.match(sw,/let refreshClientsOnActivate=false;/u);
  assert.match(sw,/async function refreshInstalledClients\(\)/u);
  assert.match(sw,/self\.clients\.matchAll\(\{type:'window',includeUncontrolled:true\}\)/u);
  assert.match(sw,/client\.postMessage\?\.\(\{type:'IBERFIT_RELEASE_ACTIVATED',version:VERSION\}\)/u);
  assert.match(sw,/await client\.navigate\(url\.href\)/u);
  assert.match(sw,/refreshClientsOnActivate=true;[\s\S]{0,180}?self\.skipWaiting\(\)/u);
  assert.match(sw,/\.then\(\(\)=>refreshClientsOnActivate\?refreshInstalledClients\(\):undefined\)/u);
});

test('P0 no-store production runtime can self-repair a stale installed shell without deleting account data',()=>{
  assert.match(runtimeGenerator,/sourceSha,/u);
  assert.match(runtimeGenerator,/function iberfitReleaseGuard\(runtime\)/u);
  assert.match(runtimeGenerator,/expectedCache=.*iberfit-m26-prod-/u);
  assert.match(runtimeGenerator,/sw\.register\('\/m26\/iberfit-sw\.js',\{scope:'\/',updateViaCache:'none'\}\)/u);
  assert.match(runtimeGenerator,/registration\.update\?\.\(\)/u);
  assert.match(runtimeGenerator,/worker\.postMessage\(\{type:'SKIP_WAITING'/u);
  assert.match(runtimeGenerator,/registration\?\.unregister\?\.\(\)/u);
  assert.match(runtimeGenerator,/startsWith\('iberfit-m26-'\)/u);
  assert.match(runtimeGenerator,/globalThis\.location\?\.reload\?\.\(\)/u);
  const start=runtimeGenerator.indexOf('const repairStaleShell=async(registration)=>');
  const end=runtimeGenerator.indexOf('void (async()=>',start);
  const repair=runtimeGenerator.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(repair,/localStorage|indexedDB|session-vault|draft/u);
});
test('P0 app asks the active worker to warm the full release only after full app readiness',()=>{
  assert.match(app,/function warmReleaseCacheInBackground\(\)/u);
  assert.match(app,/registration\?\.active\?\.postMessage\?\.\(\{type:'WARM_RELEASE'\}\)/u);
  const start=app.indexOf('async function loadFullApplication()');
  const end=app.indexOf('if(runtime.enabled)',start);
  const block=app.slice(start,end);
  const ready=block.indexOf("bootstrapPhase='ready';");
  const warm=block.indexOf('warmReleaseCacheInBackground();');
  assert.ok(ready>=0&&warm>ready);
});

test('P0 stored-session cold start is non-blocking and exposes an explicit retry instead of freezing',()=>{
  const start=application.indexOf('function mount()');
  const end=application.indexOf('function destroy()',start);
  assert.ok(start>=0&&end>start);
  const mount=application.slice(start,end);
  assert.match(mount,/session=vault\.load\(\)/u);
  assert.match(mount,/sessionRetryAvailable=true/u);
  assert.match(mount,/Tu sesión está guardada\. Puedes continuar sin bloquear el arranque de IBERFIT\./u);
  assert.match(mount,/return Promise\.resolve\(false\)/u);
  assert.doesNotMatch(mount,/return resume\(\)/u);
  assert.doesNotMatch(mount,/continueAfterFirstFactor\(\)/u);
});

test('P0 explicit password login still continues automatically after the non-blocking application mount',()=>{
  const start=app.indexOf('async function onMinimalAuthSubmit');
  const end=app.indexOf('async function onMinimalAuthClick',start);
  assert.ok(start>=0&&end>start);
  const submit=app.slice(start,end);
  assert.match(submit,/firstFactorAccepted=true/u);
  assert.match(submit,/if\(firstFactorAccepted&&!identityReady\)\{\s*await loadedApp\.resume\(\);\s*return;/u);
});

test('P0 explicit session retry remains bounded to the saved identity and always releases the busy state',()=>{
  const start=application.indexOf('async function resume(){');
  const end=application.indexOf('async function onSubmit',start);
  assert.ok(start>=0&&end>start);
  const resume=application.slice(start,end);
  assert.match(resume,/session=vault\.load\(\)/u);
  assert.match(resume,/loginBusy=true/u);
  assert.match(resume,/authMessage\('Restaurando tu sesión segura…'\)/u);
  assert.match(resume,/return await continueAfterFirstFactor\(\)/u);
  assert.match(resume,/finally\{\s*loginBusy=false/u);
  assert.match(resume,/surfaceRetriableSessionFailure\(error,'resume'\)/u);
});
