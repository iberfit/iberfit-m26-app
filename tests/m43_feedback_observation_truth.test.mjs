import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createExecution,startExecution,recordSet,advanceExecution,finishExecution,
} from '../src/m26/workflows/session-execution.js';

const session={
  id:'m43-feedback-session',clientId:'m43-feedback-client',
  blocks:[{id:'strength-block',type:'exercise',exerciseId:'m43-strength',name:'Sentadilla',
    sets:1,reps:'8',restSeconds:0,targetRpe:7,targetRir:2}],
};

function pendingFeedback(){
  const execution=createExecution({session,clientId:session.clientId,executionId:'m43-feedback-exec'});
  startExecution(execution);
  recordSet(execution,session,{reps:8,load:'20 kg',rpe:7,rir:2});
  advanceExecution(execution);
  assert.equal(execution.status,'awaiting_feedback');
  return execution;
}

test('M43: legacy textual false must not fabricate a pain report',()=>{
  for(const off of [false,0,'0','false','off','no',null,'']){
    const execution=pendingFeedback();
    finishExecution(execution,{sessionRpe:'7',comment:'Sin molestias en la sesión',pain:off});
    assert.equal(execution.feedback.pain,false,JSON.stringify(off));
    assert.equal(execution.feedback.painNotes,'');
  }
});

test('M43: positive pain requires notes and retains the observed report',()=>{
  for(const yes of [true,1,'1','true','on','yes','si','sí']){
    const execution=pendingFeedback();
    assert.throws(()=>finishExecution(execution,{sessionRpe:7,comment:'Completado',pain:yes}),
      /M26_EXECUTION_PAIN_NOTES_REQUIRED/);
    assert.equal(execution.status,'awaiting_feedback');
    finishExecution(execution,{sessionRpe:7,comment:'Completado',pain:yes,painNotes:'Molestia en rodilla'});
    assert.equal(execution.feedback.pain,true);
    assert.equal(execution.feedback.painNotes,'Molestia en rodilla');
  }
});

test('M43: ambiguous pain and invalid final RPE fail before mutating completed session',()=>{
  for(const value of ['maybe','UNKNOWN',{},[]]){
    const execution=pendingFeedback();
    const events=execution.events.length;
    assert.throws(()=>finishExecution(execution,{sessionRpe:7,comment:'Completado',pain:value}),
      /M43_EXECUTION_PAIN_VALUE_INVALID/);
    assert.equal(execution.status,'awaiting_feedback');
    assert.equal(execution.events.length,events);
  }
  for(const value of ['NaN','Infinity','inválido']){
    const execution=pendingFeedback();
    assert.throws(()=>finishExecution(execution,{sessionRpe:value,comment:'Completado',pain:false}),
      /M26_EXECUTION_SESSION_RPE_REQUIRED/);
    assert.equal(execution.status,'awaiting_feedback');
    assert.equal(execution.feedback,null);
  }
});
