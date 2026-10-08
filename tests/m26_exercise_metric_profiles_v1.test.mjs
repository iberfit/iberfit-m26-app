import test from 'node:test';
import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {exerciseMeasurementProfile,initialExercisePrescription,metricValueValid} from '../src/m26/exercises/measurement-profiles.js';
import {createSessionDraft,addCatalogExercise,updateSessionBlock,validateSessionDraft,addTrainingGroup,closeTrainingGroup} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution,recordSet,plannedSetDraftValues,updateActiveSetDraft,getActiveSetDraft} from '../src/m26/workflows/session-execution.js';
import {renderSessionBuilder,renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const exercises=[
 {id:'IBF-CARRERA-SUAVE',name_es:'Carrera suave',pattern:'locomoción',equipment:'sin equipo'},
 {id:'IBF-INTERVALOS-CAMINAR-CORRER',name_es:'Intervalos caminar-correr',pattern:'locomoción',equipment:'sin equipo'},
 {id:'IBF-BICICLETA-ESTATICA',name_es:'Bicicleta estática',pattern:'cíclico',equipment:'bicicleta'},
 {id:'IBF-PLANCHA-FRONTAL-ALTA',name_es:'Plancha frontal alta',pattern:'anti-extensión',equipment:'sin equipo'},
 {id:'IBF-SENTADILLA-TRASERA-CON-BARRA',name_es:'Sentadilla trasera con barra',pattern:'sentadilla',equipment:'barra'},
 {id:'IBF-FARMER-CARRY',name_es:'Farmer carry',pattern:'locomoción',equipment:'mancuerna'},
 {id:'IBF-CICLISMO-EN-RUTA',name_es:'Ciclismo en ruta',pattern:'cíclico',equipment:'bicicleta'},
 {id:'IBF-MOUNTAIN-BIKE',name_es:'Mountain bike',pattern:'cíclico',equipment:'bicicleta'},
];
const catalog=createExerciseCatalog(exercises);
const draftWith=(id)=>{const draft=createSessionDraft({clientId:'client-1'});addCatalogExercise(draft,id,catalog);return draft;};
const set=(d,field,value)=>updateSessionBlock(d,{blockId:d.blocks[0].id,field,value,catalog});
test('profiles distinguish running, intervals, cycling, static holds, carries, and loaded strength',()=>{
 assert.equal(exerciseMeasurementProfile(catalog.get('IBF-CARRERA-SUAVE')).kind,'endurance');
 assert.equal(exerciseMeasurementProfile(catalog.get('IBF-INTERVALOS-CAMINAR-CORRER')).kind,'intervals');
 assert.equal(exerciseMeasurementProfile(catalog.get('IBF-BICICLETA-ESTATICA')).sport,'cycling');
 assert.equal(exerciseMeasurementProfile(catalog.get('IBF-CICLISMO-EN-RUTA')).sport,'cycling');
 assert.equal(exerciseMeasurementProfile(catalog.get('IBF-MOUNTAIN-BIKE')).sport,'cycling');
 assert.equal(exerciseMeasurementProfile(catalog.get('IBF-PLANCHA-FRONTAL-ALTA')).kind,'isometric');
 assert.equal(exerciseMeasurementProfile(catalog.get('IBF-FARMER-CARRY')).kind,'carry');
 assert.equal(exerciseMeasurementProfile(catalog.get('IBF-SENTADILLA-TRASERA-CON-BARRA')).kind,'strength');
});
test('endurance starts with one activity block, not 8–12 reps or mandatory load',()=>{
 const d=draftWith('IBF-CARRERA-SUAVE');
 assert.equal(d.blocks[0].sets,1);
 assert.equal(d.blocks[0].reps,'');
 assert.equal(validateSessionDraft(d,catalog).ok,false);
 set(d,'plannedDistanceKm','5');
 set(d,'plannedDurationMinutes','30');
 set(d,'plannedPace','06:00');
 set(d,'targetHeartRateZone','Z2');
 assert.equal(validateSessionDraft(d,catalog).ok,true);
 assert.equal(d.blocks[0].plannedDistanceKm,'5');
 assert.equal(d.blocks[0].targetHeartRateZone,'Z2');
 const html=renderSessionBuilder({draft:d,catalog,role:'coach'});
 assert.match(html,/Distancia objetivo \(km\)/);
 assert.match(html,/Duración objetivo \(min\)/);
 assert.doesNotMatch(html,/Carga planificada/);
});
test('cardio prescription survives session snapshot, draft reuse and actual completion',()=>{
 const d=draftWith('IBF-CARRERA-SUAVE');
 set(d,'plannedDurationMinutes','30');set(d,'plannedDistanceKm','5');set(d,'targetHeartRateBpm','120-140');
 const execution=createExecution({session:d,clientId:'client-1'});
 assert.equal(execution.queue[0].prescription.plannedDistanceKm,'5');
 startExecution(execution);
 const suggestion=plannedSetDraftValues(execution,d);
 assert.equal(suggestion.durationMinutes,'30');
 assert.equal(suggestion.distanceKm,'5');
 assert.equal(suggestion.rpe,'');
 updateActiveSetDraft(execution,d,{durationMinutes:'32',distanceKm:'5.1',rpe:'4',avgHeartRateBpm:'135'});
 assert.equal(getActiveSetDraft(execution,d).values.avgHeartRateBpm,'135');
 recordSet(execution,d,{durationMinutes:32,distanceKm:'5.1',avgHeartRateBpm:135,paceMinPerKm:'06:16',rpe:4});
 const saved=Object.values(execution.results)[0];
 assert.equal(saved.seconds,1920);
 assert.equal(saved.reps,null);
 assert.equal(saved.distanceKm,5.1);
 assert.equal(saved.avgHeartRateBpm,135);
 assert.equal(saved.paceMinPerKm,'06:16');
 assert.equal(getActiveSetDraft(execution,d),null);
});
test('intervals prescribe work/recovery and accept interval count without kilograms',()=>{
 const d=draftWith('IBF-INTERVALOS-CAMINAR-CORRER');
 set(d,'intervalRepetitions','8');
 set(d,'intervalWorkSeconds','60');
 set(d,'intervalRecoverySeconds','90');
 assert.equal(validateSessionDraft(d,catalog).ok,true);
 const ex=createExecution({session:d,clientId:'client-1'});
 startExecution(ex);
 recordSet(ex,d,{intervalsCompleted:8,rpe:7});
 assert.equal(Object.values(ex.results)[0].intervalsCompleted,8);
});
test('cycling records cadence and power while strength and isometrics retain their fields',()=>{
 const d=draftWith('IBF-BICICLETA-ESTATICA');set(d,'plannedDurationMinutes','45');set(d,'plannedSpeedKmh','25');
 const execution=createExecution({session:d,clientId:'client-1'});startExecution(execution);
 recordSet(execution,d,{durationMinutes:45,distanceKm:20,avgSpeedKmh:26.7,cadenceRpm:80,powerWatts:120,rpe:5});
 assert.equal(Object.values(execution.results)[0].powerWatts,120);
 const plank=draftWith('IBF-PLANCHA-FRONTAL-ALTA');
 assert.equal(plank.blocks[0].reps, '30 s');
 assert.equal(validateSessionDraft(plank,catalog).ok,true);
 const strength=draftWith('IBF-SENTADILLA-TRASERA-CON-BARRA');
 assert.equal(strength.blocks[0].reps,'8–12');
 assert.equal(validateSessionDraft(strength,catalog).ok,true);
 const farmer=draftWith('IBF-FARMER-CARRY');
 set(farmer,'plannedDistanceM','30');
 assert.equal(validateSessionDraft(farmer,catalog).ok,true);
 const carryExecution=createExecution({session:farmer,clientId:'client-1'});startExecution(carryExecution);
 recordSet(carryExecution,farmer,{distanceM:30,load:'20 kg',rpe:6});
 assert.equal(Object.values(carryExecution.results)[0].distanceM,30);
});
test('group prescription retains structured metrics for an interval activity',()=>{
 const d=createSessionDraft({clientId:'client-1'});
 addTrainingGroup(d,'amrap',[]);
 addCatalogExercise(d,'IBF-INTERVALOS-CAMINAR-CORRER',catalog);
 const g=d.blocks[0];
 updateSessionBlock(d,{blockId:g.id,exerciseId:'IBF-INTERVALOS-CAMINAR-CORRER',field:'intervalRepetitions',value:'6',catalog});
 updateSessionBlock(d,{blockId:g.id,exerciseId:'IBF-INTERVALOS-CAMINAR-CORRER',field:'intervalWorkSeconds',value:'30',catalog});
 closeTrainingGroup(d);
 assert.equal(g.prescriptions['IBF-INTERVALOS-CAMINAR-CORRER'].intervalRepetitions,'6');
 assert.equal(validateSessionDraft(d,catalog).ok,true);
});
test('invalid metrics and missing RPE never complete an endurance segment',()=>{
 const d=draftWith('IBF-CARRERA-SUAVE');
 set(d,'plannedDurationMinutes','25');
 const x=createExecution({session:d,clientId:'client-1'});startExecution(x);
 assert.throws(()=>recordSet(x,d,{distanceKm:-2,rpe:5}),/DISTANCE_INVALID/);
 assert.throws(()=>recordSet(x,d,{durationMinutes:25,distanceKm:4}),/RPE_INVALID/);
 assert.equal(Object.keys(x.results).length,0);
});

test('heart-rate targets reject impossible and inverted ranges without guessing physiology',()=>{
  for(const accepted of ['60','120','135-150','120 – 140','230'])
    assert.equal(metricValueValid('targetHeartRateBpm',accepted),true,accepted);
  for(const rejected of ['0','29','251','999','150-120','29-120','120-251','abc','120/140'])
    assert.equal(metricValueValid('targetHeartRateBpm',rejected),false,rejected);
  const d=draftWith('IBF-CARRERA-SUAVE');
  set(d,'plannedDurationMinutes','30');
  set(d,'targetHeartRateBpm','150-120');
  assert.equal(validateSessionDraft(d,catalog).ok,false);
  set(d,'targetHeartRateBpm','120-150');
  assert.equal(validateSessionDraft(d,catalog).ok,true);
});
