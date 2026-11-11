// IBERFIT U60 · decision-only projection of ALREADY authorized records.
// Never grants access or substitutes a server-side occurrence execution API.
// Session = prescription; occurrence = scheduled date; execution = one result.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DATE=/^\d{4}-\d{2}-\d{2}$/u;
const STATUS=new Set(['planificada','confirmada','en_curso','completada','cancelada']);
const VALID_ROLES=new Set(['client','cliente','coach','admin']);
const source=value=>value?.body&&typeof value.body==='object'&&!Array.isArray(value.body)
  ?value.body:value||{};
const field=(record,...names)=>{
  const body=source(record);
  for(const name of names){
    if(record?.[name]!==undefined&&record[name]!==null)return record[name];
    if(body?.[name]!==undefined&&body[name]!==null)return body[name];
  }
  return null;
};
const cleanId=value=>UUID.test(String(value||''))?String(value).toLowerCase():null;
const lower=value=>String(value??'').trim().toLowerCase();
const cleanDate=value=>{
  const date=String(value||'');
  if(!DATE.test(date))return null;
  const parsed=new Date(date+'T12:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date
    ?date:null;
};
function localToday(at){
  if(!(at instanceof Date)||!Number.isFinite(at.getTime()))
    throw new Error('U60_DECISION_TIME_INVALID');
  const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',
    year:'numeric',month:'2-digit',day:'2-digit'});
  const parts=Object.fromEntries(f.formatToParts(at)
    .filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
function normalizedOccurrence(row,clientId){
  if(!row||typeof row!=='object'||Array.isArray(row))return null;
  const id=cleanId(field(row,'id','entityId','entity_id'));
  const owner=cleanId(field(row,'clientId','client_id'));
  const sessionId=cleanId(field(row,'sessionId','session_id'));
  const localDate=cleanDate(field(row,'localDate','local_date'));
  const status=lower(field(row,'status'));
  const revision=Number(field(row,'revision')??0);
  if(!id||!owner||!sessionId||owner!==clientId||!localDate
    ||!STATUS.has(status)||!Number.isSafeInteger(revision)||revision<0
    ||field(row,'timeZone','time_zone')!=='America/Santiago')return null;
  return Object.freeze({
    id,clientId:owner,sessionId,localDate,status,revision,
    appointmentId:cleanId(field(row,'appointmentId','appointment_id')),
    executionId:cleanId(field(row,'executionId','execution_id')),
  });
}
function authorizedPrescription(row,clientId,role){
  const id=cleanId(field(row,'id','entityId','entity_id'));
  if(!id||cleanId(field(row,'clientId','client_id'))!==clientId)return null;
  if(['client','cliente'].includes(lower(role))&&(
    lower(field(row,'status'))!=='disponible'||
    !['true','1'].includes(lower(field(row,'visibleToClient','visible_to_client')))||
    lower(field(row,'clientVisibilityLevel','client_visibility_level'))!=='full'
  ))return null;
  const title=String(field(row,'title','name')||'Entrenamiento IBERFIT');
  return Object.freeze({
    id, title:title.slice(0,100),
    status:lower(field(row,'status')),
    modality:lower(field(row,'deliveryModality','delivery_modality')),
  });
}
function verifiedExecution(row,clientId,occurrence){
  if(!row||!occurrence)return null;
  const id=cleanId(field(row,'id','entityId','entity_id','executionId','execution_id'));
  const owner=cleanId(field(row,'clientId','client_id'));
  const sid=cleanId(field(row,'sessionId','session_id'));
  const oid=cleanId(field(row,'occurrenceId','occurrence_id'));
  const revision=Number(field(row,'revision')??-1);
  const sync=lower(field(row,'syncStatus','sync_status'));
  const confirmed=field(row,'serverConfirmed','server_confirmed');
  if(!id||owner!==clientId||sid!==occurrence.sessionId
    ||oid!==occurrence.id||id!==occurrence.executionId
    ||!Number.isSafeInteger(revision)||revision<1
    ||(sync&&sync!=='clean')||confirmed===false)return null;
  return Object.freeze({id,status:lower(field(row,'status','executionStatus','execution_status')),
    revision,localDate:occurrence.localDate,sessionId:sid});
}
function evidenceIndex(records,idOf,signatureOf){
  // Accept repeated identical projections; a contradictory same-ID record is
  // untrusted regardless of arrival order. No private body is returned.
  const values=new Map(),ambiguous=new Set();
  for(const item of records){
    const id=idOf(item);
    if(!id||ambiguous.has(id))continue;
    const signature=signatureOf(item);
    const previous=values.get(id);
    if(previous&&previous.signature!==signature){
      values.delete(id);ambiguous.add(id);
    }else if(!previous){
      values.set(id,{item,signature});
    }
  }
  return {byId:new Map([...values].map(([id,entry])=>[id,entry.item])),
    ambiguous};
}
const appointmentEvidence=row=>JSON.stringify([
  cleanId(field(row,'clientId','client_id')),
  cleanId(field(row,'sessionId','session_id')),
  lower(field(row,'status')),
  String(field(row,'startAt','start_at','scheduledAt','scheduled_at')??''),
  String(field(row,'endAt','end_at')??''),
]);
const executionEvidence=row=>JSON.stringify([
  cleanId(field(row,'clientId','client_id')),
  cleanId(field(row,'sessionId','session_id')),
  cleanId(field(row,'occurrenceId','occurrence_id')),
  lower(field(row,'status','executionStatus','execution_status')),
  field(row,'revision'),
]);
const statusLabel={
  planificada:'Fecha por confirmar',confirmada:'Entrenamiento confirmado',
  en_curso:'Entrenamiento en curso',completada:'Entrenamiento realizado',
  cancelada:'Fecha cancelada',
};
/**
 * Inputs MUST already be scoped by the authenticated server. This defensive
 * secondary filter rejects cross-client/invalid data and never returns raw
 * exercise blocks, personal notes, feedback or other private fields.
 * No score is fabricated when the server has supplied no occurrence records.
 */
export function buildTraining360DecisionPack({
  role,clientId,sessions=[],appointments=[],occurrences=[],
  executions=[],now=new Date(),
}={}){
  if(!VALID_ROLES.has(lower(role)))throw new Error('U60_DECISION_ROLE_INVALID');
  const owner=cleanId(clientId);
  if(!owner)throw new Error('U60_DECISION_CLIENT_INVALID');
  if(![sessions,appointments,occurrences,executions].every(Array.isArray))
    throw new Error('U60_DECISION_COLLECTIONS_INVALID');
  const today=localToday(now);
  // Resolve duplicates BEFORE applying Client visibility. A hidden and a
  // published row with the same ID must not leave a visible source behind.
  const {byId:sourcePrescriptions,ambiguous:conflictedPrescriptions}=evidenceIndex(
    sessions.filter(row=>cleanId(field(row,'clientId','client_id'))===owner),
    row=>cleanId(field(row,'id','entityId','entity_id')),
    row=>JSON.stringify([
      lower(field(row,'status')),
      String(field(row,'visibleToClient','visible_to_client')??''),
      lower(field(row,'clientVisibilityLevel','client_visibility_level')),
      lower(field(row,'deliveryModality','delivery_modality')),
      String(field(row,'title','name')??''),
    ]));
  const prescriptions=new Map([...sourcePrescriptions]
    .map(([id,row])=>[id,authorizedPrescription(row,owner,role)])
    .filter(([,value])=>Boolean(value)));
  const {byId:appointmentById,ambiguous:conflictedAppointments}=evidenceIndex(
    appointments.filter(row=>cleanId(field(row,'clientId','client_id'))===owner),
    row=>cleanId(field(row,'id','entityId','entity_id')),appointmentEvidence);
  const rows=new Map();
  const ambiguousOccurrenceIds=new Set();
  for(const input of occurrences){
    const o=normalizedOccurrence(input,owner);
    if(!o||!prescriptions.has(o.sessionId)||ambiguousOccurrenceIds.has(o.id))continue;
    const prior=rows.get(o.id);
    if(prior){
      if(prior.revision>o.revision)continue;
      if(prior.revision===o.revision){
        // Two different records claiming the same UUID and revision are not
        // trustworthy evidence. Do not silently prefer the input array order.
        const fields=['clientId','sessionId','localDate','status','revision',
          'appointmentId','executionId'];
        if(fields.some(key=>prior[key]!==o[key])){
          rows.delete(o.id);
          ambiguousOccurrenceIds.add(o.id);
        }
        continue;
      }
    }
    rows.set(o.id,o);
  }
  const {byId:executionMap,ambiguous:conflictedExecutions}=evidenceIndex(
    executions,row=>cleanId(field(row,'id','entityId','entity_id','executionId','execution_id')),
    executionEvidence);
  const dates=[...rows.values()].sort((a,b)=>a.localDate.localeCompare(b.localDate)
    ||a.id.localeCompare(b.id));
  // A single appointment cannot represent two different dated occurrences.
  const seenAppointment=new Map(),reusedAppointmentIds=new Set();
  for(const date of dates){
    if(!date.appointmentId)continue;
    const earlier=seenAppointment.get(date.appointmentId);
    if(earlier&&earlier!==date.id)reusedAppointmentIds.add(date.appointmentId);
    else if(!earlier)seenAppointment.set(date.appointmentId,date.id);
  }
  const invalidLinkedAppointments=new Set();
  const items=dates.map(o=>{
    const p=prescriptions.get(o.sessionId);
    const ap=o.appointmentId?appointmentById.get(o.appointmentId):null;
    const start=ap?field(ap,'startAt','start_at','scheduledAt','scheduled_at'):null;
    const at=start==null?null:new Date(start);
    const sameLocalDay=at===null||(
      Number.isFinite(at.getTime())&&localToday(at)===o.localDate);
    const authorizedAp=ap&&!reusedAppointmentIds.has(o.appointmentId)
      &&sameLocalDay&&cleanId(field(ap,'sessionId','session_id'))===o.sessionId
      ?ap:null;
    if(o.appointmentId&&!authorizedAp)invalidLinkedAppointments.add(o.id);
    const appointmentStatus=authorizedAp?lower(field(authorizedAp,'status')):null;
    const exec=o.executionId?verifiedExecution(executionMap.get(o.executionId),owner,o):null;
    const executionVerified=o.executionId===null?!['en_curso','completada'].includes(o.status)
      :Boolean(exec&&((o.status==='completada'&&exec.status==='completada')
        ||(o.status==='en_curso'&&['en_curso','activa','active'].includes(exec.status))));
    const isClient=['client','cliente'].includes(lower(role));
    const serverPublished=p.status==='disponible'&&
      ['guiada_en_app'].includes(p.modality);
    // Strict Client parity with U33's server-side calendar projection:
    // existence of a linked appointment never makes an invalid state visible.
    // Coach remains able to inspect and repair unlinked/withdrawn dates.
    const visibleAppointmentState=Boolean(
      (o.status==='confirmada'&&appointmentStatus==='confirmada')||
      (o.status==='en_curso'&&['confirmada','cancelada'].includes(appointmentStatus))||
      (o.status==='completada'&&['confirmada','cancelada','completada'].includes(appointmentStatus))||
      (o.status==='cancelada'&&['confirmada','cancelada','completada'].includes(appointmentStatus)));
    const dateVisible=!isClient||Boolean(serverPublished&&o.appointmentId
      &&authorizedAp&&visibleAppointmentState);
    // These are advice/display hints only. Server always authorizes writes.
    return Object.freeze({
      id:o.id,sessionId:o.sessionId,localDate:o.localDate,
      title:p.title,status:o.status,label:statusLabel[o.status],
      appointmentId:o.appointmentId,appointmentStatus,
      hasVerifiedExecution:Boolean(exec),executionVerified,
      phase:o.status==='completada'?'review':
        o.status==='en_curso'?'resume':
          o.status==='confirmada'?'scheduled':
            o.status==='cancelada'?'cancelled':'draft',
      canRequestStartHint:o.status==='confirmada'&&serverPublished
        &&appointmentStatus==='confirmada'&&!o.executionId,
      visible:dateVisible,
    });
  }).filter(item=>item.visible);
  const due=items.filter(x=>x.localDate<=today&&
    ['confirmada','en_curso','completada'].includes(x.status));
  const completed=due.filter(x=>x.status==='completada'&&x.executionVerified);
  // Missing mirrored evidence is a Coach integrity task, not a Client alarm.
  // A server-completed workout without an independently verified execution
  // must never be reported as missed adherence.
  const inconsistentExecution=items.filter(x=>
    ['en_curso','completada'].includes(x.status)&&!x.executionVerified);
  const needsRecovery=lower(role)==='coach'?inconsistentExecution:[];
  const awaiting=due.filter(x=>x.status==='confirmada');
  const upcoming=items.filter(x=>x.localDate>=today&&
    x.status==='confirmada').slice(0,14);
  const byDate=new Map();
  for(const item of items){
    if(!byDate.has(item.localDate))byDate.set(item.localDate,[]);
    byDate.get(item.localDate).push(item);
  }
  const days=[...byDate].map(([date,entries])=>Object.freeze({
    date,items:Object.freeze(entries),
    complete:entries.length>0&&entries.every(e=>e.status==='completada'
      &&e.executionVerified),
  }));
  const unverifiedCompletedDue=due.some(x=>
    x.status==='completada'&&!x.executionVerified);
  const unresolvedInProgress=due.some(x=>x.status==='en_curso');
  // A date still available today is not a missed workout. Past confirmed
  // dates can contribute to adherence, as can verified completions today.
  // An ongoing/ambiguous/unmirrored execution must yield unknown, never 0.
  const adherenceEligible=due.filter(x=>x.localDate<today
    ||x.status==='completada');
  const possibleAdherence=adherenceEligible.length>0
    &&!unverifiedCompletedDue&&!unresolvedInProgress
    &&ambiguousOccurrenceIds.size===0&&invalidLinkedAppointments.size===0
    ?Math.round(100*adherenceEligible.filter(x=>
      x.status==='completada'&&x.executionVerified).length
      /adherenceEligible.length):null;
  const visibleIds=new Set(items.map(item=>item.id));
  // Unrelated invalid records must not trigger alerts about this client's dates.
  const relevantConflict=occurrences.some(row=>
    cleanId(field(row,'clientId','client_id'))===owner
      &&conflictedPrescriptions.has(cleanId(field(row,'sessionId','session_id'))))
    ||dates.some(row=>Boolean(
      (row.appointmentId&&conflictedAppointments.has(row.appointmentId))
      ||(row.executionId&&conflictedExecutions.has(row.executionId))));
  const recommendation=needsRecovery.length
    ?Object.freeze({type:'verify-execution',label:'Verificar ejecución pendiente',
      reason:'Existe una fecha en curso sin correspondencia completa de ejecución.'})
    :awaiting.length&&lower(role)==='coach'
      ?Object.freeze({type:'review-plan',label:'Revisar fechas pendientes',
        reason:'Hay fechas que ya llegaron y siguen confirmadas.'})
      :completed.length&&lower(role)==='coach'
        ?Object.freeze({type:'review-results',label:'Revisar las ejecuciones completadas',
          reason:'Hay entrenamientos completados y confirmados por sus registros.'})
        :upcoming.length
          ?Object.freeze({type:'upcoming',label:'Próximo entrenamiento',
            reason:'La fecha siguiente está confirmada en el calendario autorizado.'})
          :null;
  return Object.freeze({
    schema:'iberfit.training360.decision.v1',clientId:owner,
    asOfLocalDate:today,
    summary:Object.freeze({
      prescriptions:prescriptions.size,scheduledDates:items.length,
      dueDates:due.length,completedDue:completed.length,
      inProgress:items.filter(x=>x.status==='en_curso').length,
      pendingPast:awaiting.filter(x=>x.localDate<today).length,
      cancelled:items.filter(x=>x.status==='cancelada').length,
      verifiedAdherencePct:possibleAdherence,
      insufficientEvidence:unverifiedCompletedDue||unresolvedInProgress
        ||ambiguousOccurrenceIds.size>0||invalidLinkedAppointments.size>0
        ||relevantConflict
        ||dates.some(x=>!visibleIds.has(x.id)),
    }),
    days:Object.freeze(days),upcoming:Object.freeze(upcoming),
    needsRecovery:Object.freeze(needsRecovery),
    nextDecision:recommendation,
  });
}
