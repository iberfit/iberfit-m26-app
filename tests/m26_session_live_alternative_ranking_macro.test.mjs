import test from 'node:test';
import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const catalog=createExerciseCatalog([
  {id:'a',name_es:'Empuje A',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'b',name_es:'Empuje B',pattern:'empuje',equipment:'mancuernas',difficulty:'inicial',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'c',name_es:'Empuje C',pattern:'empuje',equipment:'TRX',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'d',name_es:'Sentadilla D',pattern:'sentadilla',equipment:'peso corporal',difficulty:'inicial',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
]);

function render({alternativeId=null,role='coach'}={}){
  const session=createSessionDraft({clientId:'client-live-alt'});
  addCatalogExercise(session,'a',catalog,{sets:2,reps:'10',alternativeId});
  const execution=createExecution({session,clientId:session.clientId,executionId:'exec-live-alt'});
  startExecution(execution,{actor:{role:'coach',id:'coach-live-alt'}});
  return renderGuidedExecution({execution,session,catalog,role});
}

test('Session Live prioriza mismo patrón y material antes de otro material',()=>{
  const html=render();
  const start=html.indexOf('<select data-session-substitute');
  const end=start>=0?html.indexOf('</select>',start):-1;
  const select=start>=0&&end>start?html.slice(start,end+'</select>'.length):'';
  assert.match(select,/optgroup label="Mismo patrón y material"><option value="b">/u);
  assert.match(select,/optgroup label="Mismo patrón · otro material"><option value="c">/u);
  assert.doesNotMatch(select,/<option value="d"/u);
  assert.match(select,/Empuje B · mancuernas · inicial/u);
});

test('la alternativa planificada nunca desaparece aunque quede fuera del patrón visible',()=>{
  const html=render({alternativeId:'d'});
  assert.match(html,/optgroup label="Alternativa planificada"><option value="d" selected>/u);
  assert.match(html,/Sentadilla D · peso corporal · inicial/u);
});