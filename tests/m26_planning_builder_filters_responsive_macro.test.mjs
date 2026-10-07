import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('src/m26/design/dark-iberfit-v2.css','utf8');
const i18n=fs.readFileSync('src/m26/ui/i18n-surface.js','utf8');

test('filtros son compactos y táctiles en desktop/tablet/móvil',()=>{
  assert.match(css,/\.m26-builder-library-filters\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u);
  assert.match(css,/\.m26-builder-library-filters select\{[\s\S]*?min-height:44px/u);
  assert.match(css,/@media \(max-width:380px\)\{[\s\S]*?\.m26-builder-library-filters\{[\s\S]*?grid-template-columns:1fr/u);
  assert.match(css,/\.m26-builder-library-filters select:focus-visible\{/u);
});

test('toda la nueva superficie visible está clasificada ES EN FR PT',()=>{
  for(const label of [
    'Filtrar biblioteca','Patrón','Todos los patrones','Material','Todos los materiales',
    'Dificultad','Todas las dificultades','Objetivo','Todos los objetivos',
  ]){
    assert.match(i18n,new RegExp(`\\['${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'`));
  }
});