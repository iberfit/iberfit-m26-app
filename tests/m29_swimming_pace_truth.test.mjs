import test from 'node:test';
import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {metricPrescriptionSummary,metricValueValid} from '../src/m26/exercises/measurement-profiles.js';
import {swimmingPrescriptionAdvisories} from '../src/m26/exercises/swimming-prescription-feedback.js';
import {createSessionDraft,addCatalogExercise,updateSessionBlock,validateSessionDraft,acceptSessionPreview,buildPublishSessionCommand} from '../src/m26/workflows/session-builder.js';
import {createExecution,plannedSetDraftValues,updateActiveSetDraft,startExecution,recordSet,correctSet} from '../src/m26/workflows/session-execution.js';
import {renderSessionBuilder,renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const catalog=createExerciseCatalog([
  {id:'swim-pace',name_es:'Natación crol continua en piscina',pattern:'acuático',measurement_profile:'endurance'},
  {id:'run-pace',name_es:'Carrera continua',pattern:'locomoción',measurement_profile:'endurance'},
]);
function published(exerciseId='swim-pace',prescription={}){
  const draft=createSessionDraft({clientId:'c1',deliveryModality:'guiada_en_app',title:'Sesión IBERFIT'});
  addCatalogExercise(draft,exerciseId,catalog,exerciseId==='swim-pace'
    ?{plannedDistanceM:'200',plannedDurationMinutes:'5',poolLengthM:'25',...prescription}
    :{plannedDistanceKm:'5',plannedDurationMinutes:'30',plannedPace:'06:00',...prescription});
  return draft;
}
function result(execution){return Object.values(execution.results)[0];}

test('Coach plans min/100 m independently from running pace and validates format',()=>{
  assert.equal(metricValueValid('plannedPacePer100M','1:55'),true);
  assert.equal(metricValueValid('plannedPacePer100M','01:55'),true);
  for(const invalid of ['0:00','00:00','1:60','1.55','-1:55','999:00']){
    assert.equal(metricValueValid('plannedPacePer100M',invalid),false,invalid);
  }
  const swim=published('swim-pace',{plannedPacePer100M:'01:55'});
  assert.equal(validateSessionDraft(swim,catalog).ok,true);
  assert.match(metricPrescriptionSummary(swim.blocks[0],catalog.get('swim-pace')),/01:55 min\/100 m \(objetivo\)/u);
  const html=renderSessionBuilder({draft:swim,catalog,role:'coach'});
  assert.match(html,/data-session-block-field="plannedPacePer100M"/u);
  assert.doesNotMatch(html,/data-session-block-field="plannedPace"/u);
  const run=renderSessionBuilder({draft:published('run-pace'),catalog,role:'coach'});
  assert.match(run,/data-session-block-field="plannedPace"/u);
  assert.doesNotMatch(run,/data-session-block-field="plannedPacePer100M"/u);
  updateSessionBlock(swim,{blockId:swim.blocks[0].id,field:'plannedPacePer100M',value:'2:05',catalog});
  assert.equal(swim.blocks[0].plannedPacePer100M,'2:05');
  acceptSessionPreview(swim,catalog);
  const command=buildPublishSessionCommand(swim,catalog);
  assert.equal(command.payload.patch.blocks[0].plannedPacePer100M,'2:05');
});

test('Client sees swim target separately, and target never becomes measured pace',()=>{
  const draft=published('swim-pace',{plannedPacePer100M:'2:05'});
  acceptSessionPreview(draft,catalog);
  const session=buildPublishSessionCommand(draft,catalog).payload.patch;
  const execution=createExecution({session,clientId:'c1',executionId:'swim-execution'});
  assert.equal(execution.queue[0].prescription.plannedPacePer100M,'2:05');
  assert.equal(plannedSetDraftValues(execution,session)?.distanceM,'200');
  assert.equal(plannedSetDraftValues(execution,session)?.pacePer100M,undefined);
  startExecution(execution);
  const html=renderGuidedExecution({session,execution,catalog,role:'client'});
  assert.match(html,/2:05 min\/100 m \(objetivo\)/u);
  assert.match(html,/data-set-field="pacePer100M"/u);
  assert.doesNotMatch(html,/data-set-field="paceMinPerKm"/u);
  const draftSaved=updateActiveSetDraft(execution,session,{durationMinutes:'5',distanceM:'200',pacePer100M:'2:30',rpe:'7'});
  assert.equal(draftSaved?.values?.pacePer100M,'2:30');
  assert.equal(draftSaved?.values?.distanceM,'200');
  recordSet(execution,session,{durationMinutes:'5',distanceM:'200',rpe:'7'});
  assert.equal(result(execution).pacePer100M,null,'measured pace is never inferred from total duration and distance');
  assert.equal(result(execution).distanceM,200);
});

test('Observed swim pace is stored, shown, and correctable with audit trail',()=>{
  const d=published('swim-pace',{plannedPacePer100M:'2:05'});
  acceptSessionPreview(d,catalog);
  const session=buildPublishSessionCommand(d,catalog).payload.patch;
  const execution=createExecution({session,clientId:'c1',executionId:'swim-correction'});
  startExecution(execution);
  recordSet(execution,session,{distanceM:200,durationMinutes:5,pacePer100M:'2:12',rpe:7});
  assert.equal(result(execution).pacePer100M,'2:12');
  let html=renderGuidedExecution({session,execution,catalog,role:'coach'});
  assert.match(html,/2:12 min\/100 m \(medido\)/u);
  assert.match(html,/data-set-field="pacePer100M"/u);
  correctSet(execution,session,{distanceM:200,durationMinutes:5,pacePer100M:'2:08',rpe:7});
  assert.equal(result(execution).pacePer100M,'2:08');
  assert.equal(execution.events.at(-1)?.type,'SET_CORRECTED');
  assert.equal(execution.events.at(-1)?.payload?.before?.pacePer100M,'2:12');
  assert.equal(execution.events.at(-1)?.payload?.after?.pacePer100M,'2:08');
  html=renderGuidedExecution({session,execution,catalog,role:'client'});
  assert.match(html,/2:08 min\/100 m \(medido\)/u);
});

test('Malformed or wrong-sport measured pace is rejected without writing a set',()=>{
  const swim=published();
  acceptSessionPreview(swim,catalog);
  const session=buildPublishSessionCommand(swim,catalog).payload.patch;
  for(const invalid of ['0:00','00:00','1:60','1.55','999:00']){
    const x=createExecution({session,clientId:'c1',executionId:'bad-'+invalid});
    startExecution(x);
    assert.throws(()=>recordSet(x,session,{distanceM:200,rpe:6,pacePer100M:invalid}),/M29_SWIM_PACE_INVALID/u);
    assert.equal(Object.keys(x.results).length,0);
  }
  const running=published('run-pace');
  acceptSessionPreview(running,catalog);
  const runSession=buildPublishSessionCommand(running,catalog).payload.patch;
  const execution=createExecution({session:runSession,clientId:'c1',executionId:'run-pace-reject'});
  startExecution(execution);
  assert.throws(()=>recordSet(execution,runSession,{distanceKm:5,rpe:7,pacePer100M:'2:00'}),/M29_SWIM_PACE_SPORT_MISMATCH/u);
  assert.equal(Object.keys(execution.results).length,0);
});

test('Swim pacing advisories flag impossible schedules without fabricating a recorded pace',()=>{
 const swim=catalog.get('swim-pace');
 const impossible=swimmingPrescriptionAdvisories({
   plannedDistanceM:1500,plannedDurationMinutes:30,plannedPacePer100M:'3:00',poolLengthM:25,
 },swim);
 assert.ok(impossible.some(n=>n.code==='swim-pace-target-exceeds-duration'&&n.level==='review'));
 const possible=swimmingPrescriptionAdvisories({
   plannedDistanceM:1500,plannedDurationMinutes:45,plannedPacePer100M:'1:55',poolLengthM:25,
 },swim);
 assert.equal(possible.some(n=>n.code==='swim-pace-target-exceeds-duration'),false);
 assert.equal(swimmingPrescriptionAdvisories({plannedDistanceM:1500,plannedDurationMinutes:45,plannedPacePer100M:'2:00'},catalog.get('run-pace')).length,0);
});
