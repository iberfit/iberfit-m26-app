import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const catalog=createExerciseCatalog([
  {id:'a',name_es:'Empuje A',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'b',name_es:'Empuje B',pattern:'empuje',equipment:'mancuernas',difficulty:'inicial',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
]);
function markup(role){
  const session=createSessionDraft({clientId:'client-handoff'});
  addCatalogExercise(session,'a',catalog,{sets:2,reps:'10'});
  const execution=createExecution({session,clientId:session.clientId,executionId:`exec-${role}`});
  startExecution(execution,{actor:{role,id:role}});
  return renderGuidedExecution({execution,session,catalog,role});
}

test('Coach tiene acceso rápido y Cliente conserva navegación simple',()=>{
  const coach=markup('coach');
  assert.match(coach,/data-session-open-substitution>Ajustar ejercicio</u);
  assert.match(coach,/data-session-live-secondary-context/u);
  assert.match(coach,/data-session-substitution-panel/u);
  assert.doesNotMatch(markup('client'),/data-session-open-substitution/u);
});

test('handoff abre ambos disclosures y enfoca alternativa sin command action',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  const handoff=source.indexOf("const openSubstitution=event.target.closest?.('[data-session-open-substitution]')");
  const commandAction=source.indexOf("const button=event.target.closest?.('[data-session-action]')");
  assert.ok(handoff>=0&&commandAction>handoff);
  assert.match(source,/if\(outer\)outer\.open=true/u);
  assert.match(source,/panel\.open=true/u);
  assert.match(source,/panel\.scrollIntoView\?\.\(\{behavior:'smooth',block:'nearest'\}\)/u);
  assert.match(source,/root\.querySelector\?\.\('\[data-session-substitute\]'\)/u);
  assert.doesNotMatch(source,/action==='open-substitution'/u);
});

test('acceso rápido mantiene touch e i18n',()=>{
  const css=fs.readFileSync('src/m26/design/role-surfaces.css','utf8');
  const i18n=fs.readFileSync('src/m26/ui/i18n-surface.js','utf8');
  assert.match(css,/\.m26-session-live-quick-actions \[data-session-open-substitution\]\{min-height:44px\}/u);
  assert.match(i18n,/\['Ajustar ejercicio','Adjust exercise'/u);
});