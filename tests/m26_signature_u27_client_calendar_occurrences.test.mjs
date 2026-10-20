import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildClientPlanningItems,appointmentForSession} from '../src/m26/rc39/session-policy.js';
import {augmentRc39ViewModel} from '../src/m26/rc39/view-model.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {buildAppointmentCommand} from '../src/m26/workflows/agenda-workflow.js';

const CLIENT='10000000-0000-4000-8000-000000000101';
const OTHER='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const session={id:SESSION,clientId:CLIENT,status:'disponible',title:'Fuerza martes',revision:4,
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',clientVisibilityLevel:'full',
  blocks:[{id:'b',type:'exercise',exerciseId:'squat',name:'Sentadilla',sets:3}]};
const appointment=(id,at,props={})=>({
  id,sessionId:SESSION,clientId:CLIENT,status:'confirmada',visibleToClient:true,
  startAt:at,endAt:new Date(Date.parse(at)+3_600_000).toISOString(),modality:'guiada_en_app',...props
});
const a1=appointment('a1','2026-10-20T15:00:00Z');
const a2=appointment('a2','2026-10-27T15:00:00Z');

test('U27 each confirmed appointment is a separate training date without copying Coach prescription',()=>{
  const sessions=[session],appointments=[a2,a1];
  const before=JSON.stringify({sessions,appointments});
  const list=buildClientPlanningItems({sessions,appointments,now:new Date('2026-10-19T14:00:00Z')});
  assert.deepEqual(list.map(x=>x.appointmentId),['a1','a2']);
  assert.deepEqual(list.map(x=>x.id),[SESSION,SESSION]);
  assert.equal(list[0].session,list[1].session,'one canonical prescription, distinct date projections');
  assert.equal(list.every(x=>x.canClientStart&&x.visible),true);
  assert.equal(JSON.stringify({sessions,appointments}),before,'pure projection must not mutate data');
});

test('U27 cancelled, hidden, proposed, cross-client, and unlinked occurrences stay private',()=>{
  const dates=[a1,a2,
    appointment('cancel','2026-11-03T15:00:00Z',{status:'cancelada'}),
    appointment('pending','2026-11-10T15:00:00Z',{status:'propuesta'}),
    appointment('hidden','2026-11-17T15:00:00Z',{visibleToClient:false}),
    appointment('cross-client','2026-11-24T15:00:00Z',{clientId:OTHER}),
    appointment('other-session','2026-12-01T15:00:00Z',{sessionId:OTHER}),
    {...a1},
  ];
  const list=buildClientPlanningItems({sessions:[session],appointments:dates});
  assert.deepEqual(list.map(x=>x.appointmentId),['a1','a2']);
  assert.deepEqual(buildClientPlanningItems({sessions:[{...session,status:'retirado'}],appointments:dates}),[]);
});

test('U27 appointmentless sessions remain available in unscheduled section',()=>{
  const list=buildClientPlanningItems({sessions:[session],appointments:[]});
  assert.equal(list.length,1);
  assert.equal(list[0].appointmentId,null);
  assert.equal(list[0].canClientStart,true);
});

test('U27 Cliente planning renders each Tuesday separately and date navigation',()=>{
  const items=buildClientPlanningItems({sessions:[session],appointments:[a1,a2]});
  const vm={kind:'planificacion',role:'client',rc39:{planningItems:items},
    serviceActive:true,clientAppointments:[],sessionPreviewAssets:{catalog:[],mediaMap:null}};
  const markup=renderRc39Route(vm);
  assert.match(markup,/aria-label="Fechas de entrenamiento programadas"/u);
  assert.match(markup,/data-training-date="2026-10-20"/u);
  assert.match(markup,/data-training-date="2026-10-27"/u);
  assert.equal((markup.match(/data-rc39-session="/gu)||[]).length,2);
  assert.equal((markup.match(/data-appointment-card="/gu)||[]).length,2);
  assert.match(markup,/href="#m26-plan-day-2026-10-27"/u);
  assert.doesNotMatch(markup,/data-training-date="2026-11-03"/u);
});

test('U27 responsive warm calendar maintains inline scrolling and native focus',()=>{
  const css=readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');
  assert.match(css,/\.m26-rc39-date-links\{[^}]*overflow-x:auto/u);
  assert.match(css,/\.m26-rc39-date-links>a:focus-visible/u);
  assert.match(css,/scroll-margin-bottom:calc\(6\.5rem \+ env\(safe-area-inset-bottom\)\)/u);
});


test('U27 Coach agenda can select a published, same-client session for a proposed date',()=>{
  const source=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  const create=source.slice(source.indexOf('async function createAppointment()'),source.indexOf('async function confirmAppointment('));
  assert.match(create,/const sessionId=String\(raw\.sessionId\|\|''\)\.trim\(\)/u);
  assert.match(create,/String\(item\?\.clientId\|\|item\?\.client_id\|\|body\.clientId\|\|body\.client_id\|\|''\)===clientId/u);
  assert.match(create,/draft\.sessionId=sessionId/u);
  assert.match(create,/PUBLISHED_SESSION_STATES\.has\(state\)/u);
  assert.match(create,/buildAppointmentCommand\(draft,0\)/u);
  const coachVm={kind:'agenda',role:'coach',selectedClientId:CLIENT,
    clients:[{id:CLIENT,name:'Cliente QA'}],
    rc39:{sessionProjections:[{
      id:SESSION,clientId:CLIENT,title:'Fuerza martes',visible:true,session,
      }],appointments:[],confirmationOpen:0,changeRequests:0}};
  const html=renderRc39Route(coachVm);
  assert.match(html,/<select name="sessionId"/u);
  assert.match(html,/Vincular sesión publicada/u);
  assert.ok(html.includes('value="'+SESSION+'"'));
  assert.match(html,/data-workflow-action="create-appointment"/u);
});


test('U27 appointment command preserves same-client session ID and starts private',()=>{
  const command=buildAppointmentCommand({
    clientId:CLIENT,sessionId:SESSION,title:'Fuerza martes',
    startAt:a1.startAt,endAt:a1.endAt,modality:'guiada_en_app',location:'',
  });
  assert.equal(command.type,'CITA_CREAR');
  assert.equal(command.entityType,'appointment');
  assert.equal(command.clientId,CLIENT);
  assert.equal(command.payload.appointment.sessionId,SESSION);
  assert.equal(command.payload.appointment.status,'propuesta');
  assert.equal(command.payload.appointment.visibleToClient,false);
});


test('U27 only one day is initially expanded; the remaining dates stay findable',()=>{
  const items=buildClientPlanningItems({sessions:[session],appointments:[a2,a1]});
  const markup=renderRc39Route({kind:'planificacion',role:'client',rc39:{planningItems:items},clientAppointments:[],serviceActive:true,sessionPreviewAssets:{catalog:[]}});
  assert.equal((markup.match(/class="m26-rc39-day-group"/gu)||[]).length,2);
  assert.equal((markup.match(/data-rc39-primary-day="true"/gu)||[]).length,1);
  assert.match(markup,/<summary class="m26-rc39-day-heading">/u);
  assert.match(markup,/data-rc39-date-target="2026-10-20"/u);
  assert.match(markup,/data-rc39-date-target="2026-10-27"/u);
});

test('U27 clicking a calendar date expands its disclosure and restores keyboard focus',async()=>{
  const {createRc39Controller}=await import('../src/m26/rc39/controller.js');
  let focused=0,scrolled=0,prevented=0;
  const summary={focus:()=>{focused++}};
  const day={open:false,querySelector:()=>summary,scrollIntoView:()=>{scrolled++}};
  const handlers=new Map();
  const root={
    addEventListener:(name,handler)=>handlers.set(name,[...(handlers.get(name)||[]),handler]),
    removeEventListener:()=>{},
    querySelector:(selector)=>selector==='#m26-plan-day-2026-10-27'?day:null,
  };
  const store={getState:()=>({identity:{role:'client'},collections:{appointments:[]}})};
  const controller=createRc39Controller({root,store});
  controller.mount();
  const anchor={getAttribute:()=> '2026-10-27'};
  const target={closest:(selector)=>selector==='[data-rc39-date-target]'?anchor:null};
  const event={target,preventDefault:()=>{prevented++}};
  for(const handler of handlers.get('click')||[])await handler(event);
  assert.equal(day.open,true);
  assert.equal(focused,1);
  assert.equal(scrolled,1);
  assert.equal(prevented,1);
  controller.destroy();
});

test('U27 Coach auto-fills selected session duration, modality and prevents cross-client linkage',async()=>{
  const {syncAppointmentFormState}=await import('../src/m26/app/workflow-controller.js');
  const selectedClient={dataset:{clientModality:'presencial',sessionDuration:'60',trainingAddress:'Dirección habitual'}};
  const clientField={value:CLIENT,selectedOptions:[selectedClient]};
  const own={value:SESSION,disabled:false,dataset:{clientId:CLIENT,modality:'guiada_en_app',sessionDuration:'50'}};
  const foreign={value:'foreign-session',disabled:false,dataset:{clientId:OTHER,modality:'presencial',sessionDuration:'45'}};
  const blank={value:'',disabled:false,dataset:{}};
  const sessionField={value:SESSION,options:[blank,own,foreign],get selectedOptions(){return [this.options.find(x=>x.value===this.value)||blank]}};
  const modalityField={value:'',dataset:{}};
  const startField={value:'2026-10-27T10:00'};
  const endField={value:'',dataset:{}};
  const locationField={value:'',dataset:{},setAttribute(){},removeAttribute(){}};
  const inputs={clientId:clientField,sessionId:sessionField,modality:modalityField,startAt:startField,endAt:endField,location:locationField};
  const form={elements:{namedItem:(name)=>inputs[name]||null},querySelector:()=>null};
  const root={querySelector:()=>null};
  const first=syncAppointmentFormState(form,root);
  assert.equal(first.modality,'guiada_en_app');
  assert.equal(first.sessionDurationMinutes,50);
  assert.equal(endField.value,'2026-10-27T10:50');
  assert.equal(foreign.disabled,true);
  assert.equal(own.disabled,false);
  clientField.value=OTHER;
  const second=syncAppointmentFormState(form,root);
  assert.equal(sessionField.value,'','changing client drops previously selected prescription');
  assert.equal(second.modality,'presencial');
  assert.equal(endField.value,'2026-10-27T11:00');
  assert.equal(own.disabled,true);
  assert.equal(foreign.disabled,false);
});


test('U27 appointment selection prioritizes the next confirmed date, never cancelled or internal',()=>{
  const oldConfirmed=appointment('old-confirmed','2026-10-06T15:00:00Z');
  const internal=appointment('private-proposal','2026-10-19T15:00:00Z',{status:'propuesta',visibleToClient:false});
  const cancelled=appointment('cancelled','2026-10-20T15:00:00Z',{status:'cancelada'});
  const nextConfirmed=appointment('next-confirmed','2026-10-27T15:00:00Z');
  const chosen=appointmentForSession([internal,oldConfirmed,cancelled,nextConfirmed],session,new Date('2026-10-19T10:00:00Z'));
  assert.equal(chosen.id,'next-confirmed');
  assert.equal(appointmentForSession([cancelled],session,new Date('2026-10-19T10:00:00Z')),null);
});

test('P0 Client session projections never leak Coach-only appointments before confirmation',()=>{
  const privateProposal=appointment('private-session-proposal','2026-10-20T14:00:00Z',{status:'propuesta',visibleToClient:false});
  const cancelled=appointment('cancelled-session','2026-10-21T14:00:00Z',{status:'cancelada'});
  const confirmed=appointment('visible-confirmed','2026-10-27T14:00:00Z');
  const shellVm={identity:{role:'client',clientId:CLIENT}};
  const state={identity:{role:'client',clientId:CLIENT},selectedClientId:null,
    collections:{sessions:[session],appointments:[privateProposal,cancelled,confirmed]}};
  const view=augmentRc39ViewModel({kind:'sesion',role:'client'},shellVm,state,new Date('2026-10-19T10:00:00Z'));
  assert.deepEqual(view.rc39.appointments.map(x=>x.id),['visible-confirmed']);
  assert.deepEqual(view.rc39.sessionProjections.map(x=>x.appointmentId),['visible-confirmed']);
  assert.deepEqual(view.rc39.planningItems.map(x=>x.appointmentId),['visible-confirmed']);
  const hidden=augmentRc39ViewModel({kind:'sesion',role:'client'},shellVm,{
    ...state,collections:{...state.collections,appointments:[privateProposal,cancelled]},
  },new Date('2026-10-19T10:00:00Z'));
  assert.equal(hidden.rc39.sessionProjections[0].appointmentId,null);
  assert.equal(hidden.rc39.appointments.length,0);
});



test('U27 Sessions surface shows dated occurrences instead of accumulated session cards',()=>{
  const items=buildClientPlanningItems({sessions:[session],appointments:[a1,a2]});
  const vm={kind:'sesion',role:'client',serviceActive:true,rc39:{
    planningItems:items,
    sessionProjections:[items[0]],
  },sessionPreviewAssets:{catalog:[]}};
  const markup=renderRc39Route(vm);
  assert.match(markup,/data-m27-session-surface="sessions"/u);
  assert.match(markup,/aria-label="Fechas de entrenamiento programadas"/u);
  assert.match(markup,/data-training-date="2026-10-20"/u);
  assert.match(markup,/data-training-date="2026-10-27"/u);
  assert.equal((markup.match(/data-rc39-session="/gu)||[]).length,2);
  assert.equal((markup.match(/data-rc39-primary-day="true"/gu)||[]).length,1);
});
