import {isClientVisibleAppointment} from '../domain/appointment.js';
const fold=(value)=>String(value??'')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[\s-]+/g,'_');

const bodyOf=(record)=>record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};
const field=(record,...keys)=>{
  const body=bodyOf(record);
  for(const key of keys){
    const value=record?.[key]??body?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
};
const booleanField=(record,...keys)=>{
  const value=field(record,...keys);
  if(value===null)return null;
  if(typeof value==='boolean')return value;
  const normalized=fold(value);
  if(['true','1','si','yes'].includes(normalized))return true;
  if(['false','0','no'].includes(normalized))return false;
  return null;
};
const dateMs=(value)=>{
  const time=value?new Date(value).getTime():NaN;
  return Number.isFinite(time)?time:null;
};

export const CLIENT_VISIBILITY_LEVELS=Object.freeze(['hidden','summary_only','full']);
export const DELIVERY_OWNERSHIPS=Object.freeze([
  'coach_led',
  'client_autonomous',
  'live_online',
  'guided_in_app',
]);
export const DELIVERY_MODALITIES=Object.freeze([
  'presencial',
  'guiada_en_app',
  'online',
]);

const VISIBILITY_ALIASES=Object.freeze(new Map([
  ['hidden','hidden'],['oculta','hidden'],['oculto','hidden'],['private','hidden'],
  ['summary_only','summary_only'],['summary','summary_only'],['resumen','summary_only'],
  ['agenda_only','summary_only'],['solo_agenda','summary_only'],
  ['full','full'],['completa','full'],['completo','full'],['published','full'],
]));
const OWNERSHIP_ALIASES=Object.freeze(new Map([
  ['coach_led','coach_led'],['coach','coach_led'],['entrenador','coach_led'],['dirigida','coach_led'],
  ['client_autonomous','client_autonomous'],['autonomous','client_autonomous'],['autonoma','client_autonomous'],['autonomo','client_autonomous'],
  ['live_online','live_online'],['video_call','live_online'],['videollamada','live_online'],['online_directo','live_online'],
  ['guided_in_app','guided_in_app'],['guided_app','guided_in_app'],['guiada_en_app','guided_in_app'],
]));
const MODALITY_ALIASES=Object.freeze(new Map([
  ['presencial','presencial'],['in_person','presencial'],
  ['guiada_en_app','guiada_en_app'],['guided_app','guiada_en_app'],['online_guiada','guiada_en_app'],
  ['online','online'],['en_linea','online'],
]));
const PUBLIC_STATES=new Set(['published','publicado','publicada','disponible','en_curso','active','activo','enabled','habilitado']);
const TERMINAL_APPOINTMENT_STATES=new Set(['cancelada','cancelado','cancelled','canceled','realizada','realizado','completed']);

export function normalizeClientVisibilityLevel(value){
  return VISIBILITY_ALIASES.get(fold(value))||null;
}
export function normalizeDeliveryOwnership(value){
  return OWNERSHIP_ALIASES.get(fold(value))||null;
}
export function normalizeDeliveryModality(value){
  return MODALITY_ALIASES.get(fold(value))||null;
}
export function publicationState(record){
  return fold(field(record,'status','estado')||'draft');
}
export function isPublishedSession(record){
  return PUBLIC_STATES.has(publicationState(record));
}
// Publication grants visibility, NOT permission to start a new execution.
// RC29's SESION_INICIAR transition accepts only `disponible`; 'publicada'
// is still awaiting enablement, and 'en_curso' belongs to recovery, not a
// second execution. Keep these truths separate across every Client surface.
export function sessionReadyToStart(record){
  const status=publicationState(record);
  // M37 canonical first-publish uses 'publicada' until atomic enablement
  // sets 'disponible'. Never show a new Start on 'en_curso'.
  // Existing V43/legacy entry points retain their pre-M37 state aliases:
  // a separate server authorization is still mandatory on submission.
  const legacyReady=new Set(['published','publicado','active','activo','enabled','habilitado']);
  return (status==='disponible'||legacyReady.has(status))&&sessionHasExecutableBlocks(record);
}
export function sessionDeliveryModality(session={},appointment=null){
  const explicitSession=field(session,'deliveryModality','delivery_modality','modality','modalidad');
  // Session ownership outranks appointment labels, including legacy records.
  // A contradictory explicit session modality must not silently become guided.
  const legacySession=normalizeDeliveryModality(field(session,'execution_type','executionType'));
  const explicitAppointment=field(appointment,'modality','modalidad');
  const legacyAppointment=normalizeDeliveryModality(field(appointment,'mode'));
  const raw=explicitSession ?? legacySession ?? explicitAppointment ?? legacyAppointment;
  // Legacy sessions without explicit delivery remain compatible. An unrecognized
  // explicit delivery is not silently interpreted as autonomous.
  return raw===null?'guiada_en_app':normalizeDeliveryModality(raw)||'unknown';
}
export function sessionDeliveryOwnership(session={},appointment=null){
  const explicit=normalizeDeliveryOwnership(
    field(session,'deliveryOwnership','delivery_ownership','executionMode','execution_mode')
  );
  const modality=sessionDeliveryModality(session,appointment);
  // Presencial cannot be made autonomous by a stale or contradictory flag.
  if(modality==='presencial')return 'coach_led';
  if(explicit)return explicit;
  if(modality==='online')return 'live_online';
  if(modality==='unknown')return 'coach_led';
  return 'client_autonomous';
}
export function sessionVisibilityLevel(session={},appointment=null){
  const explicit=normalizeClientVisibilityLevel(
    field(session,'clientVisibilityLevel','client_visibility_level','visibilityLevel','visibility_level')
  );
  // Explicitly hidden and withdrawn sessions stay hidden regardless of mode.
  if(explicit==='hidden'||booleanField(session,'visibleToClient','visible_to_client','clientVisible','client_visible')===false)return 'hidden';
  const ownership=sessionDeliveryOwnership(session,appointment);
  // A contradictory legacy full-visibility flag cannot expose a supervised session.
  if(ownership==='coach_led'||ownership==='live_online')return 'summary_only';
  return explicit||'full';
}
export function sessionIdOf(record){
  return String(field(record,'id','entityId','entity_id')||'').trim()||null;
}
export function clientIdOf(record){
  return String(field(record,'clientId','client_id','clienteId','cliente_id')||'').trim()||null;
}
export function appointmentSessionId(record){
  return String(field(record,'sessionId','session_id')||'').trim()||null;
}
export function appointmentStartAt(record){
  return field(record,'startAt','start_at','scheduledAt','scheduled_at','date','fecha');
}
// U38 · One legacy canonical session may not impersonate multiple dated
// executions. This is a UX/workflow fence; U31 server authorization remains
// the source of truth. Neither missing appointments nor this pure check grant
// permission to execute a session.
export function legacyStartNeedsOccurrence({
  appointments=[],occurrences=[],sessionId,clientId,
}={}){
  const targetSession=String(sessionId||'').trim();
  const targetClient=String(clientId||'').trim();
  if(!targetSession||!targetClient)return false;
  const confirmed=new Set(['confirmada','confirmado','confirmed','realizada',
    'realizado','completed','completada','completado']);
  const ids=new Set();
  if(Array.isArray(appointments)){
    for(const appointment of appointments){
      if(appointmentSessionId(appointment)!==targetSession
        ||clientIdOf(appointment)!==targetClient
        ||!confirmed.has(fold(field(appointment,'status','estado'))))continue;
      const id=String(field(appointment,'id','entityId','entity_id')||'').trim();
      const start=appointmentStartAt(appointment);
      // Deduplicate multiple representations of the same appointment. Rows
      // without IDs never prove independent occurrences.
      if(id&&dateMs(start)!==null)ids.add(id);
      if(ids.size>1)return true;
    }
  }
  // A provisioned occurrence must never be started through the V26 executor
  // even when there is only one dated occurrence for this prescription.
  if(Array.isArray(occurrences)){
    for(const occurrence of occurrences){
      if(String(field(occurrence,'sessionId','session_id')||'')===targetSession
        &&clientIdOf(occurrence)===targetClient
        &&!['cancelada','cancelado','cancelled','canceled'].includes(
          fold(field(occurrence,'status','estado'))))return true;
    }
  }
  return false;
}

export function appointmentForSession(appointments=[],session={},now=new Date()){
  const sessionId=sessionIdOf(session);
  const clientId=clientIdOf(session);
  if(!sessionId)return null;
  const at=dateMs(now)??Date.now();
  const eligible=(appointments||[]).filter((item)=>
    appointmentSessionId(item)===sessionId&&
    (!clientId||clientIdOf(item)===clientId)&&
    !TERMINAL_APPOINTMENT_STATES.has(fold(field(item,'status','estado')))&&
    dateMs(appointmentStartAt(item))!==null
  );
  // A confirmed future date wins over an older or merely proposed booking.
  // For historical sessions, the latest confirmed past date is preferred.
  const confirmed=(item)=>['confirmada','confirmado','confirmed'].includes(fold(field(item,'status','estado')));
  const group=(item)=>{
    const future=dateMs(appointmentStartAt(item))>=at;
    return (confirmed(item)?0:2)+(future?0:1);
  };
  return eligible.sort((a,b)=>{
    const priority=group(a)-group(b);
    if(priority)return priority;
    const first=dateMs(appointmentStartAt(a)),second=dateMs(appointmentStartAt(b));
    return group(a)%2===0?first-second:second-first;
  })[0]||null;
}
export function appointmentConfirmationState(appointment={},now=new Date(),{
  openHours=48,
  closeMinutes=120,
}={}){
  const start=dateMs(appointmentStartAt(appointment));
  const at=dateMs(now);
  const rawStatus=fold(field(appointment,'status','estado'));
  const confirmedAt=field(appointment,'confirmedByClientAt','confirmed_by_client_at','clientConfirmedAt','client_confirmed_at');
  const changeAt=field(appointment,'changeRequestedAt','change_requested_at');
  // A cancellation or terminal state overrides an earlier client confirmation.
  if(TERMINAL_APPOINTMENT_STATES.has(rawStatus))return Object.freeze({state:'closed',label:'Cerrada',canConfirm:false,canRequestChange:false,opensAt:null,closesAt:null});
  if(changeAt)return Object.freeze({state:'change_requested',label:'Cambio solicitado',canConfirm:false,canRequestChange:false,opensAt:null,closesAt:null});
  if(confirmedAt)return Object.freeze({state:'confirmed',label:'Confirmada por el cliente',canConfirm:false,canRequestChange:false,opensAt:null,closesAt:null});
  if(start===null||at===null)return Object.freeze({state:'unavailable',label:'Horario pendiente',canConfirm:false,canRequestChange:false,opensAt:null,closesAt:null});
  const opensAt=start-(Math.max(0,Number(openHours)||48)*60*60*1000);
  const closesAt=start-(Math.max(0,Number(closeMinutes)||120)*60*1000);
  if(at<opensAt)return Object.freeze({state:'not_open',label:'Confirmación disponible 48 h antes',canConfirm:false,canRequestChange:false,opensAt:new Date(opensAt).toISOString(),closesAt:new Date(closesAt).toISOString()});
  if(at>=closesAt)return Object.freeze({state:'closed',label:'Gestionar con tu Coach',canConfirm:false,canRequestChange:false,opensAt:new Date(opensAt).toISOString(),closesAt:new Date(closesAt).toISOString()});
  return Object.freeze({state:'open',label:'Confirma tu asistencia',canConfirm:true,canRequestChange:true,opensAt:new Date(opensAt).toISOString(),closesAt:new Date(closesAt).toISOString()});
}
export function sessionHasExecutableBlocks(session={}){
  const blocks=field(session,'blocks','bloques');
  if(!Array.isArray(blocks))return false;
  return blocks.some((block)=>{
    if(!block||typeof block!=='object')return false;
    const members=block.exerciseIds??block.exercise_ids;
    if(Array.isArray(members))return members.some((id)=>String(id||'').trim().length>0);
    return Boolean(field(block,'exerciseId','exercise_id','name','title','exerciseName','exercise_name'));
  });
}
export function actorCanExecuteSession({role,session,appointment=null}={}){
  const normalized=fold(role);
  if(['coach','entrenador'].includes(normalized))return true;
  if(['admin','administrador'].includes(normalized))return false;
  if(!['client','cliente'].includes(normalized))return false;
  return isPublishedSession(session) &&
    sessionDeliveryModality(session,appointment)==='guiada_en_app' &&
    sessionVisibilityLevel(session,appointment)==='full' &&
    ['client_autonomous','guided_in_app'].includes(sessionDeliveryOwnership(session,appointment));
}
export function sessionRequiresConfirmedAppointment({role,session,appointment=null}={}){
  const normalized=fold(role);
  const ownership=sessionDeliveryOwnership(session,appointment);
  if(['admin','administrador'].includes(normalized))return false;
  if(['coach','entrenador'].includes(normalized)){
    return ['coach_led','live_online'].includes(ownership);
  }
  return ['coach_led','live_online'].includes(ownership);
}
export function clientSessionProjection(session={},appointment=null,now=new Date()){
  const visibility=sessionVisibilityLevel(session,appointment);
  const ownership=sessionDeliveryOwnership(session,appointment);
  const modality=sessionDeliveryModality(session,appointment);
  const confirmation=appointment?appointmentConfirmationState(appointment,now):null;
  return Object.freeze({
    id:sessionIdOf(session),
    clientId:clientIdOf(session),
    title:String(field(session,'title','titulo','name','nombre')||'Sesión IBERFIT'),
    visibility,
    ownership,
    modality,
    visible:visibility!=='hidden'&&isPublishedSession(session),
    canClientExecute:actorCanExecuteSession({role:'client',session,appointment}),
    canClientStart:actorCanExecuteSession({role:'client',session,appointment})&&sessionReadyToStart(session),
    canCoachExecute:true,
    calendarVisible:visibility!=='hidden'&&Boolean(appointment),
    appointmentId:appointment?String(field(appointment,'id','entityId','entity_id')||''):null,
    startAt:appointment?appointmentStartAt(appointment):field(session,'startAt','start_at','date','fecha'),
    endAt:appointment?field(appointment,'endAt','end_at'):field(session,'endAt','end_at'),
    location:appointment?String(field(appointment,'location','ubicacion')||''):String(field(session,'location','ubicacion')||''),
    confirmation,
    session,
    appointment,
  });
}
// Multiple confirmed dates are visual appointments, NOT independent
// executable occurrences until the U31 scope-aware command API is live.
export function buildClientPlanningItems({sessions=[],appointments=[],now=new Date()}={}){
  const bySession=new Map();
  for(const appointment of appointments||[]){
    const sessionId=appointmentSessionId(appointment);
    const clientId=clientIdOf(appointment);
    const appointmentId=String(field(appointment,'id','entityId','entity_id')||'');
    if(!sessionId||!clientId||!appointmentId
      ||!isClientVisibleAppointment(appointment)
      ||dateMs(appointmentStartAt(appointment))===null)continue;
    const key=clientId+'|'+sessionId;
    if(!bySession.has(key))bySession.set(key,new Map());
    bySession.get(key).set(appointmentId,appointment);
  }
  const output=[];
  const sessionKeys=new Set();
  for(const session of sessions||[]){
    const source=clientSessionProjection(session,null,now);
    if(!source.visible||!source.id)continue;
    const key=String(source.clientId||'')+'|'+String(source.id);
    if(sessionKeys.has(key))continue;
    sessionKeys.add(key);
    const dates=[...(bySession.get(key)?.values()||[])];
    if(!dates.length){output.push(source);continue;}
    const needsOccurrenceEngine=dates.length>1;
    for(const appointment of dates){
      const item=clientSessionProjection(session,appointment,now);
      // A shared prescription can only be consumed once by the legacy V26
      // executor: with multiple dates, no Client CTA may claim per-date start.
      output.push(Object.freeze({
        ...item,
        canClientStart:needsOccurrenceEngine?false:item.canClientStart,
        recurringAwaitingActivation:needsOccurrenceEngine,
      }));
    }
  }
  output.sort((a,b)=>(dateMs(a.startAt)??Number.MAX_SAFE_INTEGER)-
    (dateMs(b.startAt)??Number.MAX_SAFE_INTEGER)||
    String(a.id).localeCompare(String(b.id))||
    String(a.appointmentId||'').localeCompare(String(b.appointmentId||'')));
  return Object.freeze(output);
}
export function clientTaskIsOverdue(item,now=new Date()){
  if(!item?.canClientExecute)return false;
  const end=dateMs(item.endAt||item.startAt);
  const at=dateMs(now);
  return end!==null&&at!==null&&end<at;
}
export const __rc39SessionPolicyInternals=Object.freeze({fold,field,booleanField,dateMs});
