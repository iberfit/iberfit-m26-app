import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const spec=await readFile(new URL('../qa/rc64/authenticated-current-contract.spec.mjs',import.meta.url),'utf8');

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
