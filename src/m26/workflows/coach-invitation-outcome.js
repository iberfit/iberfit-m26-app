// Treat a provider ACK as delivery acceptance, never as proof of receipt.
// Retryable/pending outcomes are distinct from confirmed sends.
export function coachInvitationOutcome(receipt){
  const result=receipt?.invitation;
  if(receipt?.ok!==true||!result||typeof result!=='object'){
    return Object.freeze({kind:'error',confirmed:false,message:'El proveedor no confirmó la invitación.'});
  }
  const status=String(result.deliveryStatus||'').trim().toLowerCase();
  const reason=String(result.reason||'').trim().toLowerCase();
  if(status==='error')return Object.freeze({
    kind:'error',confirmed:false,
    message:'La invitación falló. Comprueba su estado antes de volver a enviarla.',
  });
  if(reason==='already_active')return Object.freeze({
    kind:'existing',confirmed:true,message:'Este cliente ya tiene acceso IBERFIT activo.',
  });
  if(reason==='already_sent'||status==='sent')return Object.freeze({
    kind:'sent',confirmed:true,
    message:'El proveedor aceptó la invitación. La recepción debe confirmarla el cliente.',
  });
  if(reason==='operation_already_prepared'||status==='pending')return Object.freeze({
    kind:'pending',confirmed:false,
    message:'Hay una invitación en curso. Comprueba su estado antes de volver a enviarla.',
  });
  return Object.freeze({kind:'error',confirmed:false,message:'No se pudo confirmar el estado de la invitación.'});
}
