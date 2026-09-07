import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {
  advanceExecution,
  createExecution,
  recordSet,
  skipExecutionExercise,
  skipExecutionSet,
  startExecution,
} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const data=JSON.parse(
  fs.readFileSync(
    new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url),
  ),
);
const catalog=createExerciseCatalog(data);

function makeExecution({sets=3}={}){
  const [exercise]=catalog.list();
  const session=createSessionDraft({clientId:'c1'});
  addCatalogExercise(session,exercise.id,catalog,{sets,reps:'10'});
  const execution=createExecution({session,clientId:'c1'});
  startExecution(execution);
  return {exercise,session,execution};
}

function render(execution,session){
  return renderGuidedExecution({
    execution,
    session,
    catalog,
    role:'client',
  });
}

test('Session Live progress counts an explicitly skipped set as resolved without calling it completed',()=>{
  const {execution,session}=makeExecution();
  skipExecutionSet(execution,session,{reason:'Molestia puntual'});

  const html=render(execution,session);
  assert.match(html,/data-session-live-state="active"/);
  assert.match(html,/value="33" aria-label="Progreso 33%"/);
  assert.match(html,/data-session-progress-label>1 de 3 series resueltas · 1 omitida</);
  assert.doesNotMatch(html,/data-session-progress-label>1 de 3 series</);
});

test('Session Live keeps recorded and skipped work separate in mixed progress',()=>{
  const {execution,session}=makeExecution();
  recordSet(execution,session,{reps:10,rpe:7});
  advanceExecution(execution);
  skipExecutionSet(execution,session,{reason:'Fatiga técnica'});

  const html=render(execution,session);
  assert.match(html,/value="67" aria-label="Progreso 67%"/);
  assert.match(html,/data-session-progress-label>2 de 3 series resueltas · 1 omitida</);
  assert.match(html,/data-session-current-exercise-history/);
  assert.match(html,/Serie 1/);
  assert.doesNotMatch(html,/Serie 2<\/span><strong>Serie registrada/);
});

test('Session Live feedback reports fully skipped work transparently at 100 percent resolved',()=>{
  const {execution,session}=makeExecution();
  skipExecutionExercise(execution,session,{reason:'Dolor al patrón'});

  assert.equal(execution.status,'awaiting_feedback');
  const html=render(execution,session);
  assert.match(html,/data-session-live-state="feedback"/);
  assert.match(html,/<span>Series resueltas<\/span>/);
  assert.match(html,/<strong>3 \/ 3<\/strong>/);
  assert.match(html,/<small>0 registradas · 3 omitidas<\/small>/);
  assert.match(html,/<span>Ejercicios registrados<\/span>\s*<strong>0 \/ 1<\/strong>/);
});
