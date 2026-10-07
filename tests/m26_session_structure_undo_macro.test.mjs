import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createExecution,startExecution,recordSet,advanceExecution,addExecutionSet,addExecutionGroupRound,addExtraSetAndAdvance,addExecutionExercise,
  executionStructureUndoState,undoLastExecutionStructureChange,
} from '../src/m26/workflows/session-execution.js';
import {sessionAdjustmentCounts} from '../src/m26/workflows/session-ui.js';
import {M26_ACTION_REGISTRY,assertActionAllowed} from '../src/m26/ui/interactive-audit.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const actor={role:'coach',id:'coach-undo'};

const catalog=new Set(['a','b','c']);
const single={id:'session-undo-single',blocks:[{
  id:'single-1',type:'exercise',exerciseId:'a',sets:2,reps:'8',restSeconds:60,targetRpe:7,targetRir:3,
}]};
const grouped={id:'session-undo-group',blocks:[{
  id:'group-1',type:'biserie',rounds:2,exerciseIds:['a','b'],prescriptions:{
    a:{reps:'8',restSeconds:30,targetRpe:7,targetRir:3},
    b:{reps:'10',restSeconds:30,targetRpe:7,targetRir:3},
  },
}]};

function active(session,id){
  const execution=createExecution({session,clientId:'client-undo',executionId:id});
  startExecution(execution,{actor});
  return execution;
}

test('una serie añadida por error puede deshacerse inmediatamente sin tocar series planificadas',()=>{
  const execution=active(single,'execution-undo-set');
  assert.equal(executionStructureUndoState(execution),null);
  addExecutionSet(execution,{actor});
  assert.equal(execution.queue[0].sets,3);
  assert.deepEqual(executionStructureUndoState(execution),{kind:'set',label:'Deshacer serie añadida'});
  undoLastExecutionStructureChange(execution,{actor});
  assert.equal(execution.queue[0].sets,2);
  assert.equal(execution.events.at(-1).type,'SET_ADD_UNDONE');
  assert.equal(executionStructureUndoState(execution),null);
});

test('un ejercicio añadido durante la sesión puede deshacerse antes de registrar trabajo',()=>{
  const execution=active(single,'execution-undo-exercise');
  addExecutionExercise(execution,{exerciseId:'c',catalog,sets:3,reps:'12',restSeconds:45,tempo:'controlado',targetRpe:7,targetRir:3,position:'next',actor});
  assert.deepEqual(execution.queue.map((item)=>item.exerciseId),['a','c']);
  assert.deepEqual(executionStructureUndoState(execution),{kind:'exercise',label:'Deshacer ejercicio añadido'});
  undoLastExecutionStructureChange(execution,{actor});
  assert.deepEqual(execution.queue.map((item)=>item.exerciseId),['a']);
  assert.equal(execution.events.at(-1).type,'EXERCISE_ADD_UNDONE');
  assert.equal(executionStructureUndoState(execution),null);
});

test('el ejercicio live-added deja de ser reversible en cuanto se registra trabajo posterior',()=>{
  const execution=active(single,'execution-undo-exercise-expired');
  addExecutionExercise(execution,{exerciseId:'c',catalog,sets:2,reps:'10',restSeconds:60,tempo:'controlado',targetRpe:7,targetRir:3,position:'next',actor});
  recordSet(execution,single,{reps:8,rpe:7,actor});
  assert.equal(executionStructureUndoState(execution),null);
  assert.throws(()=>undoLastExecutionStructureChange(execution,{actor}),/M26_EXECUTION_STRUCTURE_UNDO_UNAVAILABLE/);
  assert.deepEqual(execution.queue.map((item)=>item.exerciseId),['a','c']);
});

test('una ronda añadida simétricamente puede deshacerse sin romper el grupo',()=>{
  const execution=active(grouped,'execution-undo-round');
  addExecutionGroupRound(execution,{actor});
  assert.deepEqual(execution.queue.map((item)=>item.sets),[3,3]);
  assert.deepEqual(executionStructureUndoState(execution),{kind:'round',label:'Deshacer ronda añadida'});
  undoLastExecutionStructureChange(execution,{actor});
  assert.deepEqual(execution.queue.map((item)=>item.sets),[2,2]);
  assert.equal(execution.events.at(-1).type,'GROUP_ROUND_ADD_UNDONE');
});

test('el undo desaparece después de continuar entrenando y no reescribe historial',()=>{
  const execution=active(single,'execution-undo-expired');
  addExecutionSet(execution,{actor});
  recordSet(execution,single,{reps:8,rpe:7,actor});
  assert.equal(executionStructureUndoState(execution),null);
  assert.throws(()=>undoLastExecutionStructureChange(execution,{actor}),/M26_EXECUTION_STRUCTURE_UNDO_UNAVAILABLE/);
  assert.equal(execution.queue[0].sets,3);
});

test('la acción rápida +1 serie y seguir no ofrece un undo ambiguo después de mover la posición',()=>{
  const execution=active(single,'execution-undo-fast-extra');
  recordSet(execution,single,{reps:8,rpe:7,actor});
  advanceExecution(execution,{actor});
  recordSet(execution,single,{reps:8,rpe:7,actor});
  addExtraSetAndAdvance(execution,single,{actor});
  assert.equal(execution.queue[0].sets,3);
  assert.equal(executionStructureUndoState(execution),null);
});

test('los ajustes deshechos no inflan el resumen final de desviaciones',()=>{
  const execution=active(single,'execution-undo-counts');
  addExecutionSet(execution,{actor});
  undoLastExecutionStructureChange(execution,{actor});
  assert.equal(sessionAdjustmentCounts(execution).extraSets,0);
  const groupedExecution=active(grouped,'execution-undo-round-counts');
  addExecutionGroupRound(groupedExecution,{actor});
  undoLastExecutionStructureChange(groupedExecution,{actor});
  assert.equal(sessionAdjustmentCounts(groupedExecution).extraRounds,0);
  const exerciseExecution=active(single,'execution-undo-exercise-counts');
  addExecutionExercise(exerciseExecution,{exerciseId:'c',catalog,sets:2,reps:'10',restSeconds:60,tempo:'controlado',targetRpe:7,targetRir:3,position:'next',actor});
  undoLastExecutionStructureChange(exerciseExecution,{actor});
  assert.equal(sessionAdjustmentCounts(exerciseExecution).addedExercises,0);
});

test('undo estructural está expuesto solo al Coach y mantiene traducciones',()=>{
  assert.deepEqual(M26_ACTION_REGISTRY['undo-structure-add'],{roles:['coach'],domain:'execution'});
  assert.equal(assertActionAllowed('undo-structure-add','coach'),true);
  assert.equal(assertActionAllowed('undo-structure-add','client'),false);
  assert.equal(assertActionAllowed('undo-structure-add','admin'),false);
  for(const source of ['Deshacer serie añadida','Deshacer ronda añadida','Deshacer ejercicio añadido']){
    for(const language of ['en','fr','pt'])assert.notEqual(iberfitSurfaceTranslate(source,{language}),source);
  }
});

test('UI y controller conectan la reversión sin añadir confirmaciones modales',()=>{
  const ui=fs.readFileSync('src/m26/workflows/session-ui.js','utf8');
  const controller=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.ok(ui.includes('data-session-action="undo-structure-add"'));
  assert.match(ui,/executionStructureUndoState\(execution\)/u);
  assert.match(controller,/undoLastExecutionStructureChange/u);
  assert.match(controller,/case 'undo-structure-add'/u);
});