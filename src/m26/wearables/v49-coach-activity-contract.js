import {reportCivilDate,parseCivilDate} from '../domain/civil-date.js';
import {connected360ActivityContinuity,connected360ObservedDayContinuity} from './v46-production-summary.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SPORTS=new Set(['running','interval_running','hiit','cycling','walking','strength','swimming','other']);
const PURPOSE='coaching-exercise-days-v1';
const revision=v=>Number.isInteger(v)&&v>=0&&v<=2147483647;
const uuid=v=>typeof v==='string'&&UUID.test(v);
const exact=(value,keys)=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)));
const fail=()=>{throw new Error('M26_V49_COACH_ACTIVITY_INVALID');};
export function connected360CoachActivityParams(clientId){
  if(!uuid(clientId))fail();
  return {p_client:clientId};
}
export function connected360CoachConsentStatusParams(coachId){
  if(!uuid(coachId))fail();
  return {p_coach:coachId};
}
export function connected360CoachConsentParams({coachId,assignmentId=null,expectedRevision,allow}={}){
  if(!uuid(coachId)||typeof allow!=='boolean'||!revision(expectedRevision)
    ||expectedRevision===2147483647||(allow&&!uuid(assignmentId))
    ||(!allow&&assignmentId!==null))fail();
  return {p_coach:coachId,p_assignment:assignmentId,p_expected_revision:expectedRevision,p_allow:allow};
}
export function verifyConnected360CoachConsentStatus(value){
  if(!exact(value,['ok','recorded','revision','purpose'])||value.ok!==true
    ||typeof value.recorded!=='boolean'||!revision(value.revision)
    ||value.purpose!==PURPOSE||(value.recorded&&value.revision===0))fail();
  // A stored decision is deliberately not an effective authorization.
  return Object.freeze({...value});
}
export function verifyConnected360CoachConsentReceipt(value,params){
  if(!exact(value,['ok','shared','revision'])||value.ok!==true||!params
    ||typeof params.p_allow!=='boolean'||!revision(params.p_expected_revision)
    ||value.shared!==params.p_allow||!revision(value.revision)
    ||(params.p_allow?value.revision!==params.p_expected_revision+1:
      ![params.p_expected_revision,params.p_expected_revision+1].includes(value.revision)))fail();
  return Object.freeze({...value});
}
function startOfWindow(end){
  const d=new Date(end+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate()-6);
  return d.toISOString().slice(0,10);
}
// Strict minimized server response, never a persisted or generic client-state
// collection. Date-only observations are not fabricated workout timestamps.
export function verifyConnected360CoachExerciseDays(value,{clientId,now=new Date()}={}){
  const end=Number.isFinite(now?.getTime?.())?reportCivilDate(now):null;
  if(!end||!uuid(clientId)||!exact(value,['ok','schema','clientId','provider','coverage','periodStart','periodEnd','days'])
    ||value.ok!==true||value.schema!=='iberfit.connected360.coach-exercise-days.v1'
    ||value.clientId!==clientId||value.provider!=='health_connect'||value.coverage!=='partial'
    ||value.periodEnd!==end||value.periodStart!==startOfWindow(end)
    ||!Array.isArray(value.days)||value.days.length>7)fail();
  let previous=null;
  const days=value.days.map(row=>{
    if(!exact(row,['date','sports'])||typeof row.date!=='string'||parseCivilDate(row.date)?.iso!==row.date
      ||row.date<value.periodStart||row.date>value.periodEnd||(previous!==null&&row.date>=previous)
      ||!Array.isArray(row.sports)||!row.sports.length||row.sports.length>SPORTS.size
      ||row.sports.some(s=>!SPORTS.has(s))||new Set(row.sports).size!==row.sports.length)fail();
    previous=row.date;
    return Object.freeze({date:row.date,sports:Object.freeze([...row.sports])});
  });
  return Object.freeze({...value,days:Object.freeze(days)});
}


// Recipient discovery is a separate owner-scoped capability. Never derive
// sharing eligibility from a generic list of coaches or client assignments.
export function verifyConnected360CoachRecipients(value,{clientId}={}){
  if(!uuid(clientId)||!exact(value,['ok','schema','clientId','purpose','recipients'])
    ||value.ok!==true||value.schema!=='iberfit.connected360.coach-recipients.v1'
    ||value.clientId!==clientId||value.purpose!==PURPOSE
    ||!Array.isArray(value.recipients)||value.recipients.length>20)fail();
  const seen=new Set();
  const recipients=value.recipients.map(row=>{
    if(!exact(row,['coachId','assignmentId','displayName','eligible','recorded','effective','revision'])
      ||!uuid(row.coachId)||seen.has(row.coachId)||typeof row.displayName!=='string'
      ||!row.displayName.trim()||row.displayName.length>160||/[\u0000-\u001f\u007f]/u.test(row.displayName)
      ||typeof row.eligible!=='boolean'||typeof row.recorded!=='boolean'||typeof row.effective!=='boolean'
      ||!revision(row.revision)||(row.recorded&&row.revision===0)
      ||(row.eligible?!uuid(row.assignmentId):row.assignmentId!==null)
      ||(row.effective&&(!row.eligible||!row.recorded))
      ||(!row.eligible&&!row.recorded))fail();
    seen.add(row.coachId);return Object.freeze({...row});
  });
  return Object.freeze({...value,recipients:Object.freeze(recipients)});
}
export function connected360RecipientDecision(recipient,allow,{confirmed=false}={}){
  if(typeof allow!=='boolean'||confirmed!==true||!recipient
    ||(allow?(recipient.eligible!==true||recipient.effective===true):recipient.recorded!==true))fail();
  const decision={coachId:recipient.coachId,assignmentId:allow?recipient.assignmentId:null,
    expectedRevision:recipient.revision,allow};
  connected360CoachConsentParams(decision);
  return Object.freeze(decision);
}


// Opaque lease and route must match before AND after a demand read.
export function sameConnected360CoachScope(a,b){
  return Boolean(a&&b&&a.lease&&a.lease===b.lease&&uuid(a.clientId)
    &&a.clientId===b.clientId&&a.actorId&&a.actorId===b.actorId
    &&['expediente','sesion'].includes(a.area)&&a.area===b.area);
}
const labels=Object.freeze({running:'Carrera',interval_running:'Carrera por intervalos',
 hiit:'HIIT',cycling:'Ciclismo',walking:'Caminata',strength:'Fuerza',swimming:'Natación',other:'Otro entrenamiento'});
// Combine positive observations only. Canonical input is a bounded local
// projection of confirmed executions; external input is the exact V49 DTO.
function continuityFromVerified(verified,confirmedRows,now){
 if(!Array.isArray(confirmedRows)||confirmedRows.length>20||confirmedRows.some(r=>r?.source!=='iberfit'||!Number.isFinite(r.orderAt)||r.orderAt>now.getTime()||reportCivilDate(new Date(r.orderAt))!==r.dayKey))fail();
 const canonical=connected360ActivityContinuity(confirmedRows,{now});
 const observed=new Set(confirmedRows.map(r=>r.dayKey)),running=new Set(),externalDays=new Set();
 const bySport=new Map();
 for(const day of verified.days){
  observed.add(day.date);externalDays.add(day.date);
  for(const sport of day.sports){
   const key=sport==='interval_running'?'running':sport;
   if(!bySport.has(key))bySport.set(key,new Set());
   bySport.get(key).add(day.date);
   if(key==='running')running.add(day.date);
  }
 }
 const combined=connected360ObservedDayContinuity(observed,running,{now,source:'coach_authorized_activity'});
 // A combined cue must add evidence over the canonical cue, not merely
 // re-label it. A running streak is supported only by external observations.
 const activity=combined&&(combined.runningDays!==null||!canonical||combined.days>canonical.days)?combined:canonical;
 const external=connected360ObservedDayContinuity(externalDays,running,{now,source:'coach_authorized_activity'});
 const disciplineCues=[];
 for(const sport of ['cycling','swimming','strength','hiit','walking']){
  const days=bySport.get(sport);
  if(!days)continue;
  const run=connected360ObservedDayContinuity(days,new Set(),{now,source:'coach_authorized_activity'});
  if(run)disciplineCues.push(Object.freeze({sport,label:labels[sport],days:run.days,periodStart:run.periodStart,periodEnd:run.periodEnd}));
 }
 return {activity,external,disciplineCues:Object.freeze(disciplineCues)};
}
export function connected360CoachContinuity(payload,{clientId,now=new Date(),confirmedRows=[]}={}){
 const verified=verifyConnected360CoachExerciseDays(payload,{clientId,now});
 return continuityFromVerified(verified,confirmedRows,now).activity;
}
export function connected360CoachActivityView(payload,{clientId,now=new Date(),confirmedRows=[]}={}){
 const verified=verifyConnected360CoachExerciseDays(payload,{clientId,now});
 const days=verified.days.map(row=>Object.freeze({date:row.date,sports:Object.freeze(row.sports.map(s=>labels[s]))}));
 const context=continuityFromVerified(verified,confirmedRows,now);
 const activity=context.activity;
 const cue=activity?.source==='coach_authorized_activity'
  ?Object.freeze({days:activity.days,discipline:activity.discipline}):null;
 // Distinguish union from an external-only sequence; never sum sessions,
 // infer inactivity or diagnose inadequate recovery from partial coverage.
 const cueBasis=cue?(activity.discipline==='running'||(context.external?.days===activity.days&&context.external?.periodEnd===activity.periodEnd)?'external':'combined'):null;
 return Object.freeze({days:Object.freeze(days),cue,cueBasis,disciplineCues:context.disciplineCues});
}
