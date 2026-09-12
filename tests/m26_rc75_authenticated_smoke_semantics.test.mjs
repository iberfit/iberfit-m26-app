import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const spec=await readFile(new URL('../qa/rc64/authenticated-current-contract.spec.mjs',import.meta.url),'utf8');
const config=await readFile(new URL('../playwright.authenticated.config.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/remote-gates.yml',import.meta.url),'utf8');

test('smoke autenticado usa contratos semánticos y no exige que logout esté visualmente expuesto',()=>{
  assert.match(spec,/\.m26-shell\[data-m26-role=/u);
  assert.match(spec,/\[data-m26-action=\\?"logout\\?"\]/u);
  assert.match(spec,/toHaveCount\(1,\{timeout:5_000\}\)/u);
  assert.doesNotMatch(spec,/getByRole\('button',\{name:'Cerrar sesión',exact:true\}\)/u);
});

test('smoke conserva WebAuthn privilegiado fail-closed y QA read-only',()=>{
  assert.match(spec,/mfa-continue-webauthn/u);
  assert.match(spec,/webauthnRequired/u);
  assert.match(spec,/M26_QA_ONLY/u);
  assert.match(spec,/service\[_-\]\?role/u);
  assert.match(spec,/mutationsPerformed:false/u);
});

test('smoke autenticado cubre Chromium, WebKit y Firefox sin acoplar CPU throttling a motores no Chromium',()=>{
  assert.match(config,/authenticated-readonly-webkit/u);
  assert.match(config,/authenticated-readonly-mobile-webkit/u);
  assert.match(config,/authenticated-readonly-firefox/u);
  assert.match(workflow,/playwright install --with-deps chromium webkit firefox/u);
  assert.match(spec,/browserName==='chromium'/u);
  assert.match(spec,/if\(chromiumEngine\)/u);
  assert.match(spec,/newCDPSession\(page\)/u);
  assert.match(spec,/browserEngine:browserName/u);
  assert.match(spec,/cpuThrottled:chromiumEngine/u);
});
