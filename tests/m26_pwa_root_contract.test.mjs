import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const manifest=JSON.parse(read('public/m26/manifest.webmanifest'));
const headers=read('public/m26/_headers');
const redirects=read('public/m26/_redirects');
const platformPwa=read('src/m26/platform/pwa.js');
const application=read('src/m26/app/application.js');
const canonicalSw=read('public/m26/iberfit-sw.js');
const legacySw=read('public/m26/sw.js');
const generator=read('scripts/generate_rc58_app_shell.mjs');

test('IBERFIT usa raíz canónica sin perder el árbol M26 de compatibilidad',()=>{
  assert.equal(manifest.name,'IBERFIT · Entrenamiento personal con criterio');
  assert.equal(manifest.short_name,'IBERFIT');
  assert.equal(manifest.id,'/');
  assert.equal(manifest.start_url,'/?source=pwa');
  assert.equal(manifest.scope,'/');
  assert.equal(redirects.trim(),'/ /m26/index.html 200');
  assert.ok(manifest.icons.every((icon)=>String(icon.src).startsWith('/m26/icons/')));
});

test('hosting permite scope raíz sin debilitar cabeceras de seguridad',()=>{
  assert.match(headers,/Service-Worker-Allowed: \/(?:\n|$)/u);
  assert.match(headers,/Content-Security-Policy:/u);
  assert.match(headers,/object-src 'none'/u);
  assert.match(headers,/frame-ancestors 'none'/u);
  assert.match(headers,/X-Content-Type-Options: nosniff/u);
  assert.match(headers,/X-Frame-Options: DENY/u);
  assert.match(headers,/Strict-Transport-Security: max-age=31536000; includeSubDomains/u);
  assert.match(headers,/\/m26\/runtime-config\.js[\s\S]*Cache-Control: no-store/u);
});

test('la aplicación usa el registro PWA canónico por defecto',()=>{
  assert.match(application,/registerM26ServiceWorker\(\)\.catch/u);
  assert.doesNotMatch(application,/registerM26ServiceWorker\(\{url:'\/m26\/sw\.js',scope:'\/m26\/'\}\)/u);
});

test('registro PWA conserva compatibilidad defensiva con el contrato histórico',()=>{
  assert.match(platformPwa,/CANONICAL_SW_URL='\/m26\/iberfit-sw\.js'/u);
  assert.match(platformPwa,/CANONICAL_SW_SCOPE='\/'/u);
  assert.match(platformPwa,/source==='\/m26\/sw\.js'&&requestedScope==='\/m26\/'/u);
  assert.match(platformPwa,/updateViaCache:'none'/u);
  assert.match(platformPwa,/M26_SERVICE_WORKER_SCOPE_INVALID/u);
});

test('worker canónico atiende solo la raíz y reutiliza el motor offline probado',()=>{
  assert.match(canonicalSw,/importScripts\('\/m26\/sw\.js'\)/u);
  assert.match(canonicalSw,/IBERFIT_ROOT_NAVIGATION_PATHS=new Set\(\['\/'\]\)/u);
  assert.match(canonicalSw,/request\.method==='GET'/u);
  assert.match(canonicalSw,/request\.mode==='navigate'/u);
  assert.match(canonicalSw,/url\.origin===self\.location\.origin/u);
  assert.match(canonicalSw,/caches\.match\('\/m26\/index\.html'\)/u);
  assert.match(canonicalSw,/caches\.match\('\/m26\/offline\.html'\)/u);
  assert.doesNotMatch(canonicalSw,/startsWith\('\/'\)/u);
});

test('protecciones históricas de caché y mutaciones permanecen intactas',()=>{
  assert.match(legacySw,/NEVER_CACHE_PREFIXES/u);
  assert.match(legacySw,/NEVER_CACHE_MEDIA_PREFIXES/u);
  assert.match(legacySw,/request\.method!=='GET'/u);
  assert.match(legacySw,/isRuntimeConfig/u);
  assert.match(legacySw,/VERSION='m26-rc63-2'/u);
});

test('el worker canónico queda fuera del APP_SHELL generado para evitar autocaché',()=>{
  const excludedBlock=generator.match(/const EXCLUDED_REPO_PATHS=new Set\(\[([\s\S]*?)\]\);/u)?.[1]||'';
  const forbiddenBlock=generator.match(/for\(const forbidden of \[([\s\S]*?)\]\)\{/u)?.[1]||'';
  assert.match(excludedBlock,/'public\/m26\/iberfit-sw\.js'/u);
  assert.match(excludedBlock,/SW_REPO_PATH/u);
  assert.match(forbiddenBlock,/'\/m26\/iberfit-sw\.js'/u);
  assert.match(forbiddenBlock,/'\/m26\/sw\.js'/u);
});
