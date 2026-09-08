import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution,recordSet,advanceExecution,skipExecutionSet,substituteExercise} from '../src/m26/workflows/session-execution.js';

const data=JSON.parse(fs.readFileSync(new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url)));
const catalog=createExerciseCatalog(data);
function setup(){
  const session=createSessionDraft({clientId:'c-substitution'});
  const from=catalog.list()[0].id;
  const to=catalog.list()[1].id;
  addCatalogExercise(session,from,catalog,{sets:2,reps:'10'});
  const execution=createExecution({session,clientId:'c-substitution',executionId:'exec-substitution'});
  return {session,execution,from,to};
}

test('substitution remains allowed before the occurrence has progress',()=>{
  const {session,execution,from,to}=setup();
  substituteExercise(execution,session,{fromExerciseId:from,toExerciseId:to,catalog,reason:'Alternativa previa'});
  assert.equal(execution.queue[0].exerciseId,to);
});

test('substitution is blocked after an earlier set was recorded',()=>{
  const {session,execution,from,to}=setup();
  startExecution(execution);
  recordSet(execution,session,{reps:10,rpe:7});
  advanceExecution(execution);
  assert.equal(execution.setIndex,1);
  assert.throws(()=>substituteExercise(execution,session,{fromExerciseId:from,toExerciseId:to,catalog,reason:'Cambio tardío'}),/M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED/);
  assert.equal(execution.queue[0].exerciseId,from);
  assert.ok(execution.results[from+':1']);
});

test('substitution is blocked after an earlier set was explicitly skipped',()=>{
  const {session,execution,from,to}=setup();
  startExecution(execution);
  skipExecutionSet(execution,session,{reason:'Molestia puntual'});
  assert.equal(execution.setIndex,1);
  assert.throws(()=>substituteExercise(execution,session,{fromExerciseId:from,toExerciseId:to,catalog,reason:'Cambio tardío'}),/M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED/);
  assert.equal(execution.queue[0].exerciseId,from);
  assert.ok(execution.skippedSets[from+':1']);
});
