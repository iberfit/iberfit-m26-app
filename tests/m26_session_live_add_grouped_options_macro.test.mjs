import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const records=[
  {id:'current',name_es:'Actual',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'same-kit',name_es:'Relacionado 1',pattern:'empuje',equipment:'mancuernas',difficulty:'inicial',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'same-pattern',name_es:'Relacionado 2',pattern:'empuje',equipment:'TRX',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  ...Array.from({length:65},(_,i)=>({id:`other-${i+1}`,name_es:`Otro ${i+1}`,pattern:'otro',equipment:'peso corporal',difficulty:'inicial',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]})),
];
const catalog=createExerciseCatalog(records);
const session=createSessionDraft({clientId:'client-live-add'});
addCatalogExercise(session,'current',catalog,{sets:2,reps:'10'});
const execution=createExecution({session,clientId:session.clientId,executionId:'exec-live-add'});
startExecution(execution,{actor:{role:'coach',id:'coach-live-add'}});
const html=renderGuidedExecution({execution,session,catalog,role:'coach'});
const select=html.match(/<select data-session-live-add-exercise>[\s\S]*?<\/select>/u)?.[0]||'';

test('alta en vivo agrupa el mismo conjunto máximo de 60 ejercicios',()=>{
  assert.match(select,/optgroup label="Mismo patrón y material"><option value="same-kit">/u);
  assert.match(select,/optgroup label="Mismo patrón · otro material"><option value="same-pattern">/u);
  assert.match(select,/optgroup label="Otros ejercicios">/u);
  const ids=[...select.matchAll(/<option value="([^"]+)"/gu)].map((m)=>m[1]).filter(Boolean);
  assert.equal(ids.length,60);
  assert.ok(ids.includes('same-kit'));
  assert.ok(ids.includes('same-pattern'));
  assert.doesNotMatch(select,/option value="current"/u);
});

test('opciones muestran material y dificultad para decidir sin abrir otra vista',()=>{
  assert.match(select,/Relacionado 1 · mancuernas · inicial/u);
  assert.match(select,/Relacionado 2 · TRX · intermedio/u);
});

test('implementación conserva explícitamente el límite histórico de 60',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-ui.js','utf8');
  assert.match(source,/visible=catalog\.search\(''\)\.filter\(\(item\)=>item\.id!==currentId\)\.slice\(0,60\)/u);
});