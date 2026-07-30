import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {buildConfirmAppointmentCommand} from '../src/m26/workflows/agenda-workflow.js';
import {createSessionDraft,addCatalogExercise,acceptSessionPreview,buildPublishSessionCommand} from '../src/m26/workflows/session-builder.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {renderAgendaRoute,renderIriRoute,renderPlanningRoute} from '../src/m26/modules/route-render.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('alta de cliente explica campos obligatorios, conserva el formulario y enfoca el primer error',()=>{
  const source=read('src/m26/app/workflow-controller.js');
  assert.match(source,/ONBOARDING_FIELD_LABELS/);
  assert.match(source,/M26_CLIENT_ONBOARDING_INVALID/);
  assert.match(source,/Completa los datos obligatorios del expediente/);
  assert.match(source,/aria-invalid/);
  assert.match(source,/scrollIntoView/);
  assert.doesNotMatch(source,/form\.reportValidity/);
  const routeSource=read('src/m26/modules/route-render.js');
  assert.match(routeSource,/data-workflow-form="client-onboarding"[^>]*novalidate/);
  const createBlock=source.slice(source.indexOf('async function createClient()'),source.indexOf('async function completeIri()'));
  assert.doesNotMatch(createBlock,/form\.reset/);
});

test('IRI reutiliza objetivos, material y entrevista capturados durante el alta',()=>{
  const html=renderIriRoute({
    current:{id:'IRI-1',clientId:'CLIENT-1',body:{id:'IRI-1',clientId:'CLIENT-1'}},
    currentSummary:{coverageCount:0,coverageLabel:'0 de 3 dominios de resultado registrados',processLabel:'Evaluación no iniciada',confirmed:false,domains:{cardiovascular:false,bodyComposition:false,strength:false}},
    profile:{birthDate:'1990-01-01',sexForNorms:'female',sexForNormsLabel:'Mujer',email:'qa@iberfit.cl',phone:'+56911111111',modality:'presencial',modalityLabel:'Presencial',trainingAddress:'Apoquindo 3000',commune:'Las Condes',weeklyFrequency:2,sessionDurationMinutes:60},
    sourceProfile:{primaryObjective:'Mejorar fuerza general',secondaryObjectives:['Movilidad','Adherencia'],equipment:['TRX','Mancuernas'],experienceLevel:'Intermedia',trainingHistory:'Un año de entrenamiento funcional',currentTraining:'Dos sesiones semanales',preferredSchedule:'Martes y jueves',restrictions:'Ninguna conocida',pain:'Sin dolor actual'},
    canEdit:true,
    history:[],
  });
  assert.match(html,/<textarea name="primaryObjective"[^>]*>Mejorar fuerza general<\/textarea>/);
  assert.match(html,/<textarea name="equipment"[^>]*>TRX, Mancuernas<\/textarea>/);
  assert.match(html,/<option value="Intermedia" selected>Intermedia<\/option>/);
  assert.match(html,/name="availability"[^>]*value="Martes y jueves"/);
  assert.match(html,/<textarea name="trainingHistory"[^>]*>Un año de entrenamiento funcional<\/textarea>/);
  assert.match(html,/<textarea name="currentPain"[^>]*>Sin dolor actual<\/textarea>/);
});

test('edición de planificación conserva fechas, modalidad, frecuencia y duración',()=>{
  const html=renderPlanningRoute({
    role:'coach',canEdit:true,cycles:[],sessions:[],cycleCounts:{approved:0},sessionCounts:{published:0},
    currentCycle:{id:'PLAN-1',body:{name:'Ciclo inicial',startDate:'2026-07-30',endDate:'2026-08-27',modality:'presencial',weeklyFrequency:3,sessionDurationMinutes:55,goal:'Mejorar fuerza'}},
  });
  assert.match(html,/name="startDate" value="2026-07-30"/);
  assert.match(html,/name="endDate" value="2026-08-27"/);
  assert.match(html,/<option value="presencial" selected>Presencial<\/option>/);
  assert.match(html,/name="weeklyFrequency"[^>]*value="3"/);
  assert.match(html,/name="sessionDurationMinutes"[^>]*value="55"/);
  assert.match(html,/<textarea name="goal"[^>]*>Mejorar fuerza<\/textarea>/);
});

test('agenda permite confirmar una propuesta al Coach y no expone el control al Cliente',()=>{
  const appointment={id:'APT-1',clientId:'CLIENT-1',dateLabel:'30 jul 2026, 12:00',title:'Sesión IBERFIT',status:'Propuesta',statusRaw:'propuesta',modality:'Presencial',location:'Apoquindo 3000',revision:2};
  const coach=renderAgendaRoute({role:'coach',appointments:[appointment],clients:[],selectedClientId:null});
  const client=renderAgendaRoute({role:'client',appointments:[appointment],clients:[],selectedClientId:null});
  assert.match(coach,/data-workflow-action="confirm-appointment"/);
  assert.match(coach,/Al confirmar será visible para el cliente/);
  assert.doesNotMatch(client,/data-workflow-action="confirm-appointment"/);
});

test('comando de confirmación de cita publica el estado correcto y conserva revisión',()=>{
  const command=buildConfirmAppointmentCommand({clientId:'CLIENT-1',appointmentId:'APT-1'},4);
  assert.equal(command.type,'CITA_CONFIRMAR');
  assert.equal(command.entityType,'appointment');
  assert.equal(command.entityId,'APT-1');
  assert.equal(command.clientId,'CLIENT-1');
  assert.equal(command.baseRevision,4);
  assert.equal(command.payload.patch.status,'confirmada');
  assert.equal(command.payload.patch.visibleToClient,true);
  assert.ok(command.payload.patch.confirmedAt);
});

test('Informes no habilita el editor con un IRI que sigue siendo borrador',()=>{
  const shell={activeArea:'informes',identity:{role:'coach'}};
  const state={identity:{role:'coach'},selectedClientId:'CLIENT-1',collections:{clients:[{id:'CLIENT-1',name:'QA'}],iriAssessments:[{id:'IRI-DRAFT',clientId:'CLIENT-1',status:'Borrador',body:{id:'IRI-DRAFT',clientId:'CLIENT-1'}}],reports:[]}};
  const vm=createRouteViewModel(shell,state,new Date('2026-07-30T12:00:00Z'));
  assert.equal(vm.latestIri,null);
});


test('publicar sesión transforma explícitamente el borrador en contenido visible para Cliente',()=>{
  const records=JSON.parse(read('baseline_m25_2/exercise-catalog-m25.json'));
  const catalog=createExerciseCatalog(records);
  const draft=createSessionDraft({clientId:'CLIENT-RC36'});
  addCatalogExercise(draft,catalog.list()[0].id,catalog,{sets:2,reps:'10'});
  acceptSessionPreview(draft,catalog);
  const command=buildPublishSessionCommand(draft,catalog,3);
  assert.equal(command.type,'SESION_PUBLICAR');
  assert.equal(command.baseRevision,3);
  assert.equal(command.payload.patch.status,'published');
  assert.equal(command.payload.patch.visibleToClient,true);
  assert.match(command.payload.patch.publishedAt,/^\d{4}-\d{2}-\d{2}T/);
  assert.equal(draft.status,'draft','el borrador local no se muta antes del ACK');
});


test('el cambio de identidad elimina mensajes operativos anteriores y una sesión terminada no bloquea la navegación',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  const application=read('src/m26/app/application.js');
  assert.match(workflow,/function clearAllStatuses/);
  assert.match(workflow,/clearAllStatuses\(root\)/);
  assert.match(application,/\['completed','cancelled'\]\.includes\(terminalStatus\)/);
  assert.match(application,/sessionUi=null;return/);
});
