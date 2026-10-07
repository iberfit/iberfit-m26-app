import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createExecution,startExecution,recordSet,advanceExecution,finishExecution,
} from '../src/m26/workflows/session-execution.js';

const actor={role:'coach',id:'coach-closeout'};
const session={id:'session-closeout',clientId:'client-closeout',blocks:[{
  id:'closeout-set',type:'exercise',exerciseId:'exercise-a',sets:1,reps:'10',restSeconds:0,targetRpe:7,targetRir:3,
}]};

function awaitingFeedback(id){
  const execution=createExecution({session,clientId:'client-closeout',executionId:id});
  startExecution(execution,{actor});
  recordSet(execution,session,{reps:10,rpe:7,actor});
  advanceExecution(execution,{actor});
  assert.equal(execution.status,'awaiting_feedback');
  return execution;
}

test('si dolor queda desmarcado, el cierre no conserva un detalle de dolor huérfano',()=>{
  const execution=awaitingFeedback('closeout-no-pain');
  finishExecution(execution,{
    sessionRpe:7,
    comment:'Sesión completada según tolerancia.',
    pain:false,
    painNotes:'Texto previo que quedó escrito antes de desmarcar dolor.',
  },{actor});
  assert.equal(execution.status,'completed');
  assert.equal(execution.feedback.pain,false);
  assert.equal(execution.feedback.painNotes,'');
});

test('si hay dolor, conserva el detalle clínicamente relevante',()=>{
  const execution=awaitingFeedback('closeout-with-pain');
  finishExecution(execution,{
    sessionRpe:8,
    comment:'Se ajustó la sesión.',
    pain:true,
    painNotes:'Molestia anterior de rodilla al final del rango.',
  },{actor});
  assert.equal(execution.feedback.pain,true);
  assert.equal(execution.feedback.painNotes,'Molestia anterior de rodilla al final del rango.');
});

test('dolor marcado continúa exigiendo un detalle antes de cerrar',()=>{
  const execution=awaitingFeedback('closeout-pain-required');
  assert.throws(()=>finishExecution(execution,{
    sessionRpe:8,
    comment:'Sesión completada con ajuste.',
    pain:true,
    painNotes:'   ',
  },{actor}),/M26_EXECUTION_PAIN_NOTES_REQUIRED/);
  assert.equal(execution.status,'awaiting_feedback');
});