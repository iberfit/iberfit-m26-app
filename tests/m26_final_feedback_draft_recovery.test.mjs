import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getFinalFeedbackDraft,
  updateFinalFeedbackDraft,
  finishExecution,
  buildExecutionCommand,
  buildProgressExecutionCommand,
} from '../src/m26/workflows/session-execution.js';

const executionId='71000000-0000-4000-8000-000000000001';
const clientId='71000000-0000-4000-8000-000000000002';

function awaitingFeedback(){
  return {
    id:executionId,
    sessionId:'session-final-feedback',
    clientId,
    status:'awaiting_feedback',
    revision:7,
    syncStatus:'clean',
    pendingOperationIds:[],
    lastSyncError:null,
    queue:[],
    index:0,
    setIndex:0,
    startedAt:'2026-09-05T10:00:00.000Z',
    activeSince:null,
    accumulatedActiveMs:1800000,
    completedAt:null,
    restUntil:null,
    events:[],
    results:{},
    feedback:null,
  };
}

test('feedback final conserva valores crudos y booleano de dolor tras recuperación local',()=>{
  const execution=awaitingFeedback();
  updateFinalFeedbackDraft(execution,{
    sessionRpe:'8',
    comment:'Sesión exigente pero controlada',
    pain:true,
    painNotes:'Molestia leve en rodilla izquierda',
  });
  const recovered=structuredClone(execution);
  assert.deepEqual(getFinalFeedbackDraft(recovered)?.values,{
    sessionRpe:'8',
    comment:'Sesión exigente pero controlada',
    pain:true,
    painNotes:'Molestia leve en rodilla izquierda',
  });
});

test('borrador de feedback sólo existe durante awaiting_feedback',()=>{
  const execution=awaitingFeedback();
  execution.status='active';
  assert.equal(updateFinalFeedbackDraft(execution,{sessionRpe:'9'}),null);
  assert.equal(execution.finalFeedbackDraft,undefined);
  execution.status='completed';
  execution.finalFeedbackDraft={executionId,values:{sessionRpe:'9'}};
  assert.equal(getFinalFeedbackDraft(execution),null);
});

test('borrador de feedback nunca sale en GUARDAR_PROGRESO',()=>{
  const execution=awaitingFeedback();
  updateFinalFeedbackDraft(execution,{sessionRpe:'7',comment:'Bien',pain:false,painNotes:''});
  const command=buildProgressExecutionCommand(execution,7);
  assert.equal('finalFeedbackDraft' in command.payload.progressSnapshot,false);
  assert.ok(execution.finalFeedbackDraft);
});

test('finalizar promueve el feedback validado y elimina el borrador local',()=>{
  const execution=awaitingFeedback();
  updateFinalFeedbackDraft(execution,{sessionRpe:'9',comment:'Muy buena sesión',pain:true,painNotes:'Tensión lumbar leve'});
  finishExecution(execution,{sessionRpe:'9',comment:'Muy buena sesión',pain:true,painNotes:'Tensión lumbar leve'});
  assert.equal(execution.status,'completed');
  assert.deepEqual(execution.feedback,{sessionRpe:9,comment:'Muy buena sesión',pain:true,painNotes:'Tensión lumbar leve'});
  assert.equal(execution.finalFeedbackDraft,undefined);
  const command=buildExecutionCommand(execution,7);
  assert.equal(command.operationId,executionId);
  assert.equal('finalFeedbackDraft' in command.payload.patch,false);
});

test('controlador captura, persiste e hidrata RPE, comentario, dolor y notas',()=>{
  const source=fs.readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.ok(source.includes('getFinalFeedbackDraft,updateFinalFeedbackDraft'));
  assert.ok(source.includes('function feedbackValues(root)'));
  assert.ok(source.includes("pain:Boolean(root.querySelector?.('[data-session-feedback-pain]')?.checked)"));
  assert.ok(source.includes('function hydrateFinalFeedbackDraft(context=getContext())'));
  assert.ok(source.includes('pain.checked=Boolean(values.pain)'));
  assert.ok(source.includes('updateFinalFeedbackDraft(context.execution,feedbackValues(root))'));
  assert.ok(source.includes('if(saved)queueExecutionDraftPersist(context)'));
  assert.ok(source.includes('render=()=>{baseRender?.();hydrateActiveSetDraft(getContext());hydrateFinalFeedbackDraft(getContext());};'));
  assert.ok(source.includes('createLiveTelemetryController({scope:globalThis,onUpdate:()=>render?.(),onDiagnostic:()=>{},telemetryOutbox,onOutboxStaged:'));
});