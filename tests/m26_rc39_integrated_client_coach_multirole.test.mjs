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
test('Coach y Admin pueden ejecutar todas; Cliente solo autónomas completas',()=>{
  assert.equal(actorCanExecuteSession({role:'coach',session:presencial,appointment}),true);
  assert.equal(actorCanExecuteSession({role:'admin',session:presencial,appointment}),true);
  assert.equal(actorCanExecuteSession({role:'client',session:presencial,appointment}),false);
  assert.equal(actorCanExecuteSession({role:'client',session:autonomous}),true);
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
