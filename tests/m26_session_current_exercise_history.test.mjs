import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceExecution,
  createExecution,
  recordSet,
  startExecution,
} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const exercises=[
  {id:'exercise-a',name_es:'Sentadilla de prueba',pattern:'squat',cues:[]},
  {id:'exercise-b',name_es:'Remo de prueba',pattern:'pull',cues:[]},
];
const catalog={
  get(id){return exercises.find((item)=>item.id===id)||null;},
  search(){return exercises;},
};

function makeSession(){
  return {
    id:'session-current-history',
    clientId:'client-1',
    title:'Sesión de prueba',
    durationMinutes:45,
    status:'published',
    blocks:[
      {
        type:'exercise',
        id:'block-a',
        exerciseId:'exercise-a',
        sets:3,
        reps:'8–10',
        restSeconds:60,
        tempo:'3-1-1',
        targetRpe:8,
        targetRir:2,
      },
      {
        type:'exercise',
        id:'block-b',
        exerciseId:'exercise-b',
        sets:1,
        reps:'10',
        restSeconds:60,
        tempo:'controlado',
        targetRpe:7,
        targetRir:3,
      },
    ],
  };
}

function makeExecution(){
  const session=makeSession();
  const execution=createExecution({
    session,
    clientId:session.clientId,
    executionId:'execution-current-history',
  });
  startExecution(execution);
  return {session,execution};
}

function render(session,execution){
  return renderGuidedExecution({
    execution,
    session,
    catalog,
    mediaMap:null,
    role:'client',
  });
}

function recordFirst(execution,session){
  recordSet(execution,session,{
    reps:10,
    load:'80 kg',
    rpe:8,
    notes:'Nota privada de la primera serie',
  });
}

test('current exercise history is absent before the first recorded set',()=>{
  const {session,execution}=makeExecution();
  const html=render(session,execution);
  assert.doesNotMatch(html,/data-session-current-exercise-history/);
});

test('current exercise history renders the recorded set and omits absent optional RIR',()=>{
  const {session,execution}=makeExecution();
  recordFirst(execution,session);
  execution.restUntil=new Date(Date.now()+60_000).toISOString();

  const html=render(session,execution);
  assert.match(html,/data-session-current-exercise-history/);
  assert.match(html,/aria-label="Series registradas hoy en este ejercicio"/);
  assert.match(html,/Hoy en este ejercicio/);
  assert.match(html,/Serie 1/);
  assert.match(html,/10 reps/);
  assert.match(html,/80 kg/);
  assert.match(html,/RPE 8/);
  assert.match(html,/<h3>10 reps · 80 kg · RPE 8<\/h3>/);
  assert.doesNotMatch(html,/RIR null/);
  assert.doesNotMatch(html,/RIR undefined/);
});

test('current exercise history lists today sets in numeric order without exposing notes or adding actions',()=>{
  const {session,execution}=makeExecution();
  recordFirst(execution,session);
  advanceExecution(execution);
  recordSet(execution,session,{
    reps:9,
    load:'82,5 kg',
    rpe:8.5,
    rir:1,
    notes:'Nota privada de la segunda serie',
  });
  advanceExecution(execution);

  const html=render(session,execution);
  const historyStart=html.indexOf('data-session-current-exercise-history');
  const historyEnd=html.indexOf('</section>',historyStart);
  assert.ok(historyStart>=0&&historyEnd>historyStart);
  const history=html.slice(historyStart,historyEnd);

  assert.ok(history.indexOf('Serie 1')<history.indexOf('Serie 2'));
  assert.match(history,/10 reps/);
  assert.match(history,/80 kg/);
  assert.match(history,/RPE 8/);
  assert.match(history,/9 reps/);
  assert.match(history,/82,5 kg/);
  assert.match(history,/RPE 8.5/);
  assert.match(history,/RIR 1/);
  assert.doesNotMatch(history,/Nota privada/);
  assert.doesNotMatch(history,/<button\b/);
  assert.doesNotMatch(html,/Nota privada de la primera serie/);
  assert.doesNotMatch(html,/Nota privada de la segunda serie/);
});

test('current exercise history is scoped to the active exercise and does not carry over',()=>{
  const {session,execution}=makeExecution();
  recordFirst(execution,session);
  advanceExecution(execution);
  recordSet(execution,session,{reps:9,load:'82,5 kg',rpe:8.5,rir:1});
  advanceExecution(execution);
  recordSet(execution,session,{reps:8,load:'85 kg',rpe:9,rir:1});
  advanceExecution(execution);

  assert.equal(execution.queue[execution.index].exerciseId,'exercise-b');
  const html=render(session,execution);
  assert.match(html,/Remo de prueba/);
  assert.doesNotMatch(html,/data-session-current-exercise-history/);
  assert.doesNotMatch(html,/80 kg/);
  assert.doesNotMatch(html,/82,5 kg/);
  assert.doesNotMatch(html,/85 kg/);
});