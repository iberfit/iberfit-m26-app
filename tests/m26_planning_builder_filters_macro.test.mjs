import test from 'node:test';
import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const records=[
  {id:'push-db',name_es:'Press con mancuernas',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:['pectoral'],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'row-trx',name_es:'Remo TRX',pattern:'tirón',equipment:'TRX',difficulty:'inicial',intent:'fuerza',primary_muscles:['espalda'],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'squat-bw',name_es:'Sentadilla',pattern:'sentadilla',equipment:'peso corporal',difficulty:'inicial',intent:'movilidad',primary_muscles:['cuádriceps'],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
];

test('builder expone las cuatro facetas reales del catálogo',()=>{
  const catalog=createExerciseCatalog(records);
  const draft=createSessionDraft({clientId:'client-filter'});
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  for(const key of ['pattern','equipment','difficulty','intent']){
    assert.match(html,new RegExp(`data-session-filter="${key}"`));
  }
  assert.match(html,/Todos los patrones/u);
  assert.match(html,/Todos los materiales/u);
  assert.match(html,/Todas las dificultades/u);
  assert.match(html,/Todos los objetivos/u);
});

test('filtros combinados reducen resultados sin alterar el borrador',()=>{
  const catalog=createExerciseCatalog(records);
  const draft=createSessionDraft({clientId:'client-filter'});
  const before=structuredClone(draft);
  const html=renderSessionBuilder({draft,catalog,filters:{pattern:'empuje',equipment:'mancuernas'},role:'coach'});
  assert.match(html,/data-exercise-id="push-db"/u);
  assert.doesNotMatch(html,/data-exercise-id="row-trx"/u);
  assert.doesNotMatch(html,/data-exercise-id="squat-bw"/u);
  assert.match(html,/1 resultado · 2 filtros/u);
  assert.match(html,/value="empuje" selected/u);
  assert.match(html,/value="mancuernas" selected/u);
  assert.deepEqual(draft,before,'filtrar es estado de workbench y no muta la sesión');
});

test('búsqueda textual y facetas se combinan con AND',()=>{
  const catalog=createExerciseCatalog(records);
  const draft=createSessionDraft({clientId:'client-filter'});
  const hit=renderSessionBuilder({draft,catalog,query:'press',filters:{pattern:'empuje'},role:'coach'});
  assert.match(hit,/data-exercise-id="push-db"/u);
  const miss=renderSessionBuilder({draft,catalog,query:'remo',filters:{pattern:'empuje'},role:'coach'});
  assert.doesNotMatch(miss,/data-exercise-id="row-trx"/u);
  assert.match(miss,/No hay coincidencias/u);
});