import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('el reset de biblioteca solo aparece cuando existe búsqueda o filtro activo',()=>{
  const ui=fs.readFileSync('src/m26/workflows/session-ui.js','utf8');
  assert.match(ui,/const libraryResetMarkup=\(String\(query\|\|''\)\.trim\(\)\|\|activeFilterCount\)\?/u);
  assert.match(ui,/data-session-action="clear-library-filters"/u);
});

test('limpiar biblioteca reinicia query y las cuatro facetas sin tocar dominio',()=>{
  const controller=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(controller,/action==='clear-library-filters'\)\{context\.setQuery\?\.\(''\)/u);
  assert.match(controller,/for\(const key of \['pattern','equipment','difficulty','intent'\]\)context\.setFilter\?\.\(key,''\)/u);
  assert.match(controller,/renderSession\(\);const search=root\.querySelector\?\.\('\[data-session-search\]'\)/u);
  assert.match(controller,/return;\}if\(action==='next'/u);
});

test('tras limpiar se devuelve el foco a la búsqueda sin scroll inesperado',()=>{
  const controller=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(controller,/search\?\.focus\?\.\(\{preventScroll:true\}\)/u);
});

test('el control de reset mantiene target táctil e i18n',()=>{
  const css=fs.readFileSync('src/m26/design/dark-iberfit-v2.css','utf8');
  const i18n=fs.readFileSync('src/m26/ui/i18n-surface.js','utf8');
  assert.match(css,/\.m26-builder-library-reset\{[\s\S]*?min-height:44px/u);
  assert.match(i18n,/\['Limpiar búsqueda y filtros','Clear search and filters'/u);
});