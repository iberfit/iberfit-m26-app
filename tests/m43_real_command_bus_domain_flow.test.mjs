import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandBus} from '../src/m26/command-bus.js';
import {createMemoryPersistentOperationRepository} from '../src/m26/platform/offline-command-repository.js';
import {buildCycleCommand} from '../src/m26/workflows/planning-workflow.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {
  createSessionDraft,addCatalogExercise,acceptSessionPreview,buildPublishSessionCommand,
} from '../src/m26/workflows/session-builder.js';
import {dispatchSessionAction} from '../src/m26/workflows/session-controller.js';
import {
  createExecution,recordSet,advanceExecution,currentStep,
} from '../src/m26/workflows/session-execution.js';
import {projectCollectionsForRole,assertClientProjectionSafe} from '../src/m26/security/role-projection.js';
import {clientSessionProjection} from '../src/m26/rc39/session-policy.js';

// Integration of the production command bus and domain engines, with a
// deterministic synthetic server. This is NOT a claim of live QA backend or
// authenticated production E2E coverage: that separate gate remains mandatory.
const clientId='m43-integrated-client',otherId='m43-other-client';
const clientActor={id:'m43-client-user',role:'client',clientId};
const coachActor={id:'m43-coach-user',role:'coach',clientId};
const catalog=createExerciseCatalog([
  {id:'ibf-m43-strength',name_es:'Sentadilla con mancuernas',measurement_profile:'strength'},
  {id:'ibf-m43-running',name_es:'Carrera continua',measurement_profile:'endurance'},
  {id:'ibf-m43-swimming',name_es:'Natación crol en piscina',measurement_profile:'endurance'},
]);

function plan(){
  return {id:'m43-cycle',clientId,name:'Fuerza, running y natación',goal:'Salud y rendimiento',
    startDate:'2026-10-15',endDate:'2026-11-15',weeklyFrequency:3,
    sessionDurationMinutes:75,modality:'hibrido'};
}

function draftWorkout(){
  const draft=createSessionDraft({clientId,title:'Sesión multideporte guiada',durationMinutes:75,deliveryModality:'guiada_en_app'});
  addCatalogExercise(draft,'ibf-m43-strength',catalog,{sets:1,reps:'8',plannedLoad:'22 kg',restSeconds:0,targetRpe:7,targetRir:2});
  addCatalogExercise(draft,'ibf-m43-running',catalog,{sets:1,plannedDistanceKm:'5',plannedDurationMinutes:'30',
    plannedPace:'06:00',restSeconds:0,targetRpe:6,targetRir:0});
  addCatalogExercise(draft,'ibf-m43-swimming',catalog,{sets:1,plannedDistanceM:'400',plannedDurationMinutes:'10',
    plannedPacePer100M:'02:25',poolLengthM:'25',restSeconds:0,targetRpe:6,targetRir:0});
  return draft;
}

function syntheticServer(){
  let activeRole='coach',remoteCalls=0,refreshBroken=false;
  const entities={trainingCycles:[],sessions:[],sessionExecutions:[]};
  const received=new Map();
  const transport={
    preflight:async()=>({}),
    execute:async(_token,command)=>{
      remoteCalls++;
      if(received.has(command.operationId))return {kind:'duplicate',remoteRevision:received.get(command.operationId)};
      if(command.clientId!==clientId)return {kind:'rejected',reason:'CLIENT_CONTEXT_MISMATCH'};
      let remoteRevision=1;
      if(command.type==='PLAN_VALIDAR'){
        entities.trainingCycles.push({...command.payload.patch,id:command.entityId,clientId,status:'validado',revision:1});
      }else if(command.type==='SESION_PUBLICAR'){
        if(activeRole!=='coach'||command.previewAccepted!==true)return {kind:'rejected',reason:'NOT_AUTHORIZED'};
        entities.sessions.push({...command.payload.patch,id:command.entityId,clientId,status:'publicada',revision:1});
      }else if(command.type==='SESION_HABILITAR'){
        const session=entities.sessions.find(x=>x.id===command.entityId);
        if(!session||session.status!=='publicada'||command.baseRevision!==session.revision)return {kind:'conflict',reason:'REVISION_MISMATCH'};
        session.status='disponible';session.revision++;remoteRevision=session.revision;
      }else if(command.type==='SESION_INICIAR'){
        const session=entities.sessions.find(x=>x.id===command.entityId);
        if(!session||session.status!=='disponible'||session.clientId!==command.clientId)return {kind:'rejected',reason:'SESSION_NOT_AVAILABLE'};
        if(activeRole==='client'&&session.deliveryOwnership!=='guided_in_app')return {kind:'rejected',reason:'COACH_LED'};
        session.status='en_curso';session.revision++;remoteRevision=session.revision;
        received.set(command.operationId,remoteRevision);
        return {kind:'ack',remoteRevision,executionRevision:1};
      }else if(command.type==='EJECUCION_COMPLETAR'){
        const patch=command.payload.patch;
        if(patch.clientId!==clientId||patch.status!=='completed'||!patch.feedback)return {kind:'rejected',reason:'INVALID_EXECUTION'};
        entities.sessionExecutions.push(structuredClone(patch));
      }else throw new Error('SYNTHETIC_UNEXPECTED_COMMAND:'+command.type);
      received.set(command.operationId,remoteRevision);
      return {kind:'ack',remoteRevision};
    },
  };
  const repository=createMemoryPersistentOperationRepository({ownerId:'m43-complete-flow'});
  const bus=createCommandBus({transport,repository,getToken:async()=> 'synthetic-token',
    getRole:()=>activeRole,rehydrate:async()=>{if(refreshBroken)throw new Error('SYNTHETIC_REFRESH_TIMEOUT');}});
  return {entities,bus,repository,role:(next)=>{activeRole=next;},breakRefresh:(v)=>{refreshBroken=v;},
    calls:()=>remoteCalls};
}

test('M43 full domain-bus flow: plan ACK → publish ACK → enable → Client execute three sports → feedback → Coach history',async()=>{
  const s=syntheticServer();
  const planResult=await s.bus.execute(buildCycleCommand(plan(),0));
  assert.equal(planResult.ok,true);
  assert.equal(s.entities.trainingCycles[0].status,'validado');
  const draft=draftWorkout();
  assert.throws(()=>buildPublishSessionCommand(draft,catalog),/M26_SESSION_PREVIEW_REQUIRED/);
  acceptSessionPreview(draft,catalog);
  const publish=dispatchSessionAction({action:'publish',draft,catalog,commandBus:s.bus,online:true,actor:coachActor});
  assert.equal(publish.kind,'command');
  assert.equal((await publish.value).ok,true);
  assert.equal(s.entities.sessions[0].status,'publicada');
  let projected=projectCollectionsForRole({sessions:s.entities.sessions},clientActor);
  assertClientProjectionSafe(projected,clientActor);
  assert.equal(projected.sessions[0].blocks[0].plannedLoad,'22 kg');
  assert.equal(projected.sessions[0].blocks[1].plannedPace,'06:00');
  assert.equal(projected.sessions[0].blocks[2].plannedPacePer100M,'02:25');
  assert.equal(clientSessionProjection(projected.sessions[0]).canClientStart,false);
  assert.equal(s.entities.trainingCycles[0].clientId,clientId);
  s.role('client');
  assert.throws(()=>s.bus.execute(buildCycleCommand({...plan(),id:'m43-invalid-plan'},0)),/ROLE_NOT_ALLOWED|M26_COMMAND/);
  s.role('coach');
  const enabled=await s.bus.execute({type:'SESION_HABILITAR',entityType:'session',
    entityId:draft.id,clientId,baseRevision:1,payload:{patch:{status:'disponible'}}});
  assert.equal(enabled.ok,true);
  assert.equal(s.entities.sessions[0].status,'disponible');
  projected=projectCollectionsForRole({sessions:s.entities.sessions},clientActor);
  assert.equal(clientSessionProjection(projected.sessions[0]).canClientStart,true);
  s.role('client');
  const session=projected.sessions[0];
  const execution=createExecution({session,clientId,executionId:'m43-test-execution'});
  const begin=dispatchSessionAction({action:'start',execution,session,actor:clientActor,
    sessionRevision:2,commandBus:s.bus,online:true});
  assert.equal(begin.kind,'command');
  assert.equal((await begin.value).ok,true);
  assert.equal(execution.status,'active');
  assert.equal(execution.revision,1);
  assert.equal(currentStep(execution,session).exerciseId,'ibf-m43-strength');
  recordSet(execution,session,{reps:8,load:'20 kg',rpe:7,rir:2,actor:clientActor});
  advanceExecution(execution,{actor:clientActor});
  recordSet(execution,session,{distanceKm:5,durationMinutes:30,paceMinPerKm:'06:15',rpe:6,actor:clientActor});
  advanceExecution(execution,{actor:clientActor});
  recordSet(execution,session,{distanceM:400,durationMinutes:10,pacePer100M:'02:30',rpe:7,actor:clientActor});
  advanceExecution(execution,{actor:clientActor});
  assert.equal(execution.status,'awaiting_feedback');
  const finish=dispatchSessionAction({action:'finish',execution,session,actor:clientActor,commandBus:s.bus,
    payload:{sessionRpe:7,comment:'He completado la sesión multideporte sin molestias',pain:false}});
  assert.equal((await finish.value).ok,true);
  assert.equal(execution.status,'completed');
  assert.equal(s.entities.sessionExecutions.length,1);
  assert.equal(s.entities.sessionExecutions[0].feedback.sessionRpe,7);
  assert.equal(Object.values(s.entities.sessionExecutions[0].results).length,3);
  const observed=Object.values(s.entities.sessionExecutions[0].results);
  assert.equal(observed[0].load,'20 kg');
  assert.equal(observed[1].paceMinPerKm,'06:15');
  assert.equal(observed[2].pacePer100M,'02:30');
  assert.equal(session.blocks[2].plannedPacePer100M,'02:25');
  const history=projectCollectionsForRole({sessionExecutions:s.entities.sessionExecutions},clientActor);
  assertClientProjectionSafe(history,clientActor);
  assert.equal(history.sessionExecutions[0].results.length,3);
  assert.equal(history.sessionExecutions[0].results[2].pacePer100M,'02:30');
  const foreign=projectCollectionsForRole({sessionExecutions:s.entities.sessionExecutions},
    {id:'another-client',role:'client',clientId:otherId});
  assert.equal(foreign.sessionExecutions.length,0);
  assert.equal((await s.repository.list()).filter(x=>x.status==='pending').length,0);
});

test('M43 remote publication ACK with failed view refresh is success, not an invitation to republish',async()=>{
  const s=syntheticServer();
  const draft=draftWorkout();acceptSessionPreview(draft,catalog);
  s.breakRefresh(true);
  const published=await s.bus.execute(buildPublishSessionCommand(draft,catalog));
  assert.equal(published.ok,true);
  assert.equal(published.refreshOk,false);
  assert.equal(published.refreshPending,true);
  assert.equal(s.entities.sessions.length,1);
  assert.equal((await s.bus.flushPending({limit:5})).attempted,0);
  assert.equal(s.entities.sessions.length,1);
  assert.equal(s.calls(),1);
});
