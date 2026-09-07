import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/m26/index.html',import.meta.url),'utf8');

test('Admin integra la densidad premium en su CSS canónico sin ampliar el shell visual',()=>{
  assert.match(index,/data-href="\/src\/m26\/admin\/admin\.css"/u);
  assert.doesNotMatch(index,/admin-density\.css/u);
  assert.match(css,/ADMIN_PREMIUM_DENSITY_BEGIN/u);
  assert.match(css,/ADMIN_PREMIUM_DENSITY_END/u);
});

test('Los formularios principales reducen altura sin modificar su semántica',()=>{
  assert.match(css,/\.m26-admin-panel > \.m26-admin-form\s*\{/u);
  assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,12rem\),1fr\)\)/u);
  assert.match(css,/\.m26-admin-panel > \.m26-admin-form:focus-within/u);
  assert.match(css,/textarea,button\[type="submit"\]/u);
  assert.match(css,/grid-column:1 \/ -1/u);
  assert.match(css,/input\[type="hidden"\]/u);
});

test('Las tablas Admin conservan lectura y scroll táctil en escritorio y móvil',()=>{
  assert.match(css,/overscroll-behavior-inline:contain/u);
  assert.match(css,/scrollbar-gutter:stable/u);
  assert.match(css,/position:sticky/u);
  assert.match(css,/\.m26-admin-table tbody tr:hover td/u);
  assert.match(css,/@media\(max-width:700px\)/u);
  assert.match(css,/min-width:590px/u);
  assert.match(css,/@media\(max-width:430px\)/u);
});
