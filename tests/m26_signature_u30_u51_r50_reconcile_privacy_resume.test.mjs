import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientPlanningItems,legacyStartNeedsOccurrence,
} from '../src/m26/rc39/session-policy.js';
import {augmentRc39ViewModel} from '../src/m26/rc39/view-model.js';

const CLIENT='10000000-0000-4000-8000-000000000101';
const SESSION='10000000-0000-4000-8000-000000000103';
const EXEC='10000000-0000-4000-8000-000000000105';
const now=new Date('2026-11-02T12:00:00Z');
const session=(patch={})=>({
  id:SESSION,clientId:CLIENT,status:'disponible',revision:3,
  visibleToClient:true,clientVisibilityLevel:'full',
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  blocks:[{type:'exercise',exerciseId:'squat',sets:3}],...patch,
});
const appt=(id,day,patch={})=>({
  id,sessionId:SESSION,clientId:CLIENT,status:'confirmada',
  visibleToClient:true,startAt:day,...patch,
});
const A=appt('date-a','2026-11-03T15:00:00Z');
const B=appt('date-b','2026-11-10T15:00:00Z');
const view=(role,collections,selectedClientId=null)=>augmentRc39ViewModel(
  {kind:'sesion',role},{identity:{role,clientId:CLIENT}},
  {identity:{role,clientId:CLIENT},selectedClientId,collections},now,
);

test('R50 withdrawn body privacy outranks a visible wrapper even with dated occurrences',()=>{
  const hidden=session({body:{visibleToClient:false,clientVisibilityLevel:'hidden'}});
  const items=buildClientPlanningItems({sessions:[hidden],appointments:[A,B],now});
  assert.deepEqual(items,[]);
  const model=view('client',{sessions:[hidden],appointments:[A,B]});
  assert.deepEqual(model.rc39.planningItems,[]);
  assert.equal(model.rc39.sessionProjections[0].visible,false);
});

test('U30 multifecha expands two visible dates without duplicated legacy starts',()=>{
  const items=buildClientPlanningItems({sessions:[session()],appointments:[B,A],now});
  assert.deepEqual(items.map(x=>x.appointmentId),['date-a','date-b']);
  assert.ok(items.every(x=>x.canClientStart===false&&x.recurringAwaitingActivation===true));
  const vm=view('client',{sessions:[session()],appointments:[A,B]});
  assert.equal(vm.rc39.planningItems.length,2);
  assert.equal(vm.rc39.sessionProjections.length,1);
  assert.equal(vm.rc39.sessionProjections[0].canClientStart,false);
  assert.equal(vm.rc39.sessionProjections[0].recurringAwaitingActivation,true);
  const coach=view('coach',{sessions:[session()],appointments:[A,B]},CLIENT);
  assert.equal(coach.rc39.sessionProjections[0].canClientStart,false);
});

test('single date keeps the existing Client start and private proposals stay excluded',()=>{
  const values=buildClientPlanningItems({sessions:[session()],appointments:[
    A,appt('private','2026-11-17T15:00:00Z',{status:'propuesta'}),
    appt('hidden','2026-11-24T15:00:00Z',{visibleToClient:false}),
  ],now});
  assert.deepEqual(values.map(x=>x.appointmentId),['date-a']);
  assert.equal(values[0].canClientStart,true);
  assert.equal(values[0].recurringAwaitingActivation,false);
});

test('provisioned occurrence fences legacy start even when only one appointment is visible',()=>{
  const occurrence={id:'occ',sessionId:SESSION,clientId:CLIENT,status:'cancelada'};
  assert.equal(legacyStartNeedsOccurrence({
    sessionId:SESSION,clientId:CLIENT,appointments:[A],occurrences:[occurrence],
  }),true);
  const vm=view('client',{sessions:[session()],appointments:[A],trainingOccurrences:[occurrence]});
  assert.equal(vm.rc39.sessionProjections[0].canClientStart,false);
  assert.equal(vm.rc39.planningItems[0].canClientStart,false);
});

test('R50 owner-verified active session resume remains accessible once, not on ambiguous dates',()=>{
  const active=session({status:'en_curso'});
  const execution={id:EXEC,sessionId:SESSION,clientId:CLIENT,status:'active'};
  const canonical={entityType:'session_execution',entityId:EXEC,
    sessionId:SESSION,clientId:CLIENT,status:'active'};
  const c={sessions:[active],appointments:[A,B],
    sessionExecutions:[execution],m26Entities:[canonical]};
  const vm=view('client',c);
  assert.equal(vm.rc39.sessionProjections[0].canClientResume,true,
    'R50 canonical resume survives dated-planning fencing');
  assert.equal(vm.rc39.planningItems.length,2);
  assert.ok(vm.rc39.planningItems.every(item=>item.canClientResume===false),
    'without a verified occurrence link no date may impersonate a resume');
  const one=view('client',{...c,appointments:[A]});
  assert.equal(one.rc39.sessionProjections[0].canClientResume,true);
  assert.equal(one.rc39.planningItems[0].canClientResume,true);
});
