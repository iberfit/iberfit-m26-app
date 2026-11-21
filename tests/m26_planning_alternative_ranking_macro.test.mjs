import test from 'node:test';
import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const catalog=createExerciseCatalog([
  {id:'a',name_es:'Press A',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'b',name_es:'Press B',pattern:'empuje',equipment:'mancuernas',difficulty:'inicial',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'c',name_es:'Press C',pattern:'empuje',equipment:'TRX',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'d',name_es:'Sentadilla',pattern:'sentadilla',equipment:'peso corporal',difficulty:'inicial',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
]);

test('alternativas priorizan mismo patrón y material y separan otro material',()=>{
  const draft=createSessionDraft({clientId:'c'});
  addCatalogExercise(draft,'a',catalog);
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.match(html,/optgroup label="Mismo patrón y material"/u);
  assert.match(html,/optgroup label="Mismo patrón y material"><option value="b">/u);
  assert.match(html,/optgroup label="Mismo patrón · otro material"><option value="c">/u);
  assert.doesNotMatch(html,/<option value="d"/u);
  assert.match(html,/IBERFIT no cambia el ejercicio automáticamente/u);
});

test('alternativa seleccionada permanece visible aunque salga del ranking principal',()=>{
  const draft=createSessionDraft({clientId:'c'});
  addCatalogExercise(draft,'a',catalog);
  draft.blocks[0].alternativeId='d';
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.match(html,/optgroup label="Alternativa actual"/u);
  assert.match(html,/option value="d" selected/u);
});

test('Plan B de último recurso muestra otros patrones solo si no existe alternativa del mismo patrón',()=>{
  const sparse=createExerciseCatalog(catalog.list().filter((item)=>['a','d'].includes(item.id)));
  const draft=createSessionDraft({clientId:'c'});
  addCatalogExercise(draft,'a',sparse);
  const html=renderSessionBuilder({draft,catalog:sparse,role:'coach'});
  assert.match(html,/optgroup label="Otros patrones · revisar con Coach"><option value="d">/u);
  assert.match(html,/IBERFIT no cambia el ejercicio automáticamente/u);
  assert.doesNotMatch(html,/option value="d" selected/u);
});
