import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileCanonicalTrainingCollections} from '../src/m26/domain/canonical-training-collections.js';
import {stateFromBootstrap,createProductionState} from '../src/m26/production-state.js';
import {publicationStatus,publicationActionsFor,publicationSummary} from '../src/m26/workflows/publication-workflow.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise,acceptSessionPreview,buildPublishSessionCommand} from '../src/m26/workflows/session-builder.js';

const clientId='10000000-0000-4000-8000-000000000101';
const otherId='10000000-0000-4000-8000-000000000102';
const cycleId='20000000-0000-4000-8000-000000000201';
const publishedId='30000000-0000-4000-8000-000000000301';
const internalId='30000000-0000-4000-8000-000000000302';
const exId='IBF-CARRERA-SUAVE';
const block={id:'b-running',type:'exercise',exerciseId:exId,sets:1,
  plannedDurationMinutes:30,plannedDistanceKm:5,targetRpe:5,restSeconds:0};
const record=(entityType,entityId,status,body={},client=clientId)=>({
  entityType,entityId,clientId:client,status,revision:1,
  body:{id:entityId,clientId:client,status,revision:1,...body},updatedAt:'2026-10-13T13:16:01Z',
});
const fixture=[
  record('planning',cycleId,'validado',{name:'Adherencia y puesta en forma',
    startDate:'2026-10-13',endDate:'2026-11-15',weeklyFrequency:5,
    sessionDurationMinutes:60,modality:'hibrido'}),
  record('session',publishedId,'publicada',{title:'Carrera guiada',durationMinutes:45,
    deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',blocks:[block],visibleToClient:true}),
  record('session',internalId,'borrador',{title:'SECRETO COACH',
    deliveryModality:'guiada_en_app',blocks:[block],visibleToClient:false}),
];
const bootstrap=(role)=>({
  user:{id:role==='coach'?'USER-M35-COACH':'USER-M35-CLIENT',role,clientId},
  canary:{active:true},data:{
    clients:[{id:clientId,name:'Cliente QA',status:'activo'}],
    trainingCycles:[],sessions:[],m26Entities:structuredClone(fixture),
  }
});
test('canonical PLAN_VALIDAR ACK is visible as current cycle after bootstrap',()=>{
  const store=stateFromBootstrap(bootstrap('coach'),createProductionState());
  assert.equal(store.collections.trainingCycles.length,1);
  const saved=store.collections.trainingCycles[0];
  assert.equal(saved.id,cycleId);
  assert.equal(saved.clientId,clientId);
  assert.equal(saved.status,'validado');
  assert.equal(saved.name,'Adherencia y puesta en forma');
  assert.equal(saved.body.id,cycleId);
});
test('new SESION_PUBLICAR canonical entity is visible to Coach with full workout',()=>{
  const store=stateFromBootstrap(bootstrap('coach'),createProductionState());
  assert.equal(store.collections.sessions.length,2);
  assert.equal(store.collections.sessions.find(x=>x.id===publishedId).blocks[0].plannedDistanceKm,5);
});
test('Client only receives a published session: approved, draft and validated cycle remain private',()=>{
  const store=stateFromBootstrap(bootstrap('client'),createProductionState());
  assert.equal(store.collections.trainingCycles.length,0);
  assert.equal(store.collections.sessions.length,1);
  assert.equal(store.collections.sessions[0].id,publishedId);
  assert.equal(store.collections.sessions[0].title,'Carrera guiada');
  assert.ok(!JSON.stringify(store.collections).includes('SECRETO COACH'));
});
test('a canonical session marked approved is not exposed to Client',()=>{
  const candidate=record('session',publishedId,'aprobada',{title:'PREVIEW NO PUBLICADA',blocks:[block]});
  const snap=bootstrap('client');snap.data.m26Entities=[candidate];
  const state=stateFromBootstrap(snap,createProductionState());
  assert.equal(state.collections.sessions.length,0);
});
test('wrong-client or wrong-entity body cannot contaminate another expediente',()=>{
  const forged=structuredClone(fixture[0]);
  forged.body.clientId=otherId;
  const badId=structuredClone(fixture[1]);
  badId.body.id=cycleId;
  assert.deepEqual(reconcileCanonicalTrainingCollections({trainingCycles:[],sessions:[],m26Entities:[forged,badId]}).trainingCycles,[]);
  assert.deepEqual(reconcileCanonicalTrainingCollections({trainingCycles:[],sessions:[],m26Entities:[forged,badId]}).sessions,[]);
});
test('canonical entity replaces same-ID legacy shadow instead of duplicating history',()=>{
  const legacy={id:cycleId,client_id:clientId,status:'borrador',revision:0,title:'ANTIGUO'};
  const merged=reconcileCanonicalTrainingCollections({trainingCycles:[legacy],sessions:[],m26Entities:[fixture[0]]});
  assert.equal(merged.trainingCycles.length,1);
  assert.equal(merged.trainingCycles[0].name,'Adherencia y puesta en forma');
});
test('other-client canonical entities stay outside selected client projection',()=>{
  const state=stateFromBootstrap({...bootstrap('client'),data:{
    ...bootstrap('client').data,m26Entities:[...fixture,record('session',internalId,'publicada',{title:'OTRO CLIENTE',visibleToClient:true},otherId)]
  }},createProductionState());
  assert.ok(!JSON.stringify(state.collections).includes('OTRO CLIENTE'));
});
test('V26 feminine database status drives action and publication visibility',()=>{
  assert.equal(publicationStatus({status:'publicada'}),'published');
  assert.equal(publicationStatus({status:'aprobada'}),'approved');
  assert.deepEqual(publicationActionsFor({entity:'session',role:'coach',record:{id:publishedId,clientId,status:'publicada'}}).map(x=>x.action),['withdraw']);
  assert.equal(publicationSummary({entity:'session',role:'client',record:{id:publishedId,clientId,status:'publicada'}}).visibleToClient,true);
});
test('running first-session constructor keeps required review and safe command revision 0',()=>{
  const catalog=createExerciseCatalog([{id:exId,name_es:'Carrera suave',pattern:'locomoción',measurement_profile:'endurance'}]);
  const draft=createSessionDraft({clientId,deliveryModality:'guiada_en_app'});
  addCatalogExercise(draft,exId,catalog);
  draft.blocks[0].plannedDurationMinutes=30;
  assert.throws(()=>buildPublishSessionCommand(draft,catalog,0),/M26_SESSION_PREVIEW_REQUIRED/);
  acceptSessionPreview(draft,catalog);
  const command=buildPublishSessionCommand(draft,catalog,0);
  assert.equal(command.type,'SESION_PUBLICAR');
  assert.equal(command.baseRevision,0);
  assert.equal(command.previewAccepted,true);
  assert.equal(command.payload.patch.deliveryOwnership,'guided_in_app');
});
test('server migration fixes first publish only; does not broaden command registry permissions',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261013134000_m35_first_session_atomic_publication.sql',import.meta.url),'utf8');
  assert.match(sql,/v_entity_type='session' and v_command_type='SESION_PUBLICAR' and v_def.requires_preview/);
  assert.match(sql,/when 'session' then 'aprobada'/);
  assert.doesNotMatch(sql,/UPDATE\s+public\.domain_command_registry_v26/iu);
});
