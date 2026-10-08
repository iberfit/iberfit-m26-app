import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionDraft,addCatalogExercise,addTrainingGroup,updateSessionBlock,
  validateSessionDraft,
} from '../src/m26/workflows/session-builder.js';
import {
  createReusableSessionDraft,sessionTemplateSnapshot,createDraftFromSessionTemplate,
  createSessionTemplateRepository,mergeSessionTemplateWorkspaces,
} from '../src/m26/productivity/session-reuse.js';

const exercises=[
  {id:'IBF-CARRERA-SUAVE',name_es:'Carrera suave',pattern:'locomoción'},
  {id:'IBF-INTERVALOS-CAMINAR-CORRER',name_es:'Intervalos caminar-correr',pattern:'locomoción'},
  {id:'IBF-BICICLETA-ESTATICA',name_es:'Bicicleta estática',pattern:'cíclico'},
  {id:'IBF-SENTADILLA-CON-BARRA',name_es:'Sentadilla con barra',pattern:'sentadilla'},
];
const lookup=new Map(exercises.map(x=>[x.id,x]));
const catalog={get:(id)=>lookup.get(id),has:(id)=>lookup.has(id)};
const clientId='sport-metrics-test-client';

test('published endurance session reuses all measured targets without inventing repetitions',()=>{
  const draft=createSessionDraft({clientId});
  addCatalogExercise(draft,'IBF-CARRERA-SUAVE',catalog);
  const block=draft.blocks[0];
  for(const [field,value] of Object.entries({
    plannedDistanceKm:'5',plannedDurationMinutes:'32',plannedPace:'06:24',
    targetHeartRateBpm:'125-145',targetHeartRateZone:'Z2',plannedElevationM:'80',
  }))updateSessionBlock(draft,{blockId:block.id,field,value,catalog});
  assert.equal(validateSessionDraft(draft,catalog).ok,true);
  const source={...draft,status:'published',previewAccepted:true};
  const reused=createReusableSessionDraft(source,{clientId:'new-client',catalog});
  assert.equal(reused.clientId,'new-client');
  assert.notEqual(reused.id,source.id);
  assert.equal(reused.blocks[0].reps,'');
  assert.equal(reused.blocks[0].plannedDistanceKm,'5');
  assert.equal(reused.blocks[0].plannedDurationMinutes,'32');
  assert.equal(reused.blocks[0].plannedPace,'06:24');
  assert.equal(reused.blocks[0].targetHeartRateBpm,'125-145');
  assert.equal(reused.blocks[0].targetHeartRateZone,'Z2');
  assert.equal(reused.blocks[0].plannedElevationM,'80');
  assert.equal(reused.previewAccepted,false);
  assert.equal(validateSessionDraft(reused,catalog).ok,true);
  assert.equal(source.blocks[0].plannedDistanceKm,'5');
});

test('saving/loading template and remote merge retain interval and cycling prescriptions',()=>{
  const draft=createSessionDraft({clientId});
  addTrainingGroup(draft,'biserie',[]);
  for(const id of ['IBF-INTERVALOS-CAMINAR-CORRER','IBF-BICICLETA-ESTATICA'])
    addCatalogExercise(draft,id,catalog);
  const group=draft.blocks[0];
  const sportFields={
    'IBF-INTERVALOS-CAMINAR-CORRER':{
      plannedDurationMinutes:'28',intervalRepetitions:'7',intervalWorkSeconds:'90',
      intervalRecoverySeconds:'60',targetHeartRateZone:'Z3',
    },
    'IBF-BICICLETA-ESTATICA':{
      plannedDistanceKm:'22',plannedPowerWatts:'145',
      plannedCadenceRpm:'85',plannedSpeedKmh:'27',
    },
  };
  for(const [id,fields] of Object.entries(sportFields))
    for(const [field,value] of Object.entries(fields))
      updateSessionBlock(draft,{blockId:group.id,exerciseId:id,field,value,catalog});
  assert.equal(validateSessionDraft(draft,catalog).ok,true);
  const snapshot=sessionTemplateSnapshot(draft);
  assert.equal(snapshot.blocks[0].prescriptions['IBF-BICICLETA-ESTATICA'].plannedPowerWatts,'145');
  const stored=new Map();
  const storage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
  const repo=createSessionTemplateRepository({ownerId:'coach-1',storage});
  const saved=repo.save('Cardio técnico',draft);
  const selection=repo.get(saved.id);
  const next=createDraftFromSessionTemplate(selection,{clientId:'other-client',catalog});
  assert.equal(next.previewAccepted,false);
  assert.deepEqual(Object.fromEntries(
    Object.entries(sportFields).map(([id,fields])=>[
      id,Object.fromEntries(Object.keys(fields).map(field=>[field,next.blocks[0].prescriptions[id][field]])),
    ]),
  ),sportFields);
  const merged=mergeSessionTemplateWorkspaces(repo.workspace(),{templates:[]});
  assert.equal(merged.templates[0].versions[0].snapshot.blocks[0]
    .prescriptions['IBF-BICICLETA-ESTATICA'].plannedPowerWatts,'145');
});

test('legacy strength templates without a repetition entry remain backward-compatible',()=>{
  const draft=createSessionDraft({clientId});
  draft.blocks=[{id:'legacy',type:'exercise',exerciseId:'IBF-SENTADILLA-CON-BARRA',sets:3,plannedLoad:'35 kg'}];
  const clone=createReusableSessionDraft(draft,{clientId:'another-client',catalog});
  assert.equal(clone.blocks[0].reps,'8–12');
  assert.equal(clone.blocks[0].plannedLoad,'35 kg');
  assert.equal(validateSessionDraft(clone,catalog).ok,true);
});
