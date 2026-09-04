import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync(new URL('../src/m26/design/premium-ux.css',import.meta.url),'utf8');

test('Signature UI M27 se aplica globalmente a Cliente Entrenador y Administración',()=>{
  assert.match(css,/M27 · Signature UI · capa global para toda IBERFIT/u);
  assert.match(css,/\.m26-shell \{/u);
  assert.match(css,/data-m26-role="client"/u);
  assert.match(css,/data-m26-role="coach"/u);
  assert.match(css,/data-m26-role="admin"/u);
});

test('Signature UI unifica superficies formularios acciones estados y tablas',()=>{
  assert.match(css,/\.m26-route-intro/u);
  assert.match(css,/\.m26-panel/u);
  assert.match(css,/input:not\(\[type="checkbox"\]\)/u);
  assert.match(css,/\.m26-primary-action/u);
  assert.match(css,/iberfit-empty-state/u);
  assert.match(css,/iberfit-error-state/u);
  assert.match(css,/\.m26-admin-table/u);
});

test('Signature UI mantiene accesibilidad y ergonomía móvil',()=>{
  assert.match(css,/:focus-visible/u);
  assert.match(css,/prefers-reduced-motion/u);
  assert.match(css,/prefers-contrast/u);
  assert.match(css,/env\(safe-area-inset-bottom\)/u);
  assert.match(css,/min-height: 3\.15rem/u);
});

test('Signature UI sigue siendo presentación y no introduce lógica sensible',()=>{
  assert.doesNotMatch(css,/supabase|service[_-]?role|rpc\(|fetch\(|authorization|RLS/iu);
});
