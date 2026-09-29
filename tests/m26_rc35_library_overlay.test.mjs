import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderLibraryExerciseCard} from '../src/m26/library/exercise-media-ui.js';

const read=(relative)=>fs.readFileSync(new URL(`../${relative}`,import.meta.url),'utf8');
const exercise={
  id:'overlay-test',
  name_es:'Sentadilla de prueba',
  pattern:'sentadilla',
  equipment:'sin material',
  primary_muscles:['Cuádriceps'],
  secondary_muscles:['Glúteos'],
  instructions_es:['Controla el descenso.'],
  precautions:['Detener ante dolor.'],
  units:['reps'],
};

test('Biblioteca abre el protocolo en un panel superpuesto sin deformar la cuadrícula',()=>{
  const css=read('src/m26/shell/shell.css');
  const coach=renderLibraryExerciseCard(exercise,null,{role:'coach'});
  const client=renderLibraryExerciseCard(exercise,null,{role:'client'});

  assert.match(coach,/m26-library-details-panel/);
  assert.match(coach,/m26-library-details-action/);
  assert.match(coach,/<summary><span>Protocolo y detalles<\/span>/);
  assert.match(client,/<summary><span>Cómo hacerlo<\/span>/);
  assert.match(css,/RC35 · Biblioteca visual: protocolo superpuesto/);
  assert.match(css,/\.m26-library-details\[open\]\{[^}]*position:fixed;[^}]*inset:0;/s);
  assert.match(css,/\.m26-library-details\[open\]>\.m26-library-details-panel\{[^}]*width:min\(52rem,100%\);[^}]*overflow:auto;/s);
  assert.match(css,/overflow-wrap:break-word;word-break:normal/);
  assert.match(css,/m26-library-details-action::before\{content:"Abrir"/);
  assert.match(css,/m26-library-details\[open\] \.m26-library-details-action::before\{content:"Cerrar"/);
});
