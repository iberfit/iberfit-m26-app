import {appointmentConfirmationState} from './session-policy.js';

const safe=(value,max=500)=>String(value??'')
  .replace(/[\u0000-\u001f\u007f]/g,' ')
  .replace(/\s+/g,' ')
  .trim()
  .slice(0,max);

function requiredId(value,code){
  const id=safe(value,180);
  if(!id)throw new Error(code);
  return id;
}
function assertClientWindow(startAt,now){
  const confirmation=appointmentConfirmationState({startAt,status:'confirmada'},now);
  if(confirmation.state!=='open')throw new Error('M26_APPOINTMENT_CONFIRMATION_WINDOW_CLOSED');
  return confirmation;
}
export function buildClientConfirmAppointmentCommand({
  clientId,
  appointmentId,
  startAt,
}={},revision=0,now=()=>new Date()){
  const at=typeof now==='function'?now():now;
  assertClientWindow(startAt,at);
  return {
    type:'CITA_CONFIRMAR',
    entityType:'appointment',
    entityId:requiredId(appointmentId,'M26_APPOINTMENT_CONFIRM_CONTEXT_REQUIRED'),
    clientId:requiredId(clientId,'M26_APPOINTMENT_CONFIRM_CONTEXT_REQUIRED'),
    baseRevision:Number.isInteger(Number(revision))&&Number(revision)>=0?Number(revision):0,
    payload:{
      patch:{
        clientResponse:'confirmed',
        confirmedByClientAt:new Date(at).toISOString(),
      },
    },
  };
}
