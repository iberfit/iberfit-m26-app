import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const catalog=createExerciseCatalog([
  {id:'a',name_es:'Press',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'b',name_es:'Remo',pattern:'tirón',equipment:'TRX',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
]);

function templateDraft(){
  const draft=createSessionDraft({clientId:'client-history',durationMinutes:50});
  addCatalogExercise(draft,'a',catalog);
  addCatalogExercise(draft,'b',catalog);
  return draft;
}

test('adaptación de plantilla resume cobertura histórica y señala el primer hueco',()=>{
  const draft=templateDraft();
  const missingBlockId=draft.blocks[1].id;
  const html=renderSessionBuilder({
    draft,
    catalog,
    role:'coach',
    templateAdaptation:{templateName:'Base A',templateVersion:3,clientDurationMinutes:50,source:'cycle'},
    exerciseMemoryFor:(exerciseId)=>exerciseId==='a'?{latest:{completedAt:'2026-10-01T10:00:00Z'}}:null,
  });
  assert.match(html,/data-session-template-history-coverage/u);
  assert.match(html,/1\/2 ejercicios con historial confirmado\./u);
  assert.match(html,new RegExp(`data-session-review-block="${missingBlockId}"`));
  assert.match(html,/Revisar primer bloque sin historial/u);
});

test('si todos los ejercicios tienen memoria no se inventa una tarea pendiente',()=>{
  const html=renderSessionBuilder({
    draft:templateDraft(),
    catalog,
    role:'coach',
    templateAdaptation:{templateName:'Base A',templateVersion:3,clientDurationMinutes:50,source:'cycle'},
    exerciseMemoryFor:()=>({latest:{completedAt:'2026-10-01T10:00:00Z'}}),
  });
  assert.match(html,/2\/2 ejercicios con historial confirmado\./u);
  assert.match(html,/Historial disponible para todos/u);
  assert.doesNotMatch(html,/data-session-review-block/u);
});

test('navegación a hueco de historial es local y no entra en command bus',()=>{
  const controller=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(controller,/const reviewBlock=event\.target\.closest\?\.\('\[data-session-review-block\]'\)/u);
  assert.match(controller,/target\.scrollIntoView\?\.\(\{behavior:'smooth',block:'start'\}\)/u);
  assert.match(controller,/focusBuilderBlock\(blockId\);/u);
  assert.match(controller,/const reviewBlock=[\s\S]*?return;[\s\S]*?const jump=/u);
});

test('copy y controles de adaptación conservan estilos independientes',()=>{
  const css=fs.readFileSync('src/m26/design/dark-iberfit-v2.css','utf8');
  assert.match(css,/\.m26-builder-template-copy\{/u);
  assert.doesNotMatch(css,/\.m26-builder-template-adaptation > div\{/u);
});
