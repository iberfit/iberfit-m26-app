import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {
  appointmentConfirmationState,
  actorCanExecuteSession,
  buildClientPlanningItems,
  clientSessionProjection,
  sessionVisibilityLevel,
  sessionRequiresConfirmedAppointment,
} from '../src/m26/rc39/session-policy.js';
import {
  appointmentCalendarEvent,
  buildIcs,
  googleCalendarUrl,
} from '../src/m26/rc39/calendar.js';
import {
  normalizeAuthorizedRoles,
  withActiveRole,
} from '../src/m26/rc39/multi-role.js';
import {
  buildClientConfirmAppointmentCommand,
} from '../src/m26/rc39/agenda-extension.js';
import {createRc39Transport,mergeRc39ChangeRequests} from '../src/m26/rc39/transport.js';
import {projectIdentityForRole} from '../src/m26/security/role-projection.js';
import {M26_ACTION_REGISTRY,assertActionAllowed,auditInteractiveMarkup} from '../src/m26/ui/interactive-audit.js';
import {
  createExecution,startExecution,recordSet,correctSet,addExecutionSet,
  skipExecutionSet,skipExecutionExercise,addExecutionExercise,substituteExercise,
} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {renderHoyRoute,renderSessionsRoute} from '../src/m26/modules/route-render.js';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const start='2026-08-03T18:00:00-04:00';
const end='2026-08-03T19:00:00-04:00';
const appointment={id:'a1',clientId:'c1',sessionId:'s-presencial',startAt:start,endAt:end,modality:'presencial',location:'Las Condes',status:'confirmada',revision:2};
const presencial={id:'s-presencial',clientId:'c1',title:'Fuerza presencial',status:'publicado',clientVisibilityLevel:'summary_only',deliveryOwnership:'coach_led',deliveryModality:'presencial',blocks:[{name:'Privado'}]};
const autonomous={id:'s-auto',clientId:'c1',title:'Fuerza autónoma',status:'publicado',clientVisibilityLevel:'full',deliveryOwnership:'client_autonomous',deliveryModality:'guiada_en_app',blocks:[{name:'Sentadilla',sets:3,reps:'10'}]};

test('híbrido ve presencial como resumen y autónoma completa',()=>{
  const items=buildClientPlanningItems({sessions:[presencial,autonomous],appointments:[appointment],now:'2026-08-01T18:00:00-04:00'});
  assert.equal(items.length,2);
  assert.equal(items.find((item)=>item.id==='s-presencial').canClientExecute,false);
  assert.equal(items.find((item)=>item.id==='s-auto').canClientExecute,true);
  assert.equal(sessionVisibilityLevel(presencial,appointment),'summary_only');
});
test('Coach ejecuta coach-led; Admin debe cambiar explícitamente a Coach; Cliente solo autónomas completas',()=>{
  assert.equal(actorCanExecuteSession({role:'coach',session:presencial,appointment}),true);
  assert.equal(actorCanExecuteSession({role:'admin',session:presencial,appointment}),false);
  assert.equal(actorCanExecuteSession({role:'client',session:presencial,appointment}),false);
  assert.equal(actorCanExecuteSession({role:'client',session:autonomous}),true);
  assert.equal(sessionRequiresConfirmedAppointment({role:'admin',session:presencial,appointment}),false);
  assert.equal(sessionRequiresConfirmedAppointment({role:'coach',session:autonomous}),false);
  assert.equal(sessionRequiresConfirmedAppointment({role:'coach',session:presencial,appointment}),true);
});
test('confirmación se abre exactamente 48 horas antes y cierra dos horas antes',()=>{
  assert.equal(appointmentConfirmationState(appointment,'2026-08-01T17:59:59-04:00').state,'not_open');
  assert.equal(appointmentConfirmationState(appointment,'2026-08-01T18:00:00-04:00').state,'open');
  assert.equal(appointmentConfirmationState(appointment,'2026-08-03T16:00:00-04:00').state,'closed');
});
test('calendario mantiene UID estable y dos recordatorios',()=>{
  const event=appointmentCalendarEvent(appointment);
  const ics=buildIcs(event);
  assert.match(ics,/UID:appointment-a1@iberfit\.cl/);
  assert.match(ics,/TRIGGER:-PT24H/);
  assert.match(ics,/TRIGGER:-PT1H/);
  assert.match(googleCalendarUrl(event),/^https:\/\/calendar\.google\.com\/calendar\/render\?/);
});
test('confirmación Cliente conserva cita, revisión y la solicitud se proyecta',()=>{
  const confirm=buildClientConfirmAppointmentCommand({clientId:'c1',appointmentId:'a1',startAt:start},2,()=>new Date('2026-08-01T18:00:00-04:00'));
  assert.equal(confirm.type,'CITA_CONFIRMAR');
  assert.equal(confirm.baseRevision,2);
  const merged=mergeRc39ChangeRequests([appointment],[{id:'r1',appointmentId:'a1',status:'pending',reason:'Necesito una hora posterior',createdAt:'2026-08-01T18:00:00Z'}]);
  assert.equal(merged[0].changeRequest.status,'pending');
  assert.match(merged[0].changeRequest.reason,/hora posterior/);
});
test('Carlos puede elegir Coach o Admin sin inventar roles',()=>{
  const identity={email:'iberfit.cl@gmail.com',role:'coach',authorizedRoles:['coach','admin']};
  assert.deepEqual(normalizeAuthorizedRoles(identity),['coach','admin']);
  assert.equal(withActiveRole(identity,'admin').role,'admin');
  assert.throws(()=>withActiveRole(identity,'client'),/M26_ROLE_SWITCH_FORBIDDEN/);
});

test('extensión backend falla cerrada y no rompe el login cuando aún no está instalada',async()=>{
  const fetchImpl=async()=>({
    ok:false,status:404,
    headers:{get:()=> 'application/json'},
    json:async()=>({code:'PGRST202',message:'Could not find the function'}),
  });
  const transport=createRc39Transport({
    runtime:{url:'https://pjhmrhejsoofmouedavw.supabase.co',publishableKey:'publishable-test',version:'26.0.0-canary.39'},
    fetchImpl,
  });
  const out=await transport.extensions('jwt-test');
  assert.equal(out.rolesAvailable,false);
  assert.equal(out.changeRequestsAvailable,false);
});

test('integración protege bloques summary_only y elimina navegación duplicada',()=>{
  const projection=read('src/m26/security/role-projection.js');
  const css=read('src/m26/rc39/rc39.css');
  assert.match(projection,/summary_only/);
  assert.match(projection,/out\.blocks=visibility==='summary_only'\?\[\]:safeSessionBlocks\(record\)/);
  assert.match(css,/\.m26-shell\[data-m26-role="client"\] \.m26-mobile-nav\{display:none!important\}/);
});
test('responsive RC39 cubre teléfono, tablet, safe-area y accesibilidad',()=>{
  const css=read('src/m26/rc39/rc39.css');
  assert.match(css,/@media \(min-width:720px\) and \(max-width:1179px\)/);
  assert.match(css,/@media \(max-width:719px\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/prefers-reduced-transparency:reduce/);
  assert.match(css,/scroll-padding-bottom/);
  assert.match(css,/min-height:44px/);
});

test('app monta controlador RC39 y exige política de ejecución',()=>{
  const application=read('src/m26/app/application.js');
  assert.match(application,/createRc39Controller/);
  assert.match(application,/actorCanExecuteSession/);
  assert.match(application,/sessionRequiresConfirmedAppointment/);
});

test('RC39 conserva el Hoy canónico y sus garantías operativas',()=>{
  const rc39Renderer=read('src/m26/rc39/route-render.js');
  const canonicalRenderer=read('src/m26/modules/route-render.js');
  assert.doesNotMatch(rc39Renderer,/vm\.kind===['"]hoy['"]/);
  assert.match(canonicalRenderer,/Prioridades de hoy/);
  assert.match(canonicalRenderer,/Ningún cambio se muestra como confirmado/);
  assert.match(canonicalRenderer,/Sesiones confirmadas hoy/);
});

test('roles múltiples no amplían la identidad proyectada del Cliente',()=>{
  const projectedClient=projectIdentityForRole({
    id:'u-client',role:'client',clientId:'c1',name:'Cliente',email:'cliente@example.com',
    authorizedRoles:['client','coach'],roleChoiceConfirmed:true,
  });
  assert.deepEqual(Object.keys(projectedClient).sort(),['clientId','email','id','name','role'].sort());
  const projectedCoach=projectIdentityForRole({
    id:'u-coach',role:'coach',name:'Carlos',email:'iberfit.cl@gmail.com',
    authorizedRoles:['coach','admin'],roleChoiceConfirmed:true,
  });
  assert.deepEqual(projectedCoach.authorizedRoles,['coach','admin']);
  assert.equal(projectedCoach.roleChoiceConfirmed,true);
});


/* RC74.1.2 LIVE SESSION P0 */
const coachActor=Object.freeze({role:'coach',userId:'coach-live'});
const clientActor=Object.freeze({role:'client',userId:'client-live',clientId:'c-live'});
const liveCatalog=Object.freeze({
  has(id){return ['ex-a','ex-b','ex-c'].includes(id);},
  get(id){return this.has(id)?{id,name_es:({'ex-a':'Sentadilla','ex-b':'Remo','ex-c':'Press'})[id],pattern:'general',cues:['Control técnico']}:null;},
  search(){return ['ex-a','ex-b','ex-c'].map((id)=>this.get(id));},
});
function liveSession(){
  return {
    id:'s-live',clientId:'c-live',title:'Fuerza Live',status:'published',
    clientVisibilityLevel:'summary_only',deliveryOwnership:'coach_led',deliveryModality:'presencial',
    blocks:[
      {id:'b-a',type:'exercise',exerciseId:'ex-a',sets:2,reps:'10',restSeconds:60,tempo:'controlado',targetRpe:7,targetRir:3},
      {id:'b-b',type:'exercise',exerciseId:'ex-b',sets:2,reps:'8',restSeconds:75,tempo:'controlado',targetRpe:7,targetRir:3},
    ],
  };
}
function liveExecution(){
  const session=liveSession();
  const execution=createExecution({session,clientId:'c-live',executionId:'exec-live'});
  startExecution(execution,{actor:coachActor});
  return {session,execution};
}
test('RC74.1.2 Hoy Coach expone inicio directo de la cita confirmada',()=>{
  const html=renderHoyRoute({
    role:'coach',clients:[],
    appointments:[{id:'a-live',sessionId:'s-live',dateLabel:'10:00',title:'Cliente · Fuerza Live',modality:'Presencial',location:'Las Condes',status:'Confirmada',statusRaw:'confirmada'}],
    proposals:[],upcoming:[],operations:{pending:0,conflicts:0,rejected:0},coachCockpit:null,
  });
  assert.match(html,/data-workflow-action="start-published-session"/u);
  assert.match(html,/Iniciar entrenamiento/u);
});
test('RC74.1.2 Sesiones Coach conserva constructor y añade inicio directo',()=>{
  const html=renderSessionsRoute({role:'coach',canBuild:true,sessions:[],executions:[],sessionCounts:{published:0}});
  assert.match(html,/Continuar o crear sesión/u);
  assert.match(html,/Iniciar sesión programada/u);
  assert.match(html,/data-workflow-action="start-published-session"/u);
});
test('RC74.1.2 eventos de serie y sustitución conservan actor y plan original',()=>{
  const {session,execution}=liveExecution();
  const planned=structuredClone(session.blocks);
  recordSet(execution,session,{reps:10,load:'20 kg',rpe:7,rir:3,actor:coachActor});
  assert.equal(execution.events.find((event)=>event.type==='SET_COMPLETED').actor.role,'coach');
  assert.throws(()=>recordSet(execution,session,{reps:9,rpe:8,actor:coachActor}),/M26_EXECUTION_SET_ALREADY_RECORDED/);
  correctSet(execution,session,{reps:9,load:'20 kg',rpe:8,rir:2,actor:coachActor});
  const corrected=execution.events.find((event)=>event.type==='SET_CORRECTED');
  assert.equal(corrected.actor.userId,'coach-live');
  assert.equal(corrected.payload.before.reps,10);
  assert.equal(corrected.payload.after.reps,9);
  assert.deepEqual(session.blocks,planned);
});
test('RC74.1.2 añadir serie es desviación de ejecución y exige Coach',()=>{
  const {session,execution}=liveExecution();
  const plannedSets=session.blocks[0].sets;
  assert.throws(()=>addExecutionSet(execution,{actor:clientActor}),/M26_EXECUTION_COACH_ACTION_REQUIRED/);
  addExecutionSet(execution,{actor:coachActor});
  assert.equal(execution.queue[0].sets,plannedSets+1);
  assert.equal(session.blocks[0].sets,plannedSets);
  assert.equal(execution.events.find((event)=>event.type==='SET_ADDED').actor.role,'coach');
});
test('RC74.1.2 saltar serie exige motivo y avanza sin inventar resultado',()=>{
  const {session,execution}=liveExecution();
  assert.throws(()=>skipExecutionSet(execution,session,{actor:clientActor}),/M26_EXECUTION_SKIP_SET_REASON_REQUIRED/);
  skipExecutionSet(execution,session,{reason:'Molestia puntual',actor:clientActor});
  assert.equal(execution.results['ex-a:1'],undefined);
  assert.equal(execution.skippedSets['ex-a:1'].reason,'Molestia puntual');
  assert.equal(execution.setIndex,1);
  assert.equal(execution.events.find((event)=>event.type==='SET_SKIPPED').actor.role,'client');
});
test('RC74.1.2 saltar ejercicio registra las series restantes y conserva el plan',()=>{
  const {session,execution}=liveExecution();
  const planned=structuredClone(session.blocks);
  skipExecutionExercise(execution,session,{reason:'Equipo no disponible',actor:coachActor});
  assert.equal(execution.index,1);
  assert.equal(Object.keys(execution.skippedSets).length,2);
  assert.equal(execution.skippedExercises[0].reason,'Equipo no disponible');
  assert.deepEqual(session.blocks,planned);
});
test('RC74.1.2 añadir ejercicio en vivo exige Coach y no modifica sesión publicada',()=>{
  const {session,execution}=liveExecution();
  const planned=structuredClone(session.blocks);
  assert.throws(()=>addExecutionExercise(execution,{exerciseId:'ex-c',catalog:liveCatalog,sets:1,reps:'10',restSeconds:60,tempo:'controlado',targetRpe:7,targetRir:3,actor:clientActor}),/M26_EXECUTION_COACH_ACTION_REQUIRED/);
  addExecutionExercise(execution,{exerciseId:'ex-c',catalog:liveCatalog,sets:2,reps:'10',restSeconds:60,tempo:'controlado',targetRpe:7,targetRir:3,actor:coachActor});
  assert.equal(execution.queue[1].exerciseId,'ex-c');
  assert.equal(execution.queue[1].liveAdded,true);
  assert.deepEqual(session.blocks,planned);
});
test('RC74.1.2 sustitución conserva actor, motivo y sesión planificada',()=>{
  const {session,execution}=liveExecution();
  const planned=structuredClone(session.blocks);
  substituteExercise(execution,session,{fromExerciseId:'ex-a',toExerciseId:'ex-c',catalog:liveCatalog,reason:'Equipo ocupado',actor:coachActor});
  const event=execution.events.find((item)=>item.type==='EXERCISE_SUBSTITUTED');
  assert.equal(event.actor.role,'coach');
  assert.equal(event.payload.reason,'Equipo ocupado');
  assert.equal(execution.queue[0].exerciseId,'ex-c');
  assert.deepEqual(session.blocks,planned);
});
test('RC74.1.2 Session Live Coach expone adaptaciones sin convertirlas en plan futuro',()=>{
  const {session,execution}=liveExecution();
  let html=renderGuidedExecution({execution,session,catalog:liveCatalog,role:'coach'});
  assert.match(html,/data-session-action="add-set"/u);
  assert.match(html,/data-session-action="skip-set"/u);
  assert.match(html,/data-session-action="skip-exercise"/u);
  assert.match(html,/data-session-action="add-live-exercise"/u);
  assert.match(html,/no modifican el plan futuro/u);
  recordSet(execution,session,{reps:10,load:'20 kg',rpe:7,rir:3,actor:coachActor});
  html=renderGuidedExecution({execution,session,catalog:liveCatalog,role:'coach'});
  assert.match(html,/data-session-action="correct-set"/u);
  assert.match(html,/corrección queda registrada como un evento distinto/u);
});
test('RC74.1.2 registro interactivo cubre Live Session y Admin no hereda ejecución Coach',()=>{
  for(const action of ['start','complete-set','correct-set','previous','next','rest-minus','rest-plus','substitute','pause','resume','cancel','finish','skip-set','skip-exercise']){
    assert.equal(Boolean(M26_ACTION_REGISTRY[action]),true,'Falta '+action);
    assert.equal(assertActionAllowed(action,'coach'),true,action+' debe permitir Coach');
    assert.equal(assertActionAllowed(action,'admin'),false,action+' no debe permitir Admin');
  }
  for(const action of ['add-set','add-live-exercise']){
    assert.equal(Boolean(M26_ACTION_REGISTRY[action]),true,'Falta '+action);
    assert.equal(assertActionAllowed(action,'coach'),true);
    assert.equal(assertActionAllowed(action,'client'),false);
    assert.equal(assertActionAllowed(action,'admin'),false);
  }
  assert.equal(assertActionAllowed('start-published-session','coach'),true);
  assert.equal(assertActionAllowed('start-published-session','client'),true);
  assert.equal(assertActionAllowed('start-published-session','admin'),false);
  const {session,execution}=liveExecution();
  const coachMarkup=renderGuidedExecution({execution,session,catalog:liveCatalog,role:'coach'});
  assert.deepEqual(auditInteractiveMarkup(coachMarkup).errors,[]);
  assert.equal(auditInteractiveMarkup(coachMarkup).ok,true);
});
test('RC74.1.2 aplicación pasa identidad activa al controlador de ejecución',()=>{
  const application=read('src/m26/app/application.js');
  const controller=read('src/m26/workflows/session-controller.js');
  assert.match(application,/actor:\{userId:/u);
  assert.match(application,/role:String\(store\.getState\(\)\.identity\?\.role/u);
  for(const action of ['correct-set','add-set','skip-set','skip-exercise','add-live-exercise']){
    assert.match(controller,new RegExp(`case '${action}'`,'u'));
  }
});
