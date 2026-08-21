import test from 'node:test';import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise,validateSessionDraft} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution,recordSet,advanceExecution,retreatExecution,finishExecution,buildExecutionCommand,substituteExercise,markExecutionSync} from '../src/m26/workflows/session-execution.js';
import {renderSessionBuilder,renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {validateCommandCatalog,M26_REQUIRED_COMMANDS} from '../src/m26/command-catalog.js';
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync(new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url)));const catalog=createExerciseCatalog(data);
function session(){const d=createSessionDraft({clientId:'c1'});addCatalogExercise(d,catalog.list()[0].id,catalog,{sets:2,reps:'10'});return d;}
test('builder renders real controls and catalog results',()=>{const d=session();const html=renderSessionBuilder({draft:d,catalog});assert.match(html,/data-session-action="publish"/);assert.match(html,/data-session-action="add-exercise"/);assert.doesNotMatch(html,/onclick=/);});
test('execution supports start record advance and rewind',()=>{const s=session();const x=createExecution({session:s,clientId:'c1'});startExecution(x);recordSet(x,s,{reps:10,rpe:7});advanceExecution(x);assert.equal(x.setIndex,1);retreatExecution(x);assert.equal(x.setIndex,0);});
test('execution requires feedback before command',()=>{const s=session();const x=createExecution({session:s,clientId:'c1'});startExecution(x);recordSet(x,s,{reps:10,rpe:7});advanceExecution(x);recordSet(x,s,{reps:9,rpe:8});advanceExecution(x);assert.equal(x.status,'awaiting_feedback');assert.throws(()=>buildExecutionCommand(x),/NOT_COMPLETED/);finishExecution(x,{sessionRpe:8,comment:'Sesión completada'});assert.equal(buildExecutionCommand(x).type,'EJECUCION_COMPLETAR');});
test('substitution only accepts catalog exercise and reason',()=>{const s=session();const x=createExecution({session:s,clientId:'c1'});const a=x.queue[0].exerciseId,b=catalog.list()[1].id;assert.throws(()=>substituteExercise(x,s,{fromExerciseId:a,toExerciseId:b,catalog,reason:''}),/REASON/);substituteExercise(x,s,{fromExerciseId:a,toExerciseId:b,catalog,reason:'molestia'});assert.equal(x.queue[0].exerciseId,b);});
test('completed execution closes the loop into confirmed progress',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:'c1'});

  startExecution(x);

  recordSet(x,s,{reps:10,rpe:7});
  advanceExecution(x);

  recordSet(x,s,{reps:9,rpe:8});
  advanceExecution(x);

  finishExecution(x,{
    sessionRpe:8,
    comment:'Sesión completada correctamente',
    pain:false,
  });

  let html=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
  });

  assert.match(html,/Sesión completada/);
  assert.match(html,/RPE de sesión 8\/10/);
  assert.match(html,/data-m26-area="progreso"/);
  assert.match(html,/>Ver mi progreso</);
  assert.match(html,/resultados y tu feedback quedaron confirmados/i);

  markExecutionSync(
    x,
    'pending',
    {operationId:'op-session-finish'}
  );

  html=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
  });

  assert.match(html,/pendiente de sincronización/i);
  assert.doesNotMatch(html,/data-m26-area="progreso"/);
  assert.doesNotMatch(html,/>Ver mi progreso</);
});
test('guided execution renders navigation and no inline handlers',()=>{const s=session();const x=createExecution({session:s,clientId:'c1'});startExecution(x);const html=renderGuidedExecution({execution:x,session:s,catalog});assert.match(html,/complete-set/);assert.match(html,/data-session-action="previous"/);assert.doesNotMatch(html,/onclick=/);});
test('command catalog reports exact missing commands',()=>{const result=validateCommandCatalog(M26_REQUIRED_COMMANDS.slice(0,-1));assert.equal(result.ok,false);assert.deepEqual(result.missing,['INTELIGENCIA_APLICAR_A_BORRADOR']);});
test('session remains valid after catalog selection',()=>assert.equal(validateSessionDraft(session(),catalog).ok,true));
