import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const app=read('public/m26/app.js');
const sw=read('public/m26/sw.js');
const rootSw=read('public/m26/iberfit-sw.js');

test('P0 service worker bounds every shell network wait instead of allowing an infinite fetch',()=>{
  assert.match(sw,/const NETWORK_TIMEOUT_MS=6000;/u);
  assert.match(sw,/const INSTALL_ASSET_TIMEOUT_MS=10000;/u);
  assert.match(sw,/async function fetchWithDeadline\(input,init=\{\},timeoutMs=NETWORK_TIMEOUT_MS\)/u);
  assert.match(sw,/const controller=new AbortController\(\)/u);
  assert.match(sw,/signal:controller\.signal/u);
  assert.match(sw,/fetchWithDeadline\([\s\S]*INSTALL_ASSET_TIMEOUT_MS/u);
  assert.match(sw,/async function cacheFirst\([\s\S]*fetchWithDeadline\(/u);
  assert.match(sw,/async function networkFirst\([\s\S]*fetchWithDeadline\(/u);
});

test('P0 network fallback stays inside the active release cache and never searches arbitrary stale caches',()=>{
  const start=sw.indexOf('async function networkFirst');
  const end=sw.indexOf("self.addEventListener('install'",start);
  assert.ok(start>=0&&end>start);
  const block=sw.slice(start,end);
  assert.match(block,/const cache=await caches\.open\(SHELL\)/u);
  assert.match(block,/await cache\.match\(request\)/u);
  assert.match(block,/await cache\.match\(fallback\)/u);
  assert.doesNotMatch(block,/caches\.match\(request\)/u);
  assert.doesNotMatch(block,/caches\.match\(fallback\)/u);
});

test('P0 root navigation uses the same bounded network primitive and release-local offline shell',()=>{
  assert.match(rootSw,/const cache=await caches\.open\(SHELL\)/u);
  assert.match(rootSw,/fetchWithDeadline\(/u);
  assert.match(rootSw,/NETWORK_TIMEOUT_MS/u);
  assert.match(rootSw,/cache\.match\('\/m26\/index\.html'\)/u);
  assert.match(rootSw,/cache\.match\('\/m26\/offline\.html'\)/u);
  assert.doesNotMatch(rootSw,/caches\.match\('\/m26\/index\.html'\)/u);
});

test('P0 stalled bootstrap self-repairs once per release without deleting account or local training data',()=>{
  assert.match(app,/BOOTSTRAP_AUTO_REPAIR_PREFIX='m26:bootstrap-auto-repair-v1:'/u);
  assert.match(app,/function bootstrapAutoRepairKey\(\)/u);
  assert.match(app,/sessionStorage\?\.getItem\?\.\(key\)==='1'/u);
  assert.match(app,/sessionStorage\?\.setItem\?\.\(key,'1'\)/u);
  assert.match(app,/void autoRepairBootstrapOnce\(\)/u);
  assert.match(app,/12000/u);
  assert.match(app,/repairInstalledAppShell\(\)/u);
  assert.match(app,/globalThis\.location\?\.reload\?\.\(\)/u);
  assert.doesNotMatch(app,/localStorage\?*\.clear|localStorage\.clear/u);
  assert.doesNotMatch(app,/indexedDB\.deleteDatabase|deleteDatabase\(/u);
});

test('P0 full application bootstrap has explicit module/create/mount deadlines',()=>{
  assert.match(app,/module:8000,create:4000,mount:18000,enhancement:5000,repair:5000/u);
  assert.match(app,/M26_BOOTSTRAP_MODULE_TIMEOUT/u);
  assert.match(app,/M26_BOOTSTRAP_CREATE_TIMEOUT/u);
  assert.match(app,/M26_BOOTSTRAP_MOUNT_TIMEOUT/u);
  assert.match(app,/bootstrapDeadline\(\s*app\.mount\(\)/u);
});

test('P0 optional post-login enhancement cannot keep the authenticated app in a not-ready state',()=>{
  const start=app.indexOf('async function loadFullApplication()');
  const end=app.indexOf('if(runtime.enabled)',start);
  assert.ok(start>=0&&end>start);
  const block=app.slice(start,end);
  const readyIndex=block.indexOf('globalThis.__IBERFIT_M26_APP__=app;');
  const enhancementIndex=block.indexOf("bootstrapPhase='enhancement';");
  assert.ok(readyIndex>=0);
  assert.ok(enhancementIndex>readyIndex);
  assert.match(block,/clearBootstrapWatchdog\(\);[\s\S]*clearBootstrapAutoRepairGuard\(\);/u);
  assert.match(block,/M26_BOOTSTRAP_ENHANCEMENT_TIMEOUT/u);
});

test('P0 successful bootstrap clears the one-shot auto-repair guard so future genuine incidents can recover',()=>{
  assert.match(app,/function clearBootstrapAutoRepairGuard\(\)/u);
  assert.match(app,/removeItem\?\.\(bootstrapAutoRepairKey\(\)\)/u);
  const loadStart=app.indexOf('async function loadFullApplication()');
  const loadEnd=app.indexOf('if(runtime.enabled)',loadStart);
  const block=app.slice(loadStart,loadEnd);
  assert.match(block,/clearBootstrapAutoRepairGuard\(\);/u);
});
