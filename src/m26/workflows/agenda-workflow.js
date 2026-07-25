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
