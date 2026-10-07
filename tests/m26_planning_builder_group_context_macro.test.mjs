import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addTrainingGroup,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const records=[
  {id:'a',name_es:'Press',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'b',name_es:'Remo',pattern:'tirón',equipment:'TRX',difficulty:'inicial',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
];

function stubRender(draft,catalog){
  return renderSessionBuilder({draft,catalog,role:'coach'});
}

test('la biblioteca deja claro el grupo activo y su capacidad',()=>{
  const catalog=createExerciseCatalog(records);
  const draft=createSessionDraft({clientId:'client'});
  addTrainingGroup(draft,'biserie',[]);
  addCatalogExercise(draft,'a',catalog,{});
  const html=stubRender(draft,catalog);
  assert.match(html,/data-session-active-group-target/);
  assert.match(html,/Añadiendo al grupo activo/);
  assert.match(html,/Biserie · 1\/2 ejercicios/);
  assert.match(html,/data-session-action="close-group"/);
});

test('un ejercicio ya incluido no puede añadirse de nuevo por accidente',()=>{
  const catalog=createExerciseCatalog(records);
  const draft=createSessionDraft({clientId:'client'});
  addTrainingGroup(draft,'biserie',[]);
  addCatalogExercise(draft,'a',catalog,{});
  const html=stubRender(draft,catalog);
  assert.match(html,/data-exercise-id="a" disabled aria-disabled="true" title="Ya incluido en el grupo activo"/);
  assert.match(html,/data-exercise-id="b"(?! disabled)/);
});

test('al completar el grupo desaparece el contexto de alta',()=>{
  const catalog=createExerciseCatalog(records);
  const draft=createSessionDraft({clientId:'client'});
  addTrainingGroup(draft,'biserie',[]);
  addCatalogExercise(draft,'a',catalog,{});
  addCatalogExercise(draft,'b',catalog,{});
  assert.equal(draft.activeGroupId,undefined);
  assert.doesNotMatch(stubRender(draft,catalog),/data-session-active-group-target/);
});

test('el contexto de grupo mantiene touch y responsive premium',()=>{
  const css=fs.readFileSync('src/m26/design/dark-iberfit-v2.css','utf8');
  assert.match(css,/\.m26-builder-group-target button\{[\s\S]*?min-height:44px/u);
  assert.match(css,/@media \(max-width:520px\)\{[\s\S]*?\.m26-builder-group-target(?:,\s*\.m26-builder-template-adaptation)?\{[\s\S]*?flex-direction:column/u);
});