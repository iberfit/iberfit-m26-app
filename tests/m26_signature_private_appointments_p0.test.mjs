import test from 'node:test';
import assert from 'node:assert/strict';
import {appointmentForSession} from '../src/m26/rc39/session-policy.js';
import {augmentRc39ViewModel} from '../src/m26/rc39/view-model.js';

const CLIENT='10000000-0000-4000-8000-000000000101';
const SESSION='10000000-0000-4000-8000-000000000103';
const session={id:SESSION,clientId:CLIENT,status:'disponible',title:'Entrenamiento martes',
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',clientVisibilityLevel:'full',
  blocks:[{id:'b',type:'exercise',exerciseId:'squat',name:'Sentadilla',sets:3}]};
const appt=(id,startAt,changes={})=>({id,sessionId:SESSION,clientId:CLIENT,status:'confirmada',
  visibleToClient:true,startAt,endAt:new Date(Date.parse(startAt)+3_600_000).toISOString(),...changes});
const now=new Date('2026-10-19T10:00:00Z');

test('P0: prefer next confirmed appointment over earlier draft or cancelled appointment',()=>{
  const next=appt('confirmed-next','2026-10-27T15:00:00Z');
  const older=appt('confirmed-old','2026-10-06T15:00:00Z');
  const privateProposal=appt('private','2026-10-20T15:00:00Z',{status:'propuesta',visibleToClient:false});
  const cancelled=appt('cancelled','2026-10-21T15:00:00Z',{status:'cancelada'});
  assert.equal(appointmentForSession([privateProposal,cancelled,older,next],session,now)?.id,'confirmed-next');
  assert.equal(appointmentForSession([older],session,now)?.id,'confirmed-old');
  assert.equal(appointmentForSession([cancelled],session,now),null);
});

test('P0: Cliente never receives private Coach proposals via session or operational projections',()=>{
  const privateProposal=appt('proposal-private','2026-10-20T14:00:00Z',{status:'propuesta',visibleToClient:false});
  const cancelled=appt('cancelled','2026-10-21T14:00:00Z',{status:'cancelada'});
  const future=appt('confirmed-visible','2026-10-27T14:00:00Z');
  const state={identity:{role:'client',clientId:CLIENT},selectedClientId:null,
    collections:{sessions:[session],appointments:[privateProposal,cancelled,future]}};
  const shell={identity:{role:'client',clientId:CLIENT}};
  const vm=augmentRc39ViewModel({kind:'sesion',role:'client'},shell,state,now);
  assert.deepEqual(vm.rc39.appointments.map(x=>x.id),['confirmed-visible']);
  assert.deepEqual(vm.rc39.sessionProjections.map(x=>x.appointmentId),['confirmed-visible']);
  assert.deepEqual(vm.rc39.planningItems.map(x=>x.appointmentId),['confirmed-visible']);

  const hidden=augmentRc39ViewModel({kind:'sesion',role:'client'},shell,{
    ...state,collections:{...state.collections,appointments:[privateProposal,cancelled]},
  },now);
  assert.equal(hidden.rc39.appointments.length,0);
  assert.equal(hidden.rc39.sessionProjections[0].appointmentId,null);
  assert.equal(hidden.rc39.planningItems[0].appointmentId,null);
});

test('P0: Coach retains authorized proposal visibility for operational management',()=>{
  const proposed=appt('proposal-private','2026-10-20T14:00:00Z',{status:'propuesta',visibleToClient:false});
  const state={identity:{role:'coach'},selectedClientId:CLIENT,
    collections:{sessions:[session],appointments:[proposed]}};
  const vm=augmentRc39ViewModel({kind:'sesion',role:'coach'}, {identity:{role:'coach'}},state,now);
  assert.equal(vm.rc39.appointments.length,1);
  assert.equal(vm.rc39.sessionProjections[0].appointmentId,'proposal-private');
});
