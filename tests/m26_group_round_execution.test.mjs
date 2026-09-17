import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addExecutionExercise,
  addExtraSetAndAdvance,
  advanceExecution,
  createExecution,
  currentStep,
  recordSet,
  retreatExecution,
  skipExecutionExercise,
  startExecution,
} from '../src/m26/workflows/session-execution.js';

const exercises=new Map([
  ['a',{id:'a',name_es:'Ejercicio A',pattern:'squat'}],
  ['b',{id:'b',name_es:'Ejercicio B',pattern:'push'}],
  ['c',{id:'c',name_es:'Ejercicio C',pattern:'pull'}],
  ['x',{id:'x',name_es:'Ejercicio extra',pattern:'carry'}],
]);
const catalog={
  get(id){return exercises.get(id)||null;},
  has(id){return exercises.has(id);},
  search(){return [...exercises.values()];},
};
function prescription(){return {reps:'10',restSeconds:60,targetRpe:7,targetRir:3};}
function groupSession({type='biserie',rounds=3,exerciseIds=['a','b']}={}){
  return {
    id:`session-${type}`,
    clientId:'client-group-rounds',
    title:'Trabajo agrupado',
    status:'published',
    blocks:[{
      id:'group-1',
      type,
      rounds,
      exerciseIds,
      prescriptions:Object.fromEntries(exerciseIds.map((id)=>[id,prescription()])),
    }],
  };
}
function coach(){return {role:'coach',userId:'coach-1'};}
function completeCurrent(execution,session){
  recordSet(execution,session,{reps:10,rpe:7,rir:3,actor:coach()});
  advanceExecution(execution,{actor:coach()});
}
function identity(execution,session){
  const step=currentStep(execution,session);
  return step?`${step.exerciseId}:${step.setNumber}`:'done';
}

test('biserie executes round-robin instead of exhausting one exercise first',()=>{
  const session=groupSession({type:'biserie',rounds:3});
  const execution=createExecution({session,clientId:session.clientId,executionId:'exec-biserie'});
  startExecution(execution,{actor:coach()});
  const seen=[];
  while(execution.status==='active'){
    seen.push(identity(execution,session));
    completeCurrent(execution,session);
  }
  assert.deepEqual(seen,['a:1','b:1','a:2','b:2','a:3','b:3']);
  assert.equal(execution.status,'awaiting_feedback');
});

test('triserie and circuito preserve exercise order inside every round',()=>{
  for(const type of ['triserie','circuito']){
    const session=groupSession({type,rounds:2,exerciseIds:['a','b','c']});
    const execution=createExecution({session,clientId:session.clientId,executionId:`exec-${type}`});
    startExecution(execution,{actor:coach()});
    const seen=[];
    while(execution.status==='active'){
      seen.push(identity(execution,session));
      completeCurrent(execution,session);
    }
    assert.deepEqual(seen,['a:1','b:1','c:1','a:2','b:2','c:2'],type);
  }
});

test('skipping one grouped exercise skips its remaining rounds without blocking the rest of the group',()=>{
  const session=groupSession({rounds:3});
  const execution=createExecution({session,clientId:session.clientId,executionId:'exec-skip-group'});
  startExecution(execution,{actor:coach()});
  skipExecutionExercise(execution,session,{reason:'Molestia',actor:coach()});
  assert.equal(identity(execution,session),'b:1');
  completeCurrent(execution,session);
  assert.equal(identity(execution,session),'b:2');
  completeCurrent(execution,session);
  assert.equal(identity(execution,session),'b:3');
  completeCurrent(execution,session);
  assert.equal(execution.status,'awaiting_feedback');
  assert.deepEqual(Object.values(execution.skippedSets).map((entry)=>entry.setNumber),[1,2,3]);
});

test('previous and forward review follow the real grouped order across exercise boundaries',()=>{
  const session=groupSession({rounds:2});
  const execution=createExecution({session,clientId:session.clientId,executionId:'exec-rewind-group'});
  startExecution(execution,{actor:coach()});
  completeCurrent(execution,session);
  assert.equal(identity(execution,session),'b:1');
  completeCurrent(execution,session);
  assert.equal(identity(execution,session),'a:2');
  retreatExecution(execution,{actor:coach()});
  assert.equal(identity(execution,session),'b:1');
  retreatExecution(execution,{actor:coach()});
  assert.equal(identity(execution,session),'a:1');
  advanceExecution(execution,{actor:coach()});
  assert.equal(identity(execution,session),'b:1');
  advanceExecution(execution,{actor:coach()});
  assert.equal(identity(execution,session),'a:2');
});

test('extra set fast path remains direct even inside a group',()=>{
  const session=groupSession({rounds:1});
  const execution=createExecution({session,clientId:session.clientId,executionId:'exec-extra-group'});
  startExecution(execution,{actor:coach()});
  recordSet(execution,session,{reps:10,rpe:7,rir:3,actor:coach()});
  addExtraSetAndAdvance(execution,session,{actor:coach()});
  assert.equal(identity(execution,session),'a:2');
  assert.equal(execution.queue[0].sets,2);
});

test('live exercise inserted as next during a group waits until the group boundary',()=>{
  const session=groupSession({rounds:2});
  const execution=createExecution({session,clientId:session.clientId,executionId:'exec-live-add-group'});
  startExecution(execution,{actor:coach()});
  addExecutionExercise(execution,{
    exerciseId:'x',catalog,sets:1,reps:'20 m',restSeconds:45,tempo:'controlado',targetRpe:7,targetRir:3,
    position:'next',actor:coach(),
  });
  assert.deepEqual(execution.queue.map((item)=>item.exerciseId),['a','b','x']);
  completeCurrent(execution,session);
  assert.equal(identity(execution,session),'b:1');
});
