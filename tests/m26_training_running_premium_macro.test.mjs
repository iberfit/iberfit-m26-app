import test from 'node:test';
import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {exerciseMeasurementProfile} from '../src/m26/exercises/measurement-profiles.js';
import {runningPrescriptionAdvisories} from '../src/m26/exercises/running-prescription-feedback.js';
import {createSessionDraft,addCatalogExercise,updateSessionBlock}
  from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const exercises=[
  {id:'RUN',name_es:'Carrera suave',pattern:'locomoción',equipment:'sin equipo'},
  {id:'INTERVALS',name_es:'Intervalos caminar-correr',pattern:'locomoción',equipment:'sin equipo'},
  {id:'WALK',name_es:'Caminata continua',pattern:'locomoción',equipment:'sin equipo'},
  {id:'STAIRS',name_es:'Subida de escaleras',pattern:'cíclico',equipment:'sin equipo'},
  {id:'BIKE',name_es:'Ciclismo en ruta',pattern:'cíclico',equipment:'bicicleta'},
  {id:'ROW',name_es:'Remo ergómetro',pattern:'cíclico',equipment:'máquina'},
  {id:'GENERIC',name_es:'Actividad cíclica',pattern:'cíclico',equipment:'sin equipo'},
  {id:'PLANK',name_es:'Plancha frontal',measurement_profile:'isometric',pattern:'core',equipment:'sin equipo'},
];
const catalog=createExerciseCatalog(exercises);
const run=exercises[0],interval=exercises[1];

test('running taxonomy does not mislabel walking, stairs, cycling or generic cardio',()=>{
  const sport=id=>exerciseMeasurementProfile(catalog.get(id)).sport;
  assert.equal(sport('RUN'),'running');
  assert.equal(sport('INTERVALS'),'running');
  assert.equal(sport('WALK'),'walking');
  assert.equal(sport('STAIRS'),'stairs');
  assert.equal(sport('BIKE'),'cycling');
  assert.equal(sport('ROW'),'rowing');
  assert.equal(sport('GENERIC'),null);
  assert.equal(sport('PLANK'),null);
  assert.equal(exerciseMeasurementProfile(catalog.get('INTERVALS')).kind,'intervals');
  assert.equal(exerciseMeasurementProfile({name_es:'Sentadilla con barra',measurementProfile:'strength'}).sport,null);
});

test('running target gives estimated plan pace, never recorded performance',()=>{
  const notes=runningPrescriptionAdvisories({plannedDurationMinutes:30,plannedDistanceKm:5},run);
  assert.deepEqual(notes.map(x=>x.code),['pace-plan-estimate']);
  assert.match(notes[0].message,/~6:00 min\/km/u);
  assert.match(notes[0].message,/No es un ritmo medido/u);
});

test('large pace mismatch asks Coach to review but never blocks the session',()=>{
  const notes=runningPrescriptionAdvisories({
    plannedDistanceKm:5,plannedDurationMinutes:40,plannedPace:'05:00',
  },run);
  assert.deepEqual(notes.map(x=>x.code),['pace-plan-mismatch']);
  assert.equal(notes[0].level,'review');
  assert.match(notes[0].message,/~8:00 min\/km/u);
});

test('interval workload does not infer a pace from recovery-inclusive duration',()=>{
  const base={intervalRepetitions:8,intervalWorkSeconds:60,intervalRecoverySeconds:90,
    plannedDistanceKm:5,plannedPace:'05:00'};
  const short=runningPrescriptionAdvisories({...base,plannedDurationMinutes:15},interval);
  assert.deepEqual(short.map(x=>x.code),['interval-minimum-exceeds-duration']);
  assert.match(short[0].message,/19 min/u);
  const normal=runningPrescriptionAdvisories({...base,plannedDurationMinutes:25},interval);
  assert.deepEqual(normal.map(x=>x.code),['interval-minimum']);
  assert.doesNotMatch(normal[0].message,/min\/km/u);
});

test('missing, zero and invalid values create no fabricated training evidence',()=>{
  for(const p of [{},{plannedDistanceKm:5},{plannedDurationMinutes:30},
    {plannedDistanceKm:0,plannedDurationMinutes:30},
    {plannedDistanceKm:'abc',plannedDurationMinutes:30}]){
    assert.deepEqual(runningPrescriptionAdvisories(p,run),[]);
  }
  assert.deepEqual(runningPrescriptionAdvisories({plannedDistanceKm:5,plannedDurationMinutes:30},
    catalog.get('WALK')),[]);
  assert.deepEqual(runningPrescriptionAdvisories({plannedDistanceKm:5,plannedDurationMinutes:30},
    catalog.get('BIKE')),[]);
});

test('distance units mismatch is advisory, never silently chooses two different goals',()=>{
  const notes=runningPrescriptionAdvisories({
    plannedDistanceKm:5,plannedDistanceM:6000,plannedDurationMinutes:30,
  },run);
  assert.equal(notes[0].code,'distance-units-disagree');
  assert.equal(notes[0].level,'review');
});

test('Coach sees calculated running context in the real builder, without altering drafts',()=>{
  const draft=createSessionDraft({clientId:'client-1'});
  addCatalogExercise(draft,'RUN',catalog);
  const block=draft.blocks[0];
  updateSessionBlock(draft,{blockId:block.id,field:'plannedDistanceKm',value:'5',catalog});
  updateSessionBlock(draft,{blockId:block.id,field:'plannedDurationMinutes',value:'30',catalog});
  const before=JSON.stringify(draft);
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.match(html,/data-running-prescription-advice="info"/u);
  assert.match(html,/Ritmo medio estimado del objetivo/u);
  assert.equal(JSON.stringify(draft),before,'advisory must not mutate coach prescription');
});

test('walking has no running pace field in the existing Coach builder',()=>{
  const draft=createSessionDraft({clientId:'client-1'});
  addCatalogExercise(draft,'WALK',catalog);
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.doesNotMatch(html,/data-session-block-field="plannedPace"/u);
  assert.doesNotMatch(html,/data-running-prescription-advice/u);
});
