const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export function verifyInvitationReceipt(receipt,{operationId,clientId=null,type='ADMIN_CLIENTE_REENVIAR_INVITACION'}={}){
  const id=String(receipt?.clientId||'').toLowerCase();
  if(receipt?.ok!==true||!['ack','duplicate'].includes(String(receipt?.kind||'').toLowerCase())
    ||!operationId||receipt.operationId!==operationId||receipt.commandType!==type
    ||!UUID.test(id)||String(receipt.entityId||'').toLowerCase()!==id
    ||(clientId&&String(clientId).toLowerCase()!==id)
    ||!receipt.invitation||typeof receipt.invitation!=='object'||Array.isArray(receipt.invitation))
    throw Error('M26_INVITATION_RECEIPT_SCOPE_INVALID');
  return receipt;
}
// One pending operation per client and session. No persistence or background resend.
export function createInvitationAttemptTracker({limit=64}={}){
  let owner=null;const attempts=new Map();
  function scope(lease){if(!lease)throw Error('M26_INVITATION_SESSION_CHANGED');if(owner!==lease){attempts.clear();owner=lease;}}
  return Object.freeze({
    begin(lease,clientId,newId){
      scope(lease);const key=String(clientId||'').toLowerCase();if(!UUID.test(key))throw Error('M26_INVITATION_RECEIPT_SCOPE_INVALID');
      if(attempts.has(key))return attempts.get(key);
      if(attempts.size>=limit)throw Error('M26_INVITATION_REVIEW_REQUIRED');
      const op=String(newId()||'');if(!op)throw Error('M26_INVITATION_RECEIPT_SCOPE_INVALID');attempts.set(key,op);return op;
    },
    settle(lease,clientId,operationId,receipt){
      if(owner!==lease)return false;const key=String(clientId||'').toLowerCase();
      if(attempts.get(key)!==operationId)return false;
      verifyInvitationReceipt(receipt,{clientId:key,operationId});
      const outcome=coachInvitationOutcome(receipt);
      // An explicitly acknowledged pre-dispatch failure can be retried with a new operation.
      // A legacy generic error cannot establish absence of an accepted message.
      if(outcome.confirmed||(outcome.kind==='error'&&['pre_dispatch_failed','delivery_rejected_confirmed'].includes(receipt.invitation.reason)))attempts.delete(key);
      return true;
    },
    clear(){attempts.clear();owner=null;},
  });
}
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
    message:'La invitación está pendiente de confirmación. Comprueba su estado; repetir la acción consultará el mismo intento durante esta sesión.',
  });
  return Object.freeze({kind:'error',confirmed:false,message:'No se pudo confirmar el estado de la invitación.'});
}
