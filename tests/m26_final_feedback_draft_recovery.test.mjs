import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  addExecutionSet,
  advanceExecution,
  correctSet,
  getFinalFeedbackDraft,
  retreatExecution,
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

test('feedback final sobrevive a revisar la última serie y reaparece al volver al cierre',()=>{
  const execution=awaitingFeedback();
  execution.queue=[{
    blockId:'block-final',
    exerciseId:'exercise-final',
    sets:1,
    prescription:{restSeconds:60,targetRpe:7,targetRir:3},
  }];
  execution.index=1;
  execution.results['exercise-final:1']={
    exerciseId:'exercise-final',
    setNumber:1,
    reps:10,
    seconds:null,
    load:'20 kg',
    rpe:7,
    rir:3,
    notes:'',
    completedAt:'2026-09-05T10:25:00.000Z',
  };
  const values={
    sessionRpe:'8',
    comment:'Feedback ya escrito',
    pain:true,
    painNotes:'Molestia leve controlada',
  };
  updateFinalFeedbackDraft(execution,values);

  retreatExecution(execution);
  assert.equal(execution.status,'active');
  assert.equal(getFinalFeedbackDraft(execution),null);
  assert.deepEqual(execution.finalFeedbackDraft?.values,values);

  advanceExecution(execution);
  assert.equal(execution.status,'awaiting_feedback');
  const recovered=getFinalFeedbackDraft(execution);
  assert.deepEqual(recovered?.values,values);
  assert.equal(recovered?.needsReview,undefined);
});

test('corregir trabajo tras escribir feedback conserva valores y exige revisión al volver al cierre',()=>{
  const execution=awaitingFeedback();
  execution.queue=[{
    blockId:'block-final',
    exerciseId:'exercise-final',
    sets:1,
    prescription:{restSeconds:60,targetRpe:7,targetRir:3},
  }];
  execution.index=1;
  execution.results['exercise-final:1']={
    exerciseId:'exercise-final',
    setNumber:1,
    reps:10,
    seconds:null,
    load:'20 kg',
    rpe:7,
    rir:3,
    notes:'',
    completedAt:'2026-09-05T10:25:00.000Z',
  };
  const values={sessionRpe:'8',comment:'Feedback previo',pain:false,painNotes:''};
  updateFinalFeedbackDraft(execution,values);

  retreatExecution(execution);
  correctSet(execution,{blocks:[]},{reps:9,load:'22 kg',rpe:8,rir:2});
  advanceExecution(execution);

  const draft=getFinalFeedbackDraft(execution);
  assert.deepEqual(draft?.values,values);
  assert.equal(draft?.needsReview,true);
  assert.deepEqual(draft?.reviewReasons,['set_corrected_after_closeout']);
  assert.ok(draft?.reviewRequiredAt);
});

test('añadir trabajo tras escribir feedback lo conserva pero lo marca para revisión',()=>{
  const execution=awaitingFeedback();
  execution.queue=[{
    blockId:'block-final',
    exerciseId:'exercise-final',
    sets:1,
    prescription:{restSeconds:60,targetRpe:7,targetRir:3},
  }];
  execution.index=1;
  execution.results['exercise-final:1']={
    exerciseId:'exercise-final',
    setNumber:1,
    reps:10,
    seconds:null,
    load:'20 kg',
    rpe:7,
    rir:3,
    notes:'',
    completedAt:'2026-09-05T10:25:00.000Z',
  };
  const values={sessionRpe:'7',comment:'Feedback antes de ampliar',pain:false,painNotes:''};
  updateFinalFeedbackDraft(execution,values);

  retreatExecution(execution);
  addExecutionSet(execution,{actor:{role:'coach',userId:'coach-1'}});

  assert.deepEqual(execution.finalFeedbackDraft?.values,values);
  assert.equal(execution.finalFeedbackDraft?.needsReview,true);
  assert.deepEqual(execution.finalFeedbackDraft?.reviewReasons,['set_added_after_closeout']);

  advanceExecution(execution);
  assert.equal(execution.status,'active');
  assert.equal(getFinalFeedbackDraft(execution),null);
});

test('borrador de feedback nunca sale en GUARDAR_PROGRESO',()=>{
  const execution=awaitingFeedback();
  updateFinalFeedbackDraft(execution,{sessionRpe:'7',comment:'Bien',pain:false,painNotes:''});
  execution.finalFeedbackDraft.needsReview=true;
  execution.finalFeedbackDraft.reviewReasons=['set_corrected_after_closeout'];
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
  const renderBlock=source.match(/render=\(\)=>\{([^}]*)\};/)?.[1]||'';
  for(const call of [
    'hydrateActiveSetDraft(getContext())',
    'hydrateFinalFeedbackDraft(getContext())',
    'syncLiveAddExerciseControl(getContext())',
    'syncFinishControl(getContext())',
    'syncManualSyncControl(getContext())',
    'syncQuickRpeControl()',
  ]) assert.ok(renderBlock.includes(call),call);
  assert.ok(source.includes('createLiveTelemetryController({scope:globalThis,onUpdate:()=>render?.(),onDiagnostic:()=>{},telemetryOutbox,onOutboxStaged:'));
});
