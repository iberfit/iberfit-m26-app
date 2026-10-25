import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildClientPlanningItems} from '../src/m26/rc39/session-policy.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';

const CLIENT='10000000-0000-4000-8000-000000000101';
const OTHER='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const source={id:SESSION,clientId:CLIENT,status:'disponible',title:'Fuerza martes',revision:4,
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  visibleToClient:true,clientVisibilityLevel:'full',
  blocks:[{id:'b',type:'exercise',exerciseId:'squat',name:'Sentadilla',sets:3}]};
const appointment=(id,at,override={})=>({
  id,sessionId:SESSION,clientId:CLIENT,status:'confirmada',visibleToClient:true,
  startAt:at,endAt:new Date(Date.parse(at)+3_600_000).toISOString(),
  modality:'guiada_en_app',...override
});
const a1=appointment('tuesday-a','2026-10-20T15:00:00Z');
const a2=appointment('tuesday-b','2026-10-27T15:00:00Z');
const view=(items)=>({kind:'planificacion',role:'client',rc39:{planningItems:items},
  clientAppointments:[],serviceActive:true,sessionPreviewAssets:{catalog:[]}});

test('U35 Client calendar shows two dates with one canonical prescription, never two legacy starts',()=>{
  const before=JSON.stringify([source,a1,a2]);
  const items=buildClientPlanningItems({sessions:[source],appointments:[a2,a1]});
  assert.deepEqual(items.map(item=>item.appointmentId),['tuesday-a','tuesday-b']);
  assert.deepEqual(items.map(item=>item.id),[SESSION,SESSION]);
  assert.equal(items[0].session,items[1].session);
  assert.equal(items.every(item=>item.recurringAwaitingActivation&&item.canClientStart===false),true);
  assert.equal(JSON.stringify([source,a1,a2]),before);
  const html=renderRc39Route(view(items));
  assert.match(html,/data-training-date="2026-10-20"/);
  assert.match(html,/data-training-date="2026-10-27"/);
  assert.equal((html.match(/data-rc39-session="/g)||[]).length,2);
  assert.equal((html.match(/data-workflow-action="start-published-session"/g)||[]).length,0);
  assert.match(html,/1 sesión publicada/);
  assert.match(html,/2 fechas programadas/);
  assert.match(html,/El inicio independiente por fecha/);
});

test('U35 private, cancelled, cross-client and duplicate appointment rows never leak to calendar',()=>{
  const items=buildClientPlanningItems({sessions:[source],appointments:[
    a1,a2,{...a1},
    appointment('cancelled','2026-11-03T15:00:00Z',{status:'cancelada'}),
    appointment('proposal','2026-11-10T15:00:00Z',{status:'propuesta'}),
    appointment('hidden','2026-11-17T15:00:00Z',{visibleToClient:false}),
    appointment('other-client','2026-11-24T15:00:00Z',{clientId:OTHER}),
    appointment('other-session','2026-12-01T15:00:00Z',{sessionId:OTHER})
  ]});
  assert.deepEqual(items.map(x=>x.appointmentId),['tuesday-a','tuesday-b']);
  const html=renderRc39Route(view(items));
  assert.doesNotMatch(html,/data-training-date="2026-11-03"/);
  assert.doesNotMatch(html,/data-training-date="2026-11-10"/);
});

test('U35 existing single guided appointment keeps legitimate legacy start, unscheduled plans remain',()=>{
  const one=buildClientPlanningItems({sessions:[source],appointments:[a1]});
  assert.equal(one.length,1);
  assert.equal(one[0].canClientStart,true);
  assert.equal(one[0].recurringAwaitingActivation,false);
  const unscheduled=buildClientPlanningItems({sessions:[source],appointments:[]});
  assert.equal(unscheduled.length,1);
  assert.equal(unscheduled[0].appointmentId,null);
  assert.equal(unscheduled[0].canClientStart,true);
  assert.match(renderRc39Route(view(unscheduled)),/Sesiones sin fecha asignada/);
});

test('U35 date navigation is keyboard accessible, responsive and not a phantom button',()=>{
  const html=renderRc39Route(view(buildClientPlanningItems({sessions:[source],appointments:[a1,a2]})));
  assert.match(html,/aria-label="Fechas de entrenamiento programadas"/);
  assert.match(html,/data-rc39-date-target="2026-10-20"/);
  assert.equal((html.match(/data-rc39-primary-day="true"/g)||[]).length,1);
  const css=readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/m26/rc39/controller.js',import.meta.url),'utf8');
  assert.match(css,/\.m26-rc39-date-links\{[^}]*overflow-x:auto/);
  assert.match(css,/\.m26-rc39-date-links>a:focus-visible/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(controller,/data-rc39-date-target/);
  assert.match(controller,/day\.querySelector\?\.\('summary'\)\?\.focus/);
});
