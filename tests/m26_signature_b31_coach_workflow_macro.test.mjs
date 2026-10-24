import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRouteView} from '../src/m26/modules/route-render.js';
const booking=(i,status='propuesta')=>({id:'booking-'+i,dateLabel:'Sábado 18:00',title:'Cita '+i,modality:'Presencial',statusRaw:status,status:status==='propuesta'?'Propuesta':'Confirmada',sessionId:'session-'+i,clientId:'client-'+i});
const client=i=>({id:'client-'+i,name:'Cliente '+i,serviceActive:true});
const coach=(rest={})=>({kind:'hoy',role:'coach',clients:[],appointments:[],upcoming:[],proposals:[],operations:{},coachCockpit:{totalClients:0,attentionCount:0,items:[]},...rest});
const count=(html,value)=>html.split(value).length-1;
test('Coach Hoy groups 40 appointments with 4 visible and retains every action',()=>{
  const appointments=Array.from({length:40},(_,i)=>booking(i+1,'confirmada'));
  const html=renderRouteView(coach({appointments}));
  assert.equal(count(html,'class="m26-list-card m26-appointment-card"'),40);
  assert.match(html,/data-coach-records-archive="hoy"/u);
  assert.equal(count(html,'data-coach-records-batch'),2);
  assert.ok(html.indexOf('Cita 4')<html.indexOf('data-coach-records-archive="hoy"'));
  assert.ok(html.indexOf('Cita 5')>html.indexOf('data-coach-records-archive="hoy"'));
});
test('Past confirmed Coach appointments never render stale Start controls',()=>{
  const appointments=Array.from({length:25},(_,i)=>booking(i+1,'confirmada'));
  const html=renderRouteView(coach({appointments,clients:appointments.map((_,i)=>client(i+1))}));
  assert.equal(count(html,'class="m26-list-card m26-appointment-card"'),25);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/u);
});
test('Only confirmed upcoming appointment retains native Start even if archived',()=>{
  const appointments=Array.from({length:22},(_,i)=>booking(i+1,'confirmada'));
  const html=renderRouteView(coach({appointments,upcoming:[appointments[7]],clients:appointments.map((_,i)=>client(i+1))}));
  assert.equal(count(html,'data-workflow-action="start-published-session"'),1);
  assert.match(html,/data-entity-id="session-8"/u);
});
test('All 42 Coach priorities remain accessible inside native groups',()=>{
  const items=Array.from({length:42},(_,i)=>({kind:'warning',clientId:'client-'+i,clientName:'Cliente '+i,reason:'Revisión '+i}));
  const html=renderRouteView(coach({clients:[client(1)],coachCockpit:{totalClients:42,attentionCount:42,items}}));
  assert.equal(count(html,'class="m26-list-card m26-coach-priority-card"'),42);
  assert.match(html,/data-coach-records-archive="prioridades"/u);
  assert.match(html,/Gestionar cartera completa/u);
});
test('Coach Agenda keeps all 46 proposals and 46 confirmation actions',()=>{
  const appointments=Array.from({length:46},(_,i)=>booking(i+1));
  const html=renderRouteView({kind:'agenda',role:'coach',clients:[],appointments});
  assert.equal(count(html,'class="m26-list-card m26-appointment-card"'),46);
  assert.equal(count(html,'data-workflow-action="confirm-appointment"'),46);
  assert.match(html,/data-coach-records-archive="agenda"/u);
  assert.equal(count(html,'data-coach-records-batch'),3);
  assert.match(html,/data-workflow-form="appointment"/u);
});
test('Admin Agenda is unchanged and all controls remain mounted',()=>{
  const appointments=Array.from({length:22},(_,i)=>booking(i+1));
  const html=renderRouteView({kind:'agenda',role:'admin',clients:[],appointments});
  assert.equal(count(html,'class="m26-list-card m26-appointment-card"'),22);
  assert.equal(count(html,'data-workflow-action="confirm-appointment"'),22);
  assert.doesNotMatch(html,/data-coach-records-archive/u);
});
test('Coach Sessions explains missing start readiness and retains recovery',()=>{
  const html=renderRouteView({kind:'sesion',role:'coach',clients:[],sessions:[],canBuild:false,selectedClientId:null,clientContext:null,serviceKind:'training',serviceActive:true,sessionCounts:{published:0},nextSessionPreparation:null});
  assert.match(html,/data-coach-start-readiness/u);
  assert.match(html,/No hay una sesión iniciable/u);
  assert.match(html,/data-m26-area="planificacion"/u);
  assert.match(html,/data-workflow-action="start-published-session"[^>]*disabled/u);
});
test('Native archive and blocked-state contract is Coach-only and keyboard safe',()=>{
  const source=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  assert.match(source,/function renderCoachProgressiveRecords/u);
  assert.match(source,/renderCoachProgressiveRecords\(vm\.appointments/u);
  assert.match(source,/coachStartReadiness/u);
  assert.match(css,/m26-coach-records-archive/u);
  assert.match(css,/m26-coach-start-readiness button:focus-visible/u);
});
