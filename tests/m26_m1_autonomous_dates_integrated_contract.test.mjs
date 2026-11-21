import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 appendCoachDatedDateLine,shiftedDatedCalendarRange,
} from '../src/m26/workflows/occurrence-qa-ui.js';
import {createOccurrenceCoordinator} from '../src/m26/workflows/occurrence-coordinator.js';
import {createOccurrencePrivateReader} from '../src/m26/workflows/occurrence-private-reader.js';
import {buildTraining360DecisionPack} from '../src/m26/intelligence/training360-decision-pack.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const OWNER='10000000-0000-4000-8000-000000000101';
const OTHER='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const OCC='10000000-0000-4000-8000-000000000104';
const USER='10000000-0000-4000-8000-000000000105';
const DATE='2026-11-25';
const actor={role:'cliente',userId:USER,clientId:OWNER,accessToken:'test-token'};
const calendarRow=(extra={})=>({
 id:OCC,clientId:OWNER,sessionId:SESSION,appointmentId:null,
 appointmentStatus:null,localDate:DATE,localTime:null,
 timeZone:'America/Santiago',startsAt:null,endsAt:null,
 durationMinutes:45,status:'confirmada',revision:1,executionId:null,
 title:'Fuerza autónoma',...extra,
});
const privateRow=(extra={})=>({
 kind:'private-occurrence',
 occurrence:{
  id:OCC,clientId:OWNER,sessionId:SESSION,appointmentId:null,
  localDate:DATE,localTime:null,timeZone:'America/Santiago',
  startsAt:null,endsAt:null,durationMinutes:45,status:'confirmada',
  revision:1,executionId:null,...extra,
 },
 prescriptionSnapshot:{clientId:OWNER,sessionId:SESSION,
  title:'Fuerza autónoma',
  queue:[{blockId:'a',exerciseId:'squat',sets:2,prescription:{}}],
  blocks:[{id:'a',type:'exercise',exerciseId:'squat',sets:2}]},
 executionBody:null,
});
const request={clientId:OWNER,startDate:'2026-11-20',endDate:'2026-11-30'};

test('Coach can select date-only or timed days, but cannot silently repeat a civil day',()=>{
 let dates=appendCoachDatedDateLine('',DATE,'');
 assert.equal(dates,DATE);
 dates=appendCoachDatedDateLine(dates,'2026-11-27','08:30');
 assert.equal(dates,DATE+'\n2026-11-27 08:30');
 assert.throws(()=>appendCoachDatedDateLine(dates,DATE,'11:00'),/DATE_DUPLICATE/u);
 assert.throws(()=>appendCoachDatedDateLine('', '2026-02-30',''),/DATE_FORMAT_INVALID/u);
 assert.throws(()=>appendCoachDatedDateLine('','2026-11-26','25:00'),/DATE_FORMAT_INVALID/u);
 const full=Array.from({length:52},(_,i)=>
  new Date(Date.UTC(2026,10,25+i)).toISOString().slice(0,10)).join('\n');
 assert.throws(()=>appendCoachDatedDateLine(full,'2027-01-17',''),/DATE_LIMIT/u);
});

test('Calendar browses beyond initial 92-day window and never skips a day',()=>{
 const clock=new Date('2026-11-21T12:00:00Z');
 const base=shiftedDatedCalendarRange(0,clock);
 const next=shiftedDatedCalendarRange(1,clock);
 const before=shiftedDatedCalendarRange(-1,clock);
 const day=n=>Date.parse(n+'T12:00:00Z')/86400000;
 assert.equal(day(next.startDate)-day(base.endDate),1);
 assert.equal(day(base.startDate)-day(before.endDate),1);
 for(const invalid of [25,-25,0.2,NaN])assert.throws(
  ()=>shiftedDatedCalendarRange(invalid,clock),/CALENDAR_OFFSET_INVALID/u);
});

test('Signed U33-like calendar rows require confirmed no-cita state and exact owner',async()=>{
 let requests=0;
 const response={row:calendarRow()};
 const transport={occurrenceCalendar:async()=>{requests++;return {
  kind:'calendar',clientId:OWNER,occurrences:[response.row],
  count:1,hasMore:false,nextCursor:null,
 }},occurrenceCommand:async()=>{throw Error('unexpected write');}};
 const svc=createOccurrenceCoordinator({enabled:true,transport,
  getAuthContext:async()=>actor});
 assert.equal((await svc.calendar(request)).count,1);
 for(const mutation of [
  {status:'planificada'}, {appointmentStatus:'confirmada'},
  {appointmentId:OTHER}, {clientId:OTHER}, {prescriptionSnapshot:{secret:1}},
 ]){
  response.row=calendarRow(mutation);
  await assert.rejects(svc.calendar(request),/U40_/u);
 }
 assert.equal(requests,6);
 await assert.rejects(svc.calendar({...request,clientId:OTHER}),/U40_CLIENT_SCOPE_FORBIDDEN/u);
 assert.equal(requests,6,'foreign client cannot trigger even the first network read');
});

test('Client private U60 reader admits confirmed no-cita only with exact scoped response',async()=>{
 let calls=0;
 let current=privateRow();
 const reader=createOccurrencePrivateReader({
  enabled:true,getAuthContext:async()=>actor,
  transport:{occurrencePrivateRead:async()=>{calls++;return current;}},
 });
 assert.equal((await reader.read({clientId:OWNER,occurrenceId:OCC})).occurrence.appointmentId,null);
 current=privateRow({status:'planificada'});
 await assert.rejects(reader.read({clientId:OWNER,occurrenceId:OCC}),/CLIENT_UNPUBLISHED_FORBIDDEN/u);
 current=privateRow({appointmentId:'forged'});
 await assert.rejects(reader.read({clientId:OWNER,occurrenceId:OCC}),/U60_PRIVATE_/u);
 const before=calls;
 await assert.rejects(reader.read({clientId:OTHER,occurrenceId:OCC}),/CLIENT_SCOPE_FORBIDDEN/u);
 assert.equal(calls,before,'foreign private read never reaches transport');
});

test('Training360 decision hints include only authorized autonomous confirmed days',()=>{
 const source={id:SESSION,clientId:OWNER,title:'Fuerza autónoma',
  status:'disponible',deliveryModality:'guiada_en_app',
  deliveryOwnership:'guided_in_app',visibleToClient:true,
  clientVisibilityLevel:'full'};
 const input={role:'client',clientId:OWNER,sessions:[source],appointments:[],
  occurrences:[calendarRow()],executions:[],now:new Date('2026-11-24T16:00:00Z')};
 const ready=buildTraining360DecisionPack(input);
 assert.equal(ready.summary.scheduledDates,1);
 assert.equal(ready.upcoming.length,1);
 assert.equal(ready.upcoming[0].canRequestStartHint,true);
 for(const invalid of [
  {sessions:[{...source,visibleToClient:false}]},
  {sessions:[{...source,deliveryOwnership:'coach_led'}]},
  {occurrences:[calendarRow({status:'planificada'})]},
  {occurrences:[calendarRow({clientId:OTHER})]},
 ]){
  const value=buildTraining360DecisionPack({...input,...invalid});
  assert.equal(value.summary.scheduledDates,0);
 }
});

test('M1 backend script strictly maintains U60 closed until protected release',()=>{
 const path='supabase/release-procedures/20261121_m1_autonomous_dates_guarded_overlay_v1.sql';
 const rollback=readFileSync(path+'.rollback.sql','utf8');
 const sql=readFileSync(path,'utf8');
 for(const source of [sql,rollback])for(const fn of [
  'iberfit_u31_occurrence_transition_v1',
  'iberfit_u33_occurrence_calendar_v1',
  'iberfit_u60_occurrence_detail_v1',
 ])assert.ok(source.includes('CREATE OR REPLACE FUNCTION private.'+fn));
 for(const marker of ['M1_AUTONOMOUS_U72_PREREQUISITE_MISSING',
  'M1_AUTONOMOUS_PROD_MUST_BE_CLOSED',
  'M1_AUTONOMOUS_PRIVATE_ACL_DRIFT',
  'IBERFIT_M1_AUTONOMOUS_DATES_V1',
  'SOURCE_NOT_AVAILABLE','U60_CLIENT_DATE_NOT_PUBLISHED',
  'CONFIRMED_APPOINTMENT_REQUIRED'])
  assert.ok(sql.includes(marker),'missing security contract: '+marker);
 assert.match(sql,/source\.body->>'visibleToClient'='true'/u);
 assert.match(sql,/source\.body->>'clientVisibilityLevel'='full'/u);
 assert.match(sql,/source\.body->>'deliveryOwnership' IN/u);
 assert.match(sql,/source\.revision>=o\.prescription_revision/u);
 assert.match(sql,/o\.status IN \('confirmada','en_curso','completada','cancelada'\)/u);
 assert.match(sql,/v_occ\.prescription_snapshot->>'clientId'=v_client::text/u);
 assert.match(rollback,/M1_AUTONOMOUS_ROLLBACK_FIRST_CLOSE_U60/u);
 assert.match(rollback,/M1_AUTONOMOUS_U31_ROLLBACK_DRIFT/u);
 assert.doesNotMatch(sql,/GRANT EXECUTE[^;]+TO authenticated/iu);
});

test('Coach and Client autonomous controls are translated in all locales',()=>{
 for(const label of ['Hora en Chile (opcional)','Verificar planificación',
  'Fechas anteriores','Fechas siguientes']){
  for(const language of ['en','fr','pt'])
   assert.notEqual(iberfitSurfaceTranslate(label,{language}),label);
 }
});
