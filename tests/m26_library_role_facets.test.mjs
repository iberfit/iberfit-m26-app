import test from 'node:test';
import assert from 'node:assert/strict';

import {createExerciseSearchIndex} from '../src/m26/exercises/search.js';
import {
  libraryCardMatchesFacets,
  libraryFacetValues,
  normalizeLibraryFacet,
  renderLibraryFacetController,
} from '../src/m26/library/library-facet-controller.js';
import {renderExerciseLibraryGroups,renderLibraryExerciseCard} from '../src/m26/library/exercise-media-ui.js';

const exercises=[
  {
    id:'squat-db',
    revision:2,
    name_es:'Sentadilla goblet',
    name_en:'Goblet squat',
    pattern:'sentadilla',
    equipment:'mancuerna',
    difficulty:'inicial',
    intent:'fuerza',
    primary_muscles:['cuadriceps'],
    secondary_muscles:['gluteos'],
    instructions_es:['Mantén el tronco estable.'],
    precautions:['Detener ante dolor.'],
    units:['kg','reps'],
    tags:['pierna'],
    aliases:['goblet squat'],
  },
  {
    id:'row-band',
    revision:1,
    name_es:'Remo con banda',
    pattern:'traccion',
    equipment:'banda',
    difficulty:'intermedio',
    intent:'hipertrofia',
    primary_muscles:['dorsales'],
    instructions_es:['Controla la vuelta.'],
    precautions:[],
    units:['reps'],
    tags:['espalda'],
    aliases:['remo elástico'],
  },
  {
    id:'hinge-db',
    revision:1,
    name_es:'Peso muerto rumano con mancuerna',
    pattern:'bisagra',
    equipment:'mancuerna',
    difficulty:'intermedio',
    intent:'fuerza',
    primary_muscles:['isquiotibiales'],
    instructions_es:['Mantén la espalda neutra.'],
    precautions:[],
    units:['kg','reps'],
    tags:['cadena posterior'],
    aliases:['rdl'],
  },
];

test('facetas de biblioteca salen de la metadata viva y se deduplican',()=>{
  assert.deepEqual(libraryFacetValues(exercises,'equipment'),['banda','mancuerna']);
  assert.deepEqual(libraryFacetValues(exercises,'pattern'),['bisagra','sentadilla','traccion']);
  assert.deepEqual(libraryFacetValues(exercises,'difficulty'),['inicial','intermedio']);
  assert.deepEqual(libraryFacetValues(exercises,'intent'),['fuerza','hipertrofia']);
  assert.deepEqual(libraryFacetValues(exercises,'unknown'),[]);
  assert.equal(normalizeLibraryFacet('  Tracción  '),'traccion');
});

test('búsqueda libre entiende objetivo y dificultad además del nombre',()=>{
  const index=createExerciseSearchIndex(exercises);
  assert.deepEqual(index.search('hipertrofia').map((item)=>item.id),['row-band']);
  assert.deepEqual(index.search('inicial').map((item)=>item.id),['squat-db']);
  assert.deepEqual(index.search('fuerza').map((item)=>item.id),['squat-db','hinge-db']);
});

test('Coach conserva información operativa y Cliente reduce complejidad',()=>{
  const coach=renderLibraryExerciseCard(exercises[0],null,{role:'coach'});
  assert.match(coach,/<strong>Dificultad<\/strong>/);
  assert.match(coach,/<strong>Patrón<\/strong>/);
  assert.match(coach,/<strong>Objetivo<\/strong>/);
  assert.doesNotMatch(coach,/Editar nombre global/);

  const client=renderLibraryExerciseCard(exercises[0],null,{role:'client'});
  assert.match(client,/Cómo hacerlo/);
  assert.match(client,/<strong>Material<\/strong>/);
  assert.doesNotMatch(client,/<strong>Dificultad<\/strong>/);
  assert.doesNotMatch(client,/<strong>Patrón<\/strong>/);
  assert.doesNotMatch(client,/<strong>Objetivo<\/strong>/);
  assert.doesNotMatch(client,/Músculos secundarios:/);
});

test('Admin recibe facetas avanzadas y mantiene edición global',()=>{
  const admin=renderLibraryExerciseCard(exercises[0],null,{role:'admin'});
  assert.match(admin,/Editar nombre global/);
  assert.match(admin,/data-exercise-rename-form/);
  assert.match(admin,/data-library-difficulty="inicial"/);
  assert.match(admin,/data-library-intent="fuerza"/);

  const controller=renderLibraryFacetController(exercises,{role:'admin'});
  assert.match(controller,/data-library-role="admin"/);
  assert.match(controller,/difficulty/);
  assert.match(controller,/intent/);
  assert.match(controller,/mancuerna/);
});

test('predicado Admin combina dificultad y objetivo de forma normalizada',()=>{
  const dataset={libraryDifficulty:'Intermedio',libraryIntent:'Fuerza'};
  assert.equal(libraryCardMatchesFacets(dataset,{difficulty:'intermedio',intent:'fuerza'}),true);
  assert.equal(libraryCardMatchesFacets(dataset,{difficulty:'inicial',intent:'fuerza'}),false);
  assert.equal(libraryCardMatchesFacets(dataset,{difficulty:'intermedio',intent:'hipertrofia'}),false);
});

test('los grupos siempre incluyen el controlador de facetas del rol',()=>{
  const coach=renderExerciseLibraryGroups(exercises,null,{role:'coach'});
  assert.match(coach,/m26-library-facet-controller/);
  assert.match(coach,/data-library-role="coach"/);
  assert.match(coach,/3 ejercicios|2 ejercicios|1 ejercicio/);

  const empty=renderExerciseLibraryGroups([],null,{role:'client'});
  assert.match(empty,/data-library-role="client"/);
  assert.match(empty,/No hay coincidencias/);
});
