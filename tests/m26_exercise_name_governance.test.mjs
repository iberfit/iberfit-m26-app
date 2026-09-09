import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createExerciseCatalog,
} from '../src/m26/exercises/catalog.js';

import {
  createExerciseSearchIndex,
} from '../src/m26/exercises/search.js';

import {
  exerciseDisplayName,
  exerciseSearchNames,
} from '../src/m26/exercises/names.js';

import {
  renderLibraryExerciseCard,
} from '../src/m26/library/exercise-media-ui.js';

import {
  createSessionDraft,
  addCatalogExercise,
} from '../src/m26/workflows/session-builder.js';

import {
  renderSessionBuilder,
} from '../src/m26/workflows/session-ui.js';

function record(overrides={}){
  return {
    id:'IBF-TEST',
    name_es:'Remo sentado',
    name_translations:{
      en:'Seated row',
      fr:'Tirage horizontal assis',
      pt:'Remada sentada',
    },
    pattern:'tracción horizontal',
    equipment:'polea',
    difficulty:'media',
    intent:'fuerza',
    primary_muscles:['espalda'],
    revision:7,
    ...overrides,
  };
}

test('resolver usa traducción solicitada con fallback español',()=>{
  const exercise=record();

  assert.equal(
    exerciseDisplayName(exercise,'es'),
    'Remo sentado',
  );

  assert.equal(
    exerciseDisplayName(exercise,'en'),
    'Seated row',
  );

  assert.equal(
    exerciseDisplayName(exercise,'fr'),
    'Tirage horizontal assis',
  );

  assert.equal(
    exerciseDisplayName(exercise,'pt'),
    'Remada sentada',
  );

  assert.equal(
    exerciseDisplayName(
      record({name_translations:{}}),
      'en',
    ),
    'Remo sentado',
  );

  assert.deepEqual(
    exerciseSearchNames(exercise),
    [
      'Remo sentado',
      'Seated row',
      'Tirage horizontal assis',
      'Remada sentada',
    ],
  );
});

test('nombre gobernado por Admin no vuelve a ser reescrito por castellano',()=>{
  const catalog=createExerciseCatalog([
    record({
      name_es:'Press especial IBERFIT',
      name_translations:{},
      name_admin_override:true,
    }),
  ]);

  assert.equal(
    catalog.get('IBF-TEST').name_es,
    'Press especial IBERFIT',
  );

  assert.equal(
    catalog.get('IBF-TEST').name_admin_override,
    true,
  );
});

test('búsqueda encuentra el ejercicio por cualquiera de sus traducciones',()=>{
  const catalog=createExerciseCatalog([record()]);
  const index=createExerciseSearchIndex(catalog.list());

  assert.equal(
    catalog.search('seated row')[0]?.id,
    'IBF-TEST',
  );

  assert.equal(
    index.search('tirage horizontal assis')[0]?.id,
    'IBF-TEST',
  );

  assert.equal(
    index.search('remada sentada')[0]?.id,
    'IBF-TEST',
  );
});

test('editor de nombre sólo aparece a Admin',()=>{
  const item=record();

  const admin=renderLibraryExerciseCard(
    item,
    null,
    {role:'admin'},
  );

  const coach=renderLibraryExerciseCard(
    item,
    null,
    {role:'coach'},
  );

  assert.match(
    admin,
    /data-exercise-rename-form/,
  );

  assert.match(
    admin,
    /data-expected-revision="7"/,
  );

  assert.match(
    admin,
    /inglés, francés y portugués/i,
  );

  assert.doesNotMatch(
    coach,
    /data-exercise-rename-form/,
  );
});

test('builder resuelve nombre actual por exerciseId y no por copia histórica',()=>{
  const oldCatalog=createExerciseCatalog([
    record({
      name_es:'Nombre antiguo',
      name_translations:{},
      name_admin_override:true,
    }),
  ]);

  const draft=createSessionDraft({
    clientId:'client-1',
  });

  addCatalogExercise(
    draft,
    'IBF-TEST',
    oldCatalog,
  );

  assert.equal(
    draft.blocks[0].name,
    'Nombre antiguo',
  );

  const currentCatalog=createExerciseCatalog([
    record({
      name_es:'Nombre nuevo global',
      name_translations:{},
      name_admin_override:true,
    }),
  ]);

  const html=renderSessionBuilder({
    draft,
    catalog:currentCatalog,
    role:'coach',
  });

  assert.match(
    html,
    /Nombre nuevo global/,
  );

  assert.doesNotMatch(
    html,
    />Nombre antiguo</,
  );
});

test('superficies críticas resuelven por catálogo actual',()=>{
  const sessionUi=fs.readFileSync(
    new URL(
      '../src/m26/workflows/session-ui.js',
      import.meta.url,
    ),
    'utf8',
  );

  const routeVm=fs.readFileSync(
    new URL(
      '../src/m26/modules/route-view-model.js',
      import.meta.url,
    ),
    'utf8',
  );

  const mediaUi=fs.readFileSync(
    new URL(
      '../src/m26/library/exercise-media-ui.js',
      import.meta.url,
    ),
    'utf8',
  );

  const workflow=fs.readFileSync(
    new URL(
      '../src/m26/app/workflow-controller.js',
      import.meta.url,
    ),
    'utf8',
  );

  const transport=fs.readFileSync(
    new URL(
      '../src/m26/supabase-transport.js',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(sessionUi,/exerciseDisplayName/);
  assert.match(routeVm,/exerciseDisplayName/);
  assert.match(mediaUi,/exerciseDisplayName/);
  assert.match(workflow,/exerciseDisplayName/);
  assert.match(workflow,/data-exercise-rename-form/);
  assert.match(workflow,/refreshCatalog/);
  assert.match(transport,/rename_exercise/);
  assert.match(transport,/translationStatus/);
});
