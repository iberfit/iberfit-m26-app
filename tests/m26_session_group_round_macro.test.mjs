import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createExecution,startExecution,recordSet,advanceExecution,currentStep,addExecutionSet,addExecutionGroupRound,addExtraGroupRoundAndAdvance,
} from '../src/m26/workflows/session-execution.js';
import {M26_ACTION_REGISTRY,assertActionAllowed} from '../src/m26/ui/interactive-audit.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const actor={role:'coach',id:'coach-round'};
const grouped={id:'session-group-round',blocks:[{
  id:'group-1',type:'biserie',rounds:2,exerciseIds:['a','b'],prescriptions:{
    a:{reps:'8',restSeconds:30,targetRpe:7,targetRir:3},
    b:{reps:'10',restSeconds:30,targetRpe:7,targetRir:3},
  },
}]};
const single={id:'session-single-set',blocks:[{
  id:'single-1',type:'exercise',exerciseId:'a',sets:2,reps:'8',restSeconds:60,targetRpe:7,targetRir:3,
}]};

test('añadir ronda incrementa todos los miembros del bloque agrupado',()=>{
  const execution=createExecution({session:grouped,clientId:'client-round',executionId:'execution-round'});
  startExecution(execution,{actor});
  addExecutionGroupRound(execution,{actor});
  assert.deepEqual(execution.queue.map((item)=>item.sets),[3,3]);
  const event=execution.events.find((item)=>item.type==='GROUP_ROUND_ADDED');
  assert.equal(event.payload.blockId,'group-1');
  assert.equal(event.payload.totalRounds,3);
});

test('añadir serie individual dentro de un grupo conserva la capacidad histórica sin romper el orden',()=>{
  const execution=createExecution({session:grouped,clientId:'client-round',executionId:'execution-group-single-extra'});
  startExecution(execution,{actor});
  recordSet(execution,grouped,{reps:8,rpe:7,actor});
  advanceExecution(execution,{actor}); // b1
  recordSet(execution,grouped,{reps:10,rpe:7,actor});
  advanceExecution(execution,{actor}); // a2
  recordSet(execution,grouped,{reps:8,rpe:7,actor});
  addExecutionSet(execution,{actor}); // a3 extra, B2 remains before A3
  const before=execution.queue.map((item)=>item.sets);
  assert.deepEqual(before,[3,2]);
  advanceExecution(execution,{actor});
  assert.equal(currentStep(execution,grouped).exerciseId,'b');
  assert.equal(currentStep(execution,grouped).roundNumber,2);
  assert.throws(()=>addExecutionGroupRound(execution,{actor}),/M26_EXECUTION_GROUP_ROUND_ASYMMETRIC/);
});

test('añadir serie individual conserva su comportamiento fuera de grupos',()=>{
  const execution=createExecution({session:single,clientId:'client-round',executionId:'execution-single'});
  startExecution(execution,{actor});
  addExecutionSet(execution,{actor});
  assert.equal(execution.queue[0].sets,3);
  assert.throws(()=>addExecutionGroupRound(execution,{actor}),/M26_EXECUTION_GROUP_ROUND_NOT_GROUPED/);
});

test('la UI usa una acción específica de ronda y la auditoría la limita al Coach',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-ui.js','utf8');
  assert.match(source,/currentQueueItem\?\.groupType/u);
  assert.ok(source.includes('data-session-action="add-set"'));
  assert.ok(source.includes('data-session-action="add-group-round"'));
  assert.deepEqual(M26_ACTION_REGISTRY['add-group-round'],{roles:['coach'],domain:'execution'});
  assert.equal(assertActionAllowed('add-group-round','coach'),true);
  assert.equal(assertActionAllowed('add-group-round','client'),false);
  assert.equal(assertActionAllowed('add-group-round','admin'),false);
  assert.deepEqual(M26_ACTION_REGISTRY['extra-group-round-now'],{roles:['coach'],domain:'execution'});
  assert.equal(assertActionAllowed('extra-group-round-now','coach'),true);
  assert.equal(assertActionAllowed('extra-group-round-now','client'),false);
});

test('la nueva acción estructural conserva traducción EN FR PT',()=>{
  const source='Añadir una ronda al bloque';
  assert.equal(iberfitSurfaceTranslate(source,{language:'es'}),source);
  for(const language of ['en','fr','pt'])assert.notEqual(iberfitSurfaceTranslate(source,{language}),source);
  const fast='+ 1 ronda y seguir';
  for(const language of ['en','fr','pt'])assert.notEqual(iberfitSurfaceTranslate(fast,{language}),fast);
});


test('al terminar la última estación de la última ronda el Coach puede añadir una ronda y entrar directamente en ella',()=>{
  const execution=createExecution({session:grouped,clientId:'client-round',executionId:'execution-fast-round'});
  startExecution(execution,{actor});
  for(let step=0;step<3;step+=1){
    recordSet(execution,grouped,{reps:8,rpe:7,actor});
    advanceExecution(execution,{actor});
  }
  assert.equal(currentStep(execution,grouped).exerciseId,'b');
  assert.equal(currentStep(execution,grouped).roundNumber,2);
  recordSet(execution,grouped,{reps:10,rpe:7,actor});
  addExtraGroupRoundAndAdvance(execution,grouped,{actor});
  assert.deepEqual(execution.queue.map((item)=>item.sets),[3,3]);
  assert.equal(execution.index,0);
  assert.equal(execution.setIndex,2);
  assert.equal(currentStep(execution,grouped).exerciseId,'a');
  assert.equal(currentStep(execution,grouped).roundNumber,3);
  const event=execution.events.find((item)=>item.type==='EXTRA_GROUP_ROUND_STARTED');
  assert.equal(event.payload.previousTotalRounds,2);
  assert.equal(event.payload.totalRounds,3);
});

test('una estructura agrupada asimétrica histórica no se modifica silenciosamente',()=>{
  const execution=createExecution({session:grouped,clientId:'client-round',executionId:'execution-asymmetric'});
  startExecution(execution,{actor});
  execution.queue[1].sets=3;
  assert.throws(()=>addExecutionGroupRound(execution,{actor}),/M26_EXECUTION_GROUP_ROUND_ASYMMETRIC/);
});

test('el controlador importa las dos acciones de ronda que despacha',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(source,/addExecutionGroupRound,addExtraGroupRoundAndAdvance/u);
  assert.match(source,/case 'add-group-round'/u);
  assert.match(source,/case 'extra-group-round-now'/u);
});