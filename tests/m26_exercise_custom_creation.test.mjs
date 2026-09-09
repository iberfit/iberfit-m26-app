import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path){
  return fs.readFileSync(new URL(path,import.meta.url),'utf8');
}

const transport=read('../src/m26/supabase-transport.js');
const application=read('../src/m26/app/application.js');
const workflow=read('../src/m26/app/workflow-controller.js');
const renderer=read('../src/m26/modules/route-render.js');
const builder=read('../src/m26/workflows/session-builder.js');
const edge=read('../supabase/functions/iberfit-catalog-admin/index.ts');

test('custom creation uses a dedicated authenticated RPC transport',()=>{
  assert.match(transport,/iberfit_create_custom_exercise_v1/);
  assert.match(transport,/async function createCustomExercise/);
  assert.match(transport,/M26_CUSTOM_EXERCISE_INVALID_RESPONSE/);
  assert.match(application,/createCustomExercise:async\(payload\)/);
});

test('Biblioteca exposes creation only to Coach/Admin and keeps sessions catalog-bound',()=>{
  assert.match(renderer,/\['coach','admin'\]\.includes\(String\(vm\.role\|\|''\)\)/);
  assert.match(renderer,/data-exercise-create-form/);
  assert.match(renderer,/Crear ejercicio personalizado/);
  assert.match(renderer,/no admite escritura libre en las sesiones/i);
  assert.match(builder,/M26_SESSION_EXERCISE_NOT_IN_CATALOG/);
});

test('workflow refreshes canonical catalog and verifies the created exercise is visible',()=>{
  assert.match(workflow,/async function createLibraryExercise/);
  assert.match(workflow,/await createCustomExercise\(/);
  assert.match(workflow,/await refreshCatalog\(\)/);
  assert.match(workflow,/M26_EXERCISE_CREATE_NOT_VISIBLE/);
  assert.match(workflow,/m26:exercise-created/);
});

test('existing catalog-admin Edge function stays Admin-only',()=>{
  assert.match(edge,/p\?\.role!=='admin'/);
  assert.doesNotMatch(edge,/create_custom_exercise/);
  assert.doesNotMatch(edge,/iberfit_create_custom_exercise_v1/);
});
