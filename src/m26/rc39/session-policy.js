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
const PUBLIC_STATES=new Set(['published','publicado','active','activo','enabled','habilitado']);
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
export function sessionDeliveryModality(session={},appointment=null){
  return normalizeDeliveryModality(
    field(session,'deliveryModality','delivery_modality','modality','modalidad') ??
    field(appointment,'modality','modalidad')
  ) || 'guiada_en_app';
}
export function sessionDeliveryOwnership(session={},appointment=null){
  const explicit=normalizeDeliveryOwnership(
    field(session,'deliveryOwnership','delivery_ownership','executionMode','execution_mode')
  );
  if(explicit)return explicit;
  const modality=sessionDeliveryModality(session,appointment);
  if(modality==='presencial')return 'coach_led';
  if(modality==='online')return 'live_online';
  return 'client_autonomous';
}
export function sessionVisibilityLevel(session={},appointment=null){
  const explicit=normalizeClientVisibilityLevel(
    field(session,'clientVisibilityLevel','client_visibility_level','visibilityLevel','visibility_level')
  );
  if(explicit)return explicit;
  if(booleanField(session,'visibleToClient','visible_to_client','clientVisible','client_visible')===false){
    return 'hidden';
  }
  const ownership=sessionDeliveryOwnership(session,appointment);
  if(ownership==='coach_led'||ownership==='live_online')return 'summary_only';
  return 'full';
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
export function appointmentForSession(appointments=[],session={}){
  const sessionId=sessionIdOf(session);
  const clientId=clientIdOf(session);
  const direct=(appointments||[]).filter((item)=>
    appointmentSessionId(item)===sessionId &&
    (!clientId||clientIdOf(item)===clientId)
  );
  if(direct.length){
    return direct.sort((a,b)=>(dateMs(appointmentStartAt(a))??Number.MAX_SAFE_INTEGER)-(dateMs(appointmentStartAt(b))??Number.MAX_SAFE_INTEGER))[0];
  }
  return null;
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
  if(confirmedAt)return Object.freeze({state:'confirmed',label:'Confirmada por el cliente',canConfirm:false,canRequestChange:false,opensAt:null,closesAt:null});
  if(changeAt)return Object.freeze({state:'change_requested',label:'Cambio solicitado',canConfirm:false,canRequestChange:false,opensAt:null,closesAt:null});
  if(TERMINAL_APPOINTMENT_STATES.has(rawStatus))return Object.freeze({state:'closed',label:'Cerrada',canConfirm:false,canRequestChange:false,opensAt:null,closesAt:null});
  if(start===null||at===null)return Object.freeze({state:'unavailable',label:'Horario pendiente',canConfirm:false,canRequestChange:false,opensAt:null,closesAt:null});
  const opensAt=start-(Math.max(0,Number(openHours)||48)*60*60*1000);
  const closesAt=start-(Math.max(0,Number(closeMinutes)||120)*60*1000);
  if(at<opensAt)return Object.freeze({state:'not_open',label:'Confirmación disponible 48 h antes',canConfirm:false,canRequestChange:false,opensAt:new Date(opensAt).toISOString(),closesAt:new Date(closesAt).toISOString()});
  if(at>=closesAt)return Object.freeze({state:'closed',label:'Gestionar con tu Coach',canConfirm:false,canRequestChange:false,opensAt:new Date(opensAt).toISOString(),closesAt:new Date(closesAt).toISOString()});
  return Object.freeze({state:'open',label:'Confirma tu asistencia',canConfirm:true,canRequestChange:true,opensAt:new Date(opensAt).toISOString(),closesAt:new Date(closesAt).toISOString()});
}
export function actorCanExecuteSession({role,session,appointment=null}={}){
  const normalized=fold(role);
  if(['coach','entrenador'].includes(normalized))return true;
  if(['admin','administrador'].includes(normalized))return false;
  if(!['client','cliente'].includes(normalized))return false;
  return isPublishedSession(session) &&
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
export function buildClientPlanningItems({sessions=[],appointments=[],now=new Date()}={}){
  return Object.freeze((sessions||[])
    .map((session)=>clientSessionProjection(session,appointmentForSession(appointments,session),now))
    .filter((item)=>item.visible)
    .sort((a,b)=>(dateMs(a.startAt)??Number.MAX_SAFE_INTEGER)-(dateMs(b.startAt)??Number.MAX_SAFE_INTEGER)));
}
export function clientTaskIsOverdue(item,now=new Date()){
  if(!item?.canClientExecute)return false;
  const end=dateMs(item.endAt||item.startAt);
  const at=dateMs(now);
  return end!==null&&at!==null&&end<at;
}
export const __rc39SessionPolicyInternals=Object.freeze({fold,field,booleanField,dateMs});
