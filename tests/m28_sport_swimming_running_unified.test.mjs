import test from 'node:test';
import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {exerciseMeasurementProfile,metricValueValid,metricPrescriptionSummary} from '../src/m26/exercises/measurement-profiles.js';
import {swimmingPrescriptionAdvisories} from '../src/m26/exercises/swimming-prescription-feedback.js';
import {createSessionDraft,addCatalogExercise,updateSessionBlock,validateSessionDraft,acceptSessionPreview,buildPublishSessionCommand} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder,renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {createExecution} from '../src/m26/workflows/session-execution.js';
const catalog=createExerciseCatalog([
{id:'swim1',name_es:'Natación continua en piscina',pattern:'acuático',measurement_profile:'endurance'},
{id:'swim2',name_es:'Series de natación crol en piscina',pattern:'acuático',measurement_profile:'intervals'},
{id:'run1',name_es:'Carrera continua',pattern:'locomoción',measurement_profile:'endurance'},
{id:'bike1',name_es:'Ciclismo en ruta',pattern:'cíclico',measurement_profile:'endurance'},
]);
test('Sport identity separates swimming, running and cycling even with same endurance profile',()=>{
  assert.equal(exerciseMeasurementProfile(catalog.get('swim1')).sport,'swimming');
  assert.equal(exerciseMeasurementProfile(catalog.get('swim2')).kind,'intervals');
  assert.equal(exerciseMeasurementProfile(catalog.get('run1')).sport,'running');
  assert.equal(exerciseMeasurementProfile(catalog.get('bike1')).sport,'cycling');
  assert.equal(metricValueValid('poolLengthM',25),true);
  assert.equal(metricValueValid('poolLengthM',12),false);
});
test('Swimming plan has meaningful metres and pool length and does not imply observed pace',()=>{
  const draft=createSessionDraft({clientId:'c1',deliveryModality:'guiada_en_app'});
  addCatalogExercise(draft,'swim1',catalog);
  const id=draft.blocks[0].id;
  for(const [field,value] of Object.entries({plannedDistanceM:'1500',plannedDurationMinutes:'45',poolLengthM:'25'}))
    updateSessionBlock(draft,{blockId:id,field,value,catalog});
  assert.equal(validateSessionDraft(draft,catalog).ok,true);
  const markup=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.match(markup,/data-session-block-field="plannedDistanceM"/u);
  assert.match(markup,/data-session-block-field="poolLengthM"/u);
  assert.match(markup,/data-swimming-prescription-advice="info"/u);
  assert.match(metricPrescriptionSummary(draft.blocks[0],catalog.get('swim1')),/1500 m/u);
  acceptSessionPreview(draft,catalog);
  const command=buildPublishSessionCommand(draft,catalog);
  assert.equal(command.payload.patch.blocks[0].poolLengthM,'25');
  const session=command.payload.patch;
  const execution=createExecution({session,clientId:'c1',executionId:'e1'});
  const live=renderGuidedExecution({session,execution,catalog,role:'client'});
  assert.match(live,/Tu/iu);
  assert.doesNotMatch(live,/Distancia realizada \(km\)/u);
});
test('Swimming advisories compare laps/intervals only when explicitly defined',()=>{
  const ex=catalog.get('swim1');
  assert.deepEqual(swimmingPrescriptionAdvisories({},ex),[]);
  const mismatch=swimmingPrescriptionAdvisories({plannedDistanceM:1050,poolLengthM:25,plannedDurationMinutes:20},ex);
  assert.equal(mismatch.find(x=>x.code==='pool-length-not-integral'),undefined);
  const notes=swimmingPrescriptionAdvisories({plannedDistanceM:1030,poolLengthM:25,plannedDurationMinutes:30},ex);
  assert.ok(notes.some(x=>x.code==='pool-length-not-integral'));
  assert.deepEqual(swimmingPrescriptionAdvisories({plannedDistanceM:1000},catalog.get('run1')),[]);
  assert.ok(swimmingPrescriptionAdvisories({plannedDistanceM:300,intervalRepetitions:8,intervalDistanceM:50,intervalWorkSeconds:60},catalog.get('swim2')).some(x=>x.code==='swim-intervals-exceed-distance'));
});
