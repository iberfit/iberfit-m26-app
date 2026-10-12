import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {exerciseMeasurementProfile,metricPrescriptionSummary,metricValueValid} from '../src/m26/exercises/measurement-profiles.js';
import {runningPrescriptionAdvisories} from '../src/m26/exercises/running-prescription-feedback.js';
import {createSessionDraft,addCatalogExercise,updateSessionBlock,validateSessionDraft}
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

test('walking retains pace prescription without mislabelled running advisory',()=>{
  const draft=createSessionDraft({clientId:'client-1'});
  addCatalogExercise(draft,'WALK',catalog);
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.match(html,/data-session-block-field="plannedPace"/u);
  assert.doesNotMatch(html,/data-running-prescription-advice/u);
  const source=readFileSync(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8');
  assert.match(source,/\['running','walking'\]\.includes\(profile\.sport\)/u);
});


test('interval warmup, recovery and cooldown form one truthful minimum without fake measurements',()=>{
  const p={intervalRepetitions:8,intervalWorkSeconds:60,intervalRecoverySeconds:90,
    plannedWarmupMinutes:10,plannedCooldownMinutes:5,plannedDurationMinutes:30};
  const result=runningPrescriptionAdvisories(p,interval);
  assert.deepEqual(result.map(x=>x.code),['interval-minimum-exceeds-duration']);
  assert.match(result[0].message,/34 min/u);
  const longer=runningPrescriptionAdvisories({...p,plannedDurationMinutes:40},interval);
  assert.deepEqual(longer.map(x=>x.code),['interval-minimum']);
  assert.match(longer[0].message,/34 min/u);
  assert.match(longer[0].message,/No es tiempo registrado/u);
});

test('missing recovery stays unknown rather than being silently assumed zero',()=>{
  const notes=runningPrescriptionAdvisories({
    intervalRepetitions:4,intervalWorkSeconds:120,plannedDurationMinutes:20,
  },interval);
  assert.deepEqual(notes.map(x=>x.code),['interval-minimum','interval-recovery-unspecified']);
  assert.match(notes[1].message,/no incluye ese descanso/u);
});

test('distance per interval exposes a target-only pace and warns on contradictory total',()=>{
  const notes=runningPrescriptionAdvisories({
    intervalRepetitions:6,intervalWorkSeconds:120,intervalRecoverySeconds:90,
    intervalDistanceM:400,plannedDistanceKm:2,plannedDurationMinutes:60,
  },interval);
  assert.deepEqual(notes.map(x=>x.code),[
    'interval-minimum','interval-distance-exceeds-total','interval-target-pace',
  ]);
  assert.match(notes[2].message,/~5:00 min\/km/u);
  assert.match(notes[2].message,/no medido/u);
  assert.doesNotMatch(notes[2].message,/observado|completado/u);
});

test('Coach saves new optional interval fields without altering legacy session semantics',()=>{
  const draft=createSessionDraft({clientId:'client-1'});
  addCatalogExercise(draft,'INTERVALS',catalog);
  const id=draft.blocks[0].id;
  for(const [field,value] of Object.entries({
    intervalRepetitions:'8',intervalWorkSeconds:'60',
    intervalRecoverySeconds:'90',intervalDistanceM:'400',
    plannedWarmupMinutes:'10',plannedCooldownMinutes:'5',
    plannedDurationMinutes:'35',
  }))updateSessionBlock(draft,{blockId:id,field,value,catalog});
  assert.equal(validateSessionDraft(draft,catalog).ok,true);
  const summary=metricPrescriptionSummary(draft.blocks[0],interval);
  assert.match(summary,/400 m\/repetición/u);
  assert.match(summary,/10 min calentamiento/u);
  assert.match(summary,/5 min vuelta a la calma/u);
  const snapshot=JSON.stringify(draft);
  const markup=renderSessionBuilder({draft,catalog,role:'coach'});
  for(const key of ['plannedWarmupMinutes','plannedCooldownMinutes','intervalDistanceM'])
    assert.ok(markup.includes(`data-session-block-field="${key}"`),key);
  assert.match(markup,/data-running-prescription-advice="info"/u);
  assert.equal(JSON.stringify(draft),snapshot);
});

test('invalid new metric values cannot bypass draft validation',()=>{
  assert.equal(metricValueValid('intervalDistanceM','0'),false);
  assert.equal(metricValueValid('intervalDistanceM','-50'),false);
  assert.equal(metricValueValid('intervalDistanceM','400'),true);
  assert.equal(metricValueValid('plannedWarmupMinutes','241'),false);
  assert.equal(metricValueValid('plannedCooldownMinutes','-1'),false);
  assert.equal(metricValueValid('plannedWarmupMinutes','0'),true);
  const draft=createSessionDraft({clientId:'client-1'});
  addCatalogExercise(draft,'INTERVALS',catalog);
  const blockId=draft.blocks[0].id;
  updateSessionBlock(draft,{blockId,field:'intervalRepetitions',value:'6',catalog});
  updateSessionBlock(draft,{blockId,field:'intervalWorkSeconds',value:'45',catalog});
  updateSessionBlock(draft,{blockId,field:'intervalDistanceM',value:'-20',catalog});
  assert.equal(validateSessionDraft(draft,catalog).ok,false);
});

test('warmup and cooldown advice stays specific to running, not walking/cycling',()=>{
  const p={plannedDurationMinutes:30,plannedDistanceKm:5,
    plannedWarmupMinutes:20,plannedCooldownMinutes:15};
  assert.equal(runningPrescriptionAdvisories(p,run)[0]?.code,'running-phases-exceed-duration');
  assert.deepEqual(runningPrescriptionAdvisories(p,catalog.get('WALK')),[]);
  assert.deepEqual(runningPrescriptionAdvisories(p,catalog.get('BIKE')),[]);
});

test('Coach does not compare a main running pace with phase-inclusive totals',()=>{
  const notes=runningPrescriptionAdvisories({
    plannedDurationMinutes:45,plannedDistanceKm:5,plannedPace:'05:00',
    plannedWarmupMinutes:10,plannedCooldownMinutes:5,
  },run);
  assert.deepEqual(notes.map(x=>x.code),[
    'running-overall-pace-with-phases','running-main-pace-not-comparable',
  ]);
  assert.match(notes[0].message,/~9:00 min\/km/u);
  assert.match(notes[0].message,/bloque completo/u);
  assert.doesNotMatch(notes.map(x=>x.code).join(' '),/pace-plan-mismatch/u);
});

test('even a single prescribed warmup prevents false main-pace mismatch',()=>{
  const notes=runningPrescriptionAdvisories({
    plannedDurationMinutes:30,plannedDistanceKm:5,plannedPace:'04:00',
    plannedWarmupMinutes:5,
  },run);
  assert.deepEqual(notes.map(x=>x.code),[
    'running-overall-pace-with-phases','running-main-pace-not-comparable',
  ]);
  assert.match(notes[0].message,/~6:00 min\/km/u);
});

test('phase minutes exhausting the total never produce a plausible running pace',()=>{
  const notes=runningPrescriptionAdvisories({
    plannedDurationMinutes:30,plannedDistanceKm:4,
    plannedWarmupMinutes:25,plannedCooldownMinutes:10,
    plannedPace:'05:30',
  },run);
  assert.equal(notes[0].code,'running-phases-exceed-duration');
  assert.ok(!notes.some(x=>x.code==='running-overall-pace-with-phases'));
});

test('incomplete intervals never invent target performance and show actionable fields',()=>{
  for(const partial of [
    {intervalRepetitions:5},
    {intervalWorkSeconds:60},
    {intervalDistanceM:400},
    {intervalRepetitions:6,intervalRecoverySeconds:90},
  ]){
    const notes=runningPrescriptionAdvisories({
      plannedDistanceKm:5,plannedDurationMinutes:30,...partial,
    },interval);
    assert.deepEqual(notes.map(x=>x.code),['interval-prescription-incomplete']);
    assert.equal(notes[0].level,'review');
    assert.match(notes[0].message,/repeticiones y segundos/u);
  }
  assert.deepEqual(runningPrescriptionAdvisories({},interval),[]);
});

test('phase-aware running notices render in Coach and never alter prescription',()=>{
  const draft=createSessionDraft({clientId:'client-1'});
  addCatalogExercise(draft,'RUN',catalog);
  const id=draft.blocks[0].id;
  for(const [field,value] of Object.entries({
    plannedDistanceKm:'5',plannedDurationMinutes:'45',
    plannedPace:'05:00',plannedWarmupMinutes:'10',plannedCooldownMinutes:'5',
  }))updateSessionBlock(draft,{blockId:id,field,value,catalog});
  const before=JSON.stringify(draft);
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.match(html,/Ritmo medio teórico del bloque completo/u);
  assert.match(html,/no puede compararse con el promedio total/u);
  assert.doesNotMatch(html,/ritmo introducido difiere/u);
  assert.equal(JSON.stringify(draft),before);
});
