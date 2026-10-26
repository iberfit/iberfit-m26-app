import {createM26Id} from '../platform/id.js';
import {normalizeAppointmentModality} from '../domain/modality.js';
import {
  isClientVisibleAppointment,
  normalizeAppointmentStatus,
} from '../domain/appointment.js';

function validDate(value){const time=new Date(value).getTime();return Number.isFinite(time)?time:null;}
export function validateAppointmentDraft(draft={}){
  const errors=[];
  for(const key of ['clientId','startAt','endAt','modality'])if(!draft[key])errors.push(key);
  const start=validDate(draft.startAt),end=validDate(draft.endAt);
  if(draft.startAt&&start===null)errors.push('startAt');
  if(draft.endAt&&end===null)errors.push('endAt');
  if(start!==null&&end!==null&&end<=start)errors.push('endAt');
  const modality=normalizeAppointmentModality(draft.modality);
  if(draft.modality&&!modality)errors.push('modality');
  if(modality==='presencial'&&!String(draft.location||'').trim())errors.push('location');

  const requestedStatus=normalizeAppointmentStatus(draft.status);
  const status=draft.id?(requestedStatus||'propuesta'):'propuesta';
  const visibleToClient=isClientVisibleAppointment({
    status,
    visibleToClient:draft.visibleToClient,
  });

  return {
    ok:errors.length===0,
    errors:[...new Set(errors)],
    normalized:{
      ...draft,
      modality,
      location:String(draft.location||'').trim().slice(0,300),
      status,
      visibleToClient,
    },
  };
}
export function buildAppointmentCommand(draft,revision=0){
  const validation=validateAppointmentDraft(draft);
  if(!validation.ok)throw new Error(`M26_APPOINTMENT_INVALID:${validation.errors.join(',')}`);
  const normalized=validation.normalized;
  return {type:normalized.id?'CITA_REPROGRAMAR':'CITA_CREAR',entityType:'appointment',entityId:normalized.id||createM26Id(),clientId:normalized.clientId,baseRevision:revision,reason:normalized.id?(normalized.reason||'Reprogramación solicitada'):null,payload:{appointment:structuredClone(normalized)}};
}
export function buildCancelAppointmentCommand({clientId,appointmentId,reason},revision=0){if(!clientId||!appointmentId||!reason)throw new Error('M26_APPOINTMENT_CANCEL_CONTEXT_REQUIRED');return {type:'CITA_CANCELAR',entityType:'appointment',entityId:appointmentId,clientId,baseRevision:revision,reason,payload:{patch:{cancellationReason:reason}}};}

export function buildConfirmAppointmentCommand({clientId,appointmentId},revision=0){
  if(!clientId||!appointmentId)throw new Error('M26_APPOINTMENT_CONFIRM_CONTEXT_REQUIRED');
  return {type:'CITA_CONFIRMAR',entityType:'appointment',entityId:appointmentId,clientId,baseRevision:revision,payload:{patch:{status:'confirmada',visibleToClient:true,confirmedAt:new Date().toISOString()}}};
}

// B19. Single eligibility contract shared by Coach Agenda projections and
// the actual CITA_CREAR write. A visible option is NEVER an authorization.
const LINKABLE_STATES=new Set(['publicada','publicado','published','disponible','habilitado']);
function sessionField(record,...keys){
  const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?record.body:{};
  for(const key of keys){
    const value=record?.[key]??body[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
}
export function linkableSessionsForCoachAgenda(state,visibleClientIds=[]){
  const visible=new Set((Array.isArray(visibleClientIds)?visibleClientIds:[])
    .map(x=>String(x||'').trim()).filter(Boolean));
  if(!visible.size)return Object.freeze([]);
  const latest=new Map();
  for(const record of state?.collections?.sessions||[]){
    const clientId=String(sessionField(record,'clientId','client_id')||'').trim();
    const id=String(sessionField(record,'id')||'').trim();
    if(!visible.has(clientId)||!id)continue;
    const revision=Number(sessionField(record,'revision')||0);
    const previous=latest.get(id);
    if(previous&&previous.revision>revision)continue;
    latest.set(id,{record,id,clientId,revision});
  }
  return Object.freeze([...latest.values()]
    .filter(({record})=>LINKABLE_STATES.has(
      String(sessionField(record,'status','estado')||'').trim().toLowerCase()))
    .map(({record,id,clientId})=>{
      const rawMinutes=sessionField(record,'durationMinutes','duration_minutes');
      const minutes=rawMinutes==null?NaN:Number(rawMinutes);
      const mode=String(sessionField(record,'deliveryModality','delivery_modality')||'').trim();
      return Object.freeze({id,clientId,
        title:String(sessionField(record,'title','name')||'').trim().slice(0,120),
        deliveryModality:['presencial','guiada_en_app'].includes(mode)?mode:'',
        durationMinutes:Number.isFinite(minutes)&&minutes>=10&&minutes<=240
          ?minutes:null,
      });
    })
    .sort((a,b)=>a.clientId.localeCompare(b.clientId)||
      a.title.localeCompare(b.title)||a.id.localeCompare(b.id)));
}
export function resolveCoachAppointmentSessionLink(state,{clientId,sessionId}={}){
  const owner=String(clientId||'').trim(),id=String(sessionId||'').trim();
  if(!owner)throw new Error('M26_APPOINTMENT_CLIENT_REQUIRED');
  if(!id)return null;
  const linked=linkableSessionsForCoachAgenda(state,[owner])
    .find(item=>item.id===id);
  if(!linked)throw new Error('M26_APPOINTMENT_LINKED_SESSION_NOT_AVAILABLE');
  return linked;
}

// IBERFIT appointments are always civil times in America/Santiago, NOT the
// browser's machine timezone. DST gaps/folds fail closed instead of silently
// shifting a session by an hour on travel, refresh or another device.
const SANTIAGO_FORMATTER=new Intl.DateTimeFormat('en-GB',{
  timeZone:'America/Santiago',year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
});
export function santiagoAppointmentInstant(value){
  const match=String(value||'').match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u
  );
  if(!match)throw new Error('M26_APPOINTMENT_DATE_INVALID');
  const [year,month,day,hour,minute]=match.slice(1).map(Number);
  const naive=Date.UTC(year,month-1,day,hour,minute);
  const clock=new Date(naive);
  if(clock.getUTCFullYear()!==year||clock.getUTCMonth()+1!==month||
    clock.getUTCDate()!==day||clock.getUTCHours()!==hour||
    clock.getUTCMinutes()!==minute)
    throw new Error('M26_APPOINTMENT_DATE_INVALID');
  const wanted=[year,month,day,hour,minute].join('|');
  const matches=[];
  for(let offset=-14*60;offset<=14*60;offset+=15){
    const candidate=naive+offset*60000;
    const parts=Object.fromEntries(
      SANTIAGO_FORMATTER.formatToParts(new Date(candidate))
        .filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)])
    );
    if([parts.year,parts.month,parts.day,parts.hour,parts.minute].join('|')===wanted)
      matches.push(candidate);
  }
  if(matches.length!==1)
    throw new Error(matches.length
      ?'M26_APPOINTMENT_DST_AMBIGUOUS':'M26_APPOINTMENT_DST_GAP');
  return new Date(matches[0]).toISOString();
}
