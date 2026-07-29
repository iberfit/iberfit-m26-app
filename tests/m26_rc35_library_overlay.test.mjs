import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(relative)=>fs.readFileSync(new URL(`../${relative}`,import.meta.url),'utf8');

test('Biblioteca abre el protocolo en un panel superpuesto sin deformar la cuadrícula',()=>{
  const ui=read('src/m26/library/exercise-media-ui.js');
  const css=read('src/m26/shell/shell.css');

  assert.match(ui,/m26-library-details-panel/);
  assert.match(ui,/m26-library-details-action/);
  assert.match(ui,/<summary><span>Protocolo y detalles<\/span>/);
  assert.match(css,/RC35 · Biblioteca visual: protocolo superpuesto/);
  assert.match(css,/\.m26-library-details\[open\]\{[^}]*position:fixed;[^}]*inset:0;/s);
  assert.match(css,/\.m26-library-details\[open\]>\.m26-library-details-panel\{[^}]*width:min\(52rem,100%\);[^}]*overflow:auto;/s);
  assert.match(css,/overflow-wrap:break-word;word-break:normal/);
  assert.match(css,/m26-library-details-action::before\{content:"Abrir"/);
  assert.match(css,/m26-library-details\[open\] \.m26-library-details-action::before\{content:"Cerrar"/);
});
