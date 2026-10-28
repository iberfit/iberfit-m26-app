import test from 'node:test';
import assert from 'node:assert/strict';
import {createExecution,startExecution,pauseExecution,resumeExecution,cancelExecution,
  recordSet,advanceExecution,finishExecution,buildPauseExecutionCommand,
  buildResumeExecutionCommand,buildCancelExecutionCommand,buildExecutionCommand,
  buildStartExecutionCommand} from '../src/m26/workflows/session-execution.js';
import {createSessionDraft,addCatalogExercise,acceptSessionPreview,
  buildPublishSessionCommand} from '../src/m26/workflows/session-builder.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';

const CLIENT='qa-u48-client';
const genres={
 running:'Carrera suave',strength:'Sentadilla',swimming:'Natación libre',
 walking:'Caminata',cycling:'Ciclismo',mobility:'Movilidad',
 mixed:'Entrenamiento mixto',circuito:'Circuito',biserie:'Biserie',
 triserie:'Triserie',amrap:'AMRAP',tabata:'Tabata',
};
const session=(sport)=>({
 id:'qa-session-'+sport,clientId:CLIENT,title:'QA '+sport,
 status:'disponible',deliveryModality:'guiada_en_app',
 deliveryOwnership:'guided_in_app',clientVisibilityLevel:'full',
 blocks:[{id:'block-'+sport,type:'exercise',exerciseId:'exercise-'+sport,
   name:genres[sport],sets:1,reps:'8',restSeconds:0,
   targetRpe:7,targetRir:3,
   ...(sport==='running'?{plannedDistanceKm:'6.5',plannedDurationMinutes:'35.75',plannedPace:'05:30'}:{}),
   ...(sport==='swimming'?{plannedDistanceM:'1000',plannedDurationMinutes:'30'}:{})}],
});
const create=(sport)=>createExecution({
 session:session(sport),clientId:CLIENT,executionId:'execution-'+sport,
});
for(const sport of Object.keys(genres)){
 test('U48 '+sport+': start → pause → resume → cancel preserves prescription and forbids accidental completion',()=>{
   const prescribed=session(sport),before=structuredClone(prescribed.blocks);
   const execution=createExecution({session:prescribed,clientId:CLIENT,
     executionId:'execution-'+sport});
   assert.equal(execution.status,'ready');
   const launch=buildStartExecutionCommand(execution,{sessionRevision:2});
   assert.equal(launch.type,'SESION_INICIAR');
   assert.equal(launch.entityId,prescribed.id);
   assert.equal(launch.clientId,CLIENT);
   assert.equal(Object.hasOwn(launch.payload,'appointmentId'),false,
     'Guided autonomous workout never fabricates an appointment');
   startExecution(execution);
   assert.equal(execution.status,'active');
   pauseExecution(execution);
   assert.equal(execution.status,'paused');
   assert.equal(buildPauseExecutionCommand(execution,1).type,'EJECUCION_PAUSAR');
   assert.throws(()=>recordSet(execution,prescribed,{reps:8,rpe:7}),/M26_EXECUTION_NOT_ACTIVE/);
   const snapshot=structuredClone(execution);
   assert.equal(snapshot.status,'paused');
   assert.equal(snapshot.sessionId,prescribed.id);
   assert.ok(snapshot.queue.length>0);
   resumeExecution(execution);
   assert.equal(execution.status,'active');
   assert.equal(buildResumeExecutionCommand(execution,2).type,'EJECUCION_REANUDAR');
   assert.throws(()=>cancelExecution(execution,''),/M26_EXECUTION_CANCEL_REASON_REQUIRED/);
   cancelExecution(execution,'Pausa definitiva del ensayo sintético');
   assert.equal(execution.status,'cancelled');
   const cancelled=buildCancelExecutionCommand(execution,execution.cancellationReason,3);
   assert.equal(cancelled.type,'EJECUCION_CANCELAR');
   assert.equal(cancelled.entityId,execution.id);
   assert.equal(cancelled.clientId,CLIENT);
   assert.throws(()=>startExecution(execution),/M26_EXECUTION_NOT_READY/);
   assert.throws(()=>finishExecution(execution,{sessionRpe:7,comment:'No completada'}),
     /M26_EXECUTION_NOT_COMPLETE/);
   assert.deepEqual(prescribed.blocks,before,'Cancel never edits the Coach prescription');
 });
}
for(const sport of ['running','strength','swimming']){
 test('U48 '+sport+': real typed measurement → feedback → one terminal result',()=>{
   const planned=session(sport);
   const execution=createExecution({session:planned,clientId:CLIENT,executionId:'exec-complete-'+sport});
   startExecution(execution);
   const observed=sport==='running'
     ?{distanceKm:6.5,durationMinutes:35.8,rpe:7,paceMinPerKm:'05:30'}
     :sport==='swimming'
       ?{distanceM:1000,durationMinutes:30,rpe:7,pacePer100M:'03:00'}
       :{reps:8,load:'10 kg',rpe:7};
   recordSet(execution,planned,observed);
   assert.equal(Object.keys(execution.results).length,1);
   assert.throws(()=>recordSet(execution,planned,observed),/M26_EXECUTION_SET_ALREADY_RECORDED/);
   advanceExecution(execution);
   assert.equal(execution.status,'awaiting_feedback');
   finishExecution(execution,{sessionRpe:7,comment:'QA U48 cierre confirmado',pain:false});
   assert.equal(execution.status,'completed');
   const command=buildExecutionCommand(execution,4);
   assert.equal(command.type,'EJECUCION_COMPLETAR');
   assert.equal(command.entityType,'session_execution');
   assert.equal(command.entityId,execution.id);
   assert.equal(command.clientId,CLIENT);
   assert.equal(Object.keys(execution.results).length,1);
   assert.throws(()=>cancelExecution(execution,'No permitido'),/M26_EXECUTION_CANCEL_INVALID/);
   assert.throws(()=>finishExecution(execution,{sessionRpe:7,comment:'Duplicado'}),
     /M26_EXECUTION_NOT_COMPLETE/);
 });
}
test('U48: a saved Coach prescription remains a draft until explicitly reviewed and published',()=>{
 const catalog=createExerciseCatalog([{
  id:'IBF-U48-TEST',name_es:'Sentadilla de prueba',pattern:'sentadilla',
  equipment:'peso corporal',primary_muscles:['cuádriceps'],
 }]);
 const draft=createSessionDraft({clientId:CLIENT,title:'QA U48 fuerza',deliveryModality:'guiada_en_app'});
 assert.equal(draft.status,'draft');
 assert.equal(draft.previewAccepted,false);
 assert.throws(()=>buildPublishSessionCommand(draft,catalog),/M26_SESSION_DRAFT_INVALID|M26_SESSION_PREVIEW_REQUIRED/);
 addCatalogExercise(draft,'IBF-U48-TEST',catalog,{sets:1,reps:'8'});
 assert.equal(draft.status,'draft');
 assert.equal(draft.previewAccepted,false);
 const snapshot=structuredClone(draft);
 assert.equal(snapshot.blocks.length,1);
 assert.equal(snapshot.status,'draft');
 acceptSessionPreview(draft,catalog);
 const published=buildPublishSessionCommand(draft,catalog,0);
 assert.equal(published.type,'SESION_PUBLICAR');
 assert.equal(published.clientId,CLIENT);
 assert.equal(published.baseRevision,0);
 assert.equal(published.payload.patch.visibleToClient,true);
 assert.equal(published.payload.patch.deliveryModality,'guiada_en_app');
 assert.equal(published.payload.patch.deliveryOwnership,'guided_in_app');
 assert.equal(published.payload.patch.clientVisibilityLevel,'full');
 assert.equal(snapshot.status,'draft','Published prescription does not rewrite saved draft history');
});
test('U48: execution scopes never accept a different Client as their owner',()=>{
 const s=session('running');
 assert.throws(()=>createExecution({session:s,clientId:'foreign-client'}),
   /M43_EXECUTION_CLIENT_SCOPE_CONFLICT/);
});
