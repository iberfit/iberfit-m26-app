import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceExecution,
  createExecution,
  currentStep,
  executionResultForStep,
  previousSetDraftValues,
  recordSet,
  skipExecutionExercise,
  skipExecutionSet,
  startExecution,
} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const exercise={id:'exercise-duplicate',name_es:'Sentadilla duplicada',pattern:'squat',cues:[]};
const catalog={
  get(id){return id===exercise.id?exercise:null;},
  search(){return [exercise];},
};
function makeSession({sets=2}={}){
  return {
    id:'session-duplicate-occurrence',clientId:'client-1',title:'Sesión duplicada',durationMinutes:45,status:'published',
    blocks:[
      {type:'exercise',id:'block-first',exerciseId:exercise.id,sets,reps:'10',restSeconds:60,tempo:'3-1-1',targetRpe:8,targetRir:2},
      {type:'exercise',id:'block-second',exerciseId:exercise.id,sets,reps:'8',restSeconds:60,tempo:'2-1-1',targetRpe:8,targetRir:2},
    ],
  };
}
function makeExecution(options){
  const session=makeSession(options);
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-duplicate'});
  startExecution(execution);
  return {session,execution};
}
function render(session,execution){return renderGuidedExecution({execution,session,catalog,mediaMap:null,role:'client'});}

test('duplicated exercise occurrences keep independent recorded sets and current history',()=>{
  const {session,execution}=makeExecution();
  recordSet(execution,session,{reps:10,load:'80 kg',rpe:8,rir:2,notes:'primera ocurrencia'});
  advanceExecution(execution);
  recordSet(execution,session,{reps:9,load:'82 kg',rpe:8.5,rir:1});
  advanceExecution(execution);

  assert.equal(currentStep(execution,session).blockId,'block-second');
  const before=render(session,execution);
  assert.doesNotMatch(before,/data-session-current-exercise-history/);
  assert.doesNotMatch(before,/80 kg/);
  assert.doesNotMatch(before,/82 kg/);

  assert.doesNotThrow(()=>recordSet(execution,session,{reps:8,load:'70 kg',rpe:7.5,rir:3,notes:'segunda ocurrencia'}));
  const keys=Object.keys(execution.results);
  assert.equal(keys.length,3);
  assert.ok(keys.includes('block-first:'+exercise.id+':1'));
  assert.ok(keys.includes('block-second:'+exercise.id+':1'));
  assert.equal(execution.results['block-second:'+exercise.id+':1'].exerciseId,exercise.id);
  assert.equal(Object.hasOwn(execution.results['block-second:'+exercise.id+':1'],'blockId'),false);

  const html=render(session,execution);
  const historyStart=html.indexOf('data-session-current-exercise-history');
  const historyEnd=html.indexOf('</section>',historyStart);
  const history=html.slice(historyStart,historyEnd);
  assert.ok(historyStart>=0);
  assert.match(history,/70 kg/);
  assert.doesNotMatch(history,/80 kg|82 kg/);
  assert.doesNotMatch(history,/primera ocurrencia|segunda ocurrencia/);
  assert.match(html,/segunda ocurrencia/);

  advanceExecution(execution);
  assert.deepEqual(previousSetDraftValues(execution),{reps:'8',seconds:'',load:'70 kg',rpe:'7.5',rir:'3'});
  recordSet(execution,session,{reps:7,load:'72 kg',rpe:8,rir:2});
  assert.equal(Object.keys(execution.results).length,4);
});

test('a skipped set in the first occurrence does not resolve the duplicated occurrence',()=>{
  const {session,execution}=makeExecution();
  skipExecutionSet(execution,session,{reason:'Molestia puntual'});
  skipExecutionExercise(execution,session,{reason:'Cerrar primer bloque'});
  assert.equal(currentStep(execution,session).blockId,'block-second');
  assert.throws(()=>advanceExecution(execution),/M26_EXECUTION_SET_NOT_RECORDED/);
  assert.doesNotThrow(()=>recordSet(execution,session,{reps:8,load:'65 kg',rpe:7,rir:3}));
  assert.doesNotThrow(()=>advanceExecution(execution));
});

test('legacy result keys are attributed only to the earliest compatible occurrence',()=>{
  const {session,execution}=makeExecution({sets:1});
  execution.results[exercise.id+':1']={exerciseId:exercise.id,setNumber:1,reps:10,seconds:null,load:'75 kg',rpe:8,rir:2,notes:'',completedAt:new Date().toISOString()};

  const first=currentStep(execution,session);
  assert.equal(executionResultForStep(execution,first)?.load,'75 kg');
  assert.doesNotThrow(()=>advanceExecution(execution));

  const second=currentStep(execution,session);
  assert.equal(second.blockId,'block-second');
  assert.equal(executionResultForStep(execution,second),null);
  assert.throws(()=>advanceExecution(execution),/M26_EXECUTION_SET_NOT_RECORDED/);
  assert.doesNotThrow(()=>recordSet(execution,session,{reps:8,load:'68 kg',rpe:7,rir:3}));
  assert.equal(Object.keys(execution.results).length,2);
  assert.equal(render(session,execution).includes('75 kg'),false);
});


test('unambiguous exercise keeps the legacy result and skip storage contract',()=>{
  const session=makeSession();
  session.blocks=[session.blocks[0]];
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-legacy-contract'});
  startExecution(execution);
  recordSet(execution,session,{reps:10,load:'60 kg',rpe:7,rir:3});
  assert.deepEqual(Object.keys(execution.results),[exercise.id+':1']);
  assert.equal(Object.hasOwn(execution.results[exercise.id+':1'],'blockId'),false);
  advanceExecution(execution);
  skipExecutionSet(execution,session,{reason:'Ajuste puntual'});
  assert.ok(Object.hasOwn(execution.skippedSets,exercise.id+':2'));
  assert.equal(Object.hasOwn(execution.skippedSets[exercise.id+':2'],'blockId'),false);
});
