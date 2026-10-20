import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildClientPlanningItems} from '../src/m26/rc39/session-policy.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';

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
