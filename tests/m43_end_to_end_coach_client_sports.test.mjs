import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryEngagementDraftRepository} from '../src/m26/engagement/activity-drafts.js';
import {planningDraftScope,restorePlanningDraft,removeConfirmedPlanningDraft} from '../src/m26/workflows/planning-draft-safety.js';
import {buildCycleCommand} from '../src/m26/workflows/planning-workflow.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {
  createSessionDraft,addCatalogExercise,acceptSessionPreview,buildPublishSessionCommand,
} from '../src/m26/workflows/session-builder.js';
import {projectCollectionsForRole,assertClientProjectionSafe} from '../src/m26/security/role-projection.js';
import {
  clientSessionProjection,actorCanExecuteSession,sessionReadyToStart,
} from '../src/m26/rc39/session-policy.js';
import {
  createExecution,startExecution,recordSet,advanceExecution,finishExecution,
  buildStartExecutionCommand,buildExecutionCommand,currentStep,plannedSetDraftValues,
} from '../src/m26/workflows/session-execution.js';

const clientId='10000000-0000-4000-8000-000000000101';
const otherClient='10000000-0000-4000-8000-000000000102';
const user={id:'client-user-m43',role:'client',clientId};
const catalog=createExerciseCatalog([
  {id:'IBF-SENTADILLA-FUERZA',name_es:'Sentadilla con mancuernas',pattern:'dominante de rodilla',measurement_profile:'strength'},
  {id:'IBF-CARRERA-CONTINUA',name_es:'Carrera continua',pattern:'locomoción',measurement_profile:'endurance'},
  {id:'IBF-NATACION-CROL',name_es:'Natación crol en piscina',pattern:'acuático',measurement_profile:'endurance'},
]);

const cycle=(id,name)=>({id,clientId,name,startDate:'2026-10-15',endDate:'2026-11-15',
  goal:'Desarrollar condición física con control de carga',modality:'hibrido',
  weeklyFrequency:3,sessionDurationMinutes:70});

function coachSession(deliveryModality='guiada_en_app'){
  const draft=createSessionDraft({clientId,title:'Entrenamiento completo de calidad',durationMinutes:75,deliveryModality});
  addCatalogExercise(draft,'IBF-SENTADILLA-FUERZA',catalog,{
    sets:1,reps:'8',plannedLoad:'30 kg',restSeconds:75,targetRpe:7,targetRir:2,
  });
  addCatalogExercise(draft,'IBF-CARRERA-CONTINUA',catalog,{
    sets:1,plannedDistanceKm:'5',plannedDurationMinutes:'30',plannedPace:'06:00',
    restSeconds:0,targetRpe:6,targetRir:0,
  });
  addCatalogExercise(draft,'IBF-NATACION-CROL',catalog,{
    sets:1,plannedDistanceM:'400',poolLengthM:'25',plannedDurationMinutes:'10',
    plannedPacePer100M:'02:20',restSeconds:0,targetRpe:6,targetRir:0,
  });
  return draft;
}

function published(deliveryModality='guiada_en_app'){
  const draft=coachSession(deliveryModality);
  assert.throws(()=>buildPublishSessionCommand(draft,catalog,0),/M26_SESSION_PREVIEW_REQUIRED/);
  acceptSessionPreview(draft,catalog);
  const cmd=buildPublishSessionCommand(draft,catalog,0);
  return {draft,cmd,session:{...cmd.payload.patch,status:'publicada',revision:1}};
}

test('M43 integrated: Coach can keep two cycles and validate one without erasing the other',async()=>{
  const store=createMemoryEngagementDraftRepository({ownerId:'coach-verified'});
  const first=cycle('cycle-strength','Mesociclo fuerza');
  const second=cycle('cycle-endurance','Bloque carrera y natación');
  await store.save(clientId,planningDraftScope(first.id),first);
  await store.save(clientId,planningDraftScope(second.id),second);
  const prepared=await restorePlanningDraft(store,clientId,first.id);
  assert.equal(buildCycleCommand(prepared.value,0).type,'PLAN_VALIDAR');
  assert.equal(buildCycleCommand(prepared.value,0).entityId,first.id);
  await removeConfirmedPlanningDraft(store,clientId,first.id);
  assert.equal(await restorePlanningDraft(store,clientId,first.id),null);
  assert.equal((await restorePlanningDraft(store,clientId,second.id)).value.name,second.name);
  assert.equal(await restorePlanningDraft(store,otherClient,second.id),null);
});

test('M43 integrated: published visibility, explicit enablement, three sports, measured results, feedback and Coach evidence',()=>{
  const {draft,cmd,session}=published();
  assert.equal(cmd.type,'SESION_PUBLICAR');
  assert.equal(cmd.clientId,clientId);
  assert.equal(cmd.previewAccepted,true);
  assert.equal(session.deliveryOwnership,'guided_in_app');
  assert.equal(session.clientVisibilityLevel,'full');
  const privateSession={...session,id:'coach-private',title:'NO MOSTRAR',status:'borrador',visibleToClient:false};
  const foreignSession={...session,id:'foreign',title:'OTRO CLIENTE',clientId:otherClient};
  const projection=projectCollectionsForRole({sessions:[session,privateSession,foreignSession]},user);
  assertClientProjectionSafe(projection,user);
  assert.equal(projection.sessions.length,1);
  assert.equal(projection.sessions[0].id,session.id);
  assert.doesNotMatch(JSON.stringify(projection),/NO MOSTRAR|OTRO CLIENTE/);

  assert.equal(clientSessionProjection(session).visible,true);
  assert.equal(clientSessionProjection(session).canClientStart,false,'published is not enabled for execution');
  assert.equal(sessionReadyToStart(session),false);
  const enabled={...projection.sessions[0],status:'disponible'};
  assert.equal(clientSessionProjection(enabled).canClientStart,true);
  assert.equal(actorCanExecuteSession({role:'client',session:enabled}),true);

  const execution=createExecution({session:enabled,clientId,executionId:'m43-synthetic-execution'});
  const start=buildStartExecutionCommand(execution,{sessionRevision:2});
  assert.equal(start.type,'SESION_INICIAR');
  assert.equal(start.clientId,clientId);
  assert.equal(start.entityId,enabled.id);
  assert.equal(start.payload.appointmentId,undefined);
  assert.equal(plannedSetDraftValues(execution,enabled).load,undefined);
  startExecution(execution,{actor:{role:'client',clientId,userId:user.id}});
  assert.equal(currentStep(execution,enabled).exerciseId,'IBF-SENTADILLA-FUERZA');

  recordSet(execution,enabled,{reps:8,load:'30 kg',rpe:7,rir:2,actor:user});
  advanceExecution(execution,{actor:user});
  assert.equal(currentStep(execution,enabled).exerciseId,'IBF-CARRERA-CONTINUA');
  recordSet(execution,enabled,{durationMinutes:'30',distanceKm:'5',paceMinPerKm:'06:00',rpe:6,actor:user});
  advanceExecution(execution,{actor:user});
  assert.equal(currentStep(execution,enabled).exerciseId,'IBF-NATACION-CROL');
  recordSet(execution,enabled,{durationMinutes:'10',distanceM:'400',pacePer100M:'02:25',rpe:7,actor:user});
  advanceExecution(execution,{actor:user});
  assert.equal(execution.status,'awaiting_feedback');
  assert.equal(Object.keys(execution.results).length,3);
  const measured=Object.values(execution.results);
  assert.equal(measured[0].load,'30 kg');
  assert.equal(measured[1].distanceKm,5);
  assert.equal(measured[1].paceMinPerKm,'06:00');
  assert.equal(measured[2].distanceM,400);
  assert.equal(measured[2].pacePer100M,'02:25');
  assert.equal(measured[2].paceMinPerKm,null);
  assert.throws(()=>finishExecution(execution,{sessionRpe:'no medido',comment:'Controlado'}),/M26_EXECUTION_SESSION_RPE_REQUIRED/);
  assert.equal(execution.status,'awaiting_feedback','invalid RPE must not complete a session');
  finishExecution(execution,{sessionRpe:7,comment:'Entrenamiento completado sin molestias',pain:false},{actor:user});
  assert.equal(execution.status,'completed');
  assert.equal(execution.feedback.sessionRpe,7);
  assert.equal(execution.events.filter(e=>e.type==='SESSION_COMPLETED').length,1);
  assert.throws(()=>finishExecution(execution,{sessionRpe:7,comment:'Repetido'}),/M26_EXECUTION_NOT_COMPLETE/);
  const finish=buildExecutionCommand(execution,0);
  assert.equal(finish.type,'EJECUCION_COMPLETAR');
  assert.equal(finish.operationId,execution.id);
  assert.equal(finish.clientId,clientId);
  assert.equal(finish.payload.patch.feedback.comment,'Entrenamiento completado sin molestias');
  assert.equal(Object.keys(finish.payload.patch.results).length,3);
  assert.equal(draft.blocks[2].plannedPacePer100M,'02:20','Coach targets stay unchanged by observed swim pace');
});

test('M43 integrated: wrong-sport observed units are rejected without creating any result',()=>{
  for(const [sport,input,expected] of [
    ['IBF-NATACION-CROL',{durationMinutes:10,distanceKm:0.4,rpe:7},/M43_SWIM_OBSERVED_UNITS_MISMATCH/],
    ['IBF-NATACION-CROL',{durationMinutes:10,distanceM:400,paceMinPerKm:'06:00',rpe:7},/M43_SWIM_OBSERVED_UNITS_MISMATCH/],
    ['IBF-CARRERA-CONTINUA',{durationMinutes:30,distanceM:5000,rpe:6},/M43_LAND_OBSERVED_UNITS_MISMATCH/],
  ]){
    const {draft,session}=published();
    const scoped={...session,blocks:[draft.blocks.find(b=>b.exerciseId===sport)]};
    const execution=createExecution({session:scoped,clientId,executionId:'bad-'+sport});
    startExecution(execution);
    assert.throws(()=>recordSet(execution,scoped,input),expected);
    assert.equal(Object.keys(execution.results).length,0);
    assert.equal(execution.events.length,1,'an invalid set must not add a completion event');
  }
});

test('M43 integrated: a Coach-led workout remains only a summary for Client, not an autonomous launch',()=>{
  const {session}=published('presencial');
  assert.equal(session.deliveryOwnership,'coach_led');
  assert.equal(session.clientVisibilityLevel,'summary_only');
  const projected=projectCollectionsForRole({sessions:[session]},user).sessions;
  assert.equal(projected.length,1);
  assert.deepEqual(projected[0].blocks,[]);
  assert.equal(clientSessionProjection(projected[0]).canClientStart,false);
  assert.equal(actorCanExecuteSession({role:'client',session}),false);
  assert.equal(actorCanExecuteSession({role:'coach',session}),true);
  assert.equal(actorCanExecuteSession({role:'admin',session}),false);
});
