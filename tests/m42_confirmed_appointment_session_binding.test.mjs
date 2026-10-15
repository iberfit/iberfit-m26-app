import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedAppointmentForSession} from '../src/m26/app/confirmed-session-appointment.js';

const clientId='10000000-0000-4000-8000-000000000271';
const sessionId='10000000-0000-4000-8000-000000000272';
const otherSession='10000000-0000-4000-8000-000000000273';
const otherClient='10000000-0000-4000-8000-000000000274';
const session={id:sessionId,clientId,deliveryModality:'guiada_en_app'};
const now=Date.parse('2026-10-14T20:00:00Z');
const appointment=(id,overrides={})=>({
  id,clientId,sessionId,status:'confirmada',modality:'presencial',
  startAt:'2026-10-14T21:00:00Z',endAt:'2026-10-14T22:00:00Z',
  ...overrides,
});

test('M42: a real linked, confirmed appointment is eligible within its execution window',()=>{
  const linked=appointment('linked');
  assert.equal(confirmedAppointmentForSession([linked],session,now)?.id,linked.id);
});

test('M42: an unrelated or unlinked physical appointment never becomes authority for a guided workout',()=>{
  const unlinked=appointment('unlinked',{sessionId:null});
  const other=appointment('other',{sessionId:otherSession});
  const alien=appointment('alien',{clientId:otherClient});
  assert.equal(confirmedAppointmentForSession([unlinked,other,alien],session,now),null);
  const linked=appointment('linked');
  assert.equal(confirmedAppointmentForSession([unlinked,other,linked],session,now)?.id,linked.id);
});

test('M42: cancelled, unconfirmed, expired and malformed bookings are not eligible',()=>{
  const records=[
    appointment('cancelled',{status:'cancelada'}),
    appointment('pending',{status:'pendiente'}),
    appointment('old',{startAt:'2026-10-13T10:00:00Z',endAt:'2026-10-13T11:00:00Z'}),
    appointment('missing-date',{startAt:null,endAt:null}),
  ];
  assert.equal(confirmedAppointmentForSession(records,session,now),null);
  assert.equal(confirmedAppointmentForSession(records,{clientId, id:null},now),null);
  assert.equal(confirmedAppointmentForSession(records,session,NaN),null);
});

test('M42: selects the earliest eligible booking explicitly linked to this session',()=>{
  const later=appointment('later',{startAt:'2026-10-14T23:00:00Z'});
  const earlier=appointment('earlier',{startAt:'2026-10-14T20:30:00Z'});
  assert.equal(confirmedAppointmentForSession([later,earlier],session,now)?.id,'earlier');
});
