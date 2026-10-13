// One classification for Coach and Admin publication UX. Never label a
// server/refresh problem as an empty form. A confirmed ACK is not revoked by
// delayed UI rehydration.
const MESSAGES=Object.freeze({
  REVISION_MISMATCH:'Este registro cambió en otro dispositivo. Actualiza la vista y revisa la nueva versión; el borrador no se elimina.',
  REVISION_CONFLICT:'Este registro cambió en otro dispositivo. Actualiza la vista y revisa la nueva versión; el borrador no se elimina.',
  ENTITY_NOT_FOUND:'El servidor no encontró esta versión del registro. Actualiza la vista antes de volver a publicar; el borrador se conserva.',
  CONFIRMED_APPOINTMENT_REQUIRED:'La sesión presencial necesita una cita confirmada para comenzar.',
  TRAINING_SERVICE_NOT_ACTIVE:'El servicio de entrenamiento no está activo. Revisa su estado antes de publicar o iniciar.',
  M37_PRESCRIPTION_INCOMPLETE:'La prescripción necesita título, modalidad y al menos un bloque de ejercicios antes de publicarse.',
  M37_START_PATCH_FORBIDDEN:'No puedes modificar la prescripción al iniciar una sesión. Reabre su edición con el Coach.',
});
function normalizedCode(result){
  return String(result?.response?.reason||result?.reason||result?.operation?.errorCode||
    result?.message||result?.kind||'').trim().toUpperCase();
}
export function mutationFeedback(result,{
  success='Cambio confirmado y guardado.',
  subject='El registro',
}={}){
  if(result?.ok===true){
    if(result.refreshOk===false||result.refreshPending===true||result.lineageOk===false){
      return Object.freeze({kind:'warning',confirmed:true,retryMutation:false,
        message:`${success} El servidor confirmó el cambio, pero la vista o la sincronización aún no se ha actualizado. Actualiza antes de repetir la acción.`});
    }
    return Object.freeze({kind:'success',confirmed:true,retryMutation:false,message:success});
  }
  const code=normalizedCode(result);
  if(MESSAGES[code])return Object.freeze({kind:'error',confirmed:false,retryMutation:false,message:MESSAGES[code],code});
  if(/REVISION|CONFLICT|TRANSITION_INVALID|INVALID_TRANSITION|ENTITY_NOT_FOUND|NOT_FOUND|STALE/u.test(code)){
    return Object.freeze({kind:'error',confirmed:false,retryMutation:false,code,
      message:`${subject} ha cambiado o la versión no coincide. Actualiza la vista y revisa el registro antes de intentar otra vez.`});
  }
  if(/PREVIEW|REVIEW_ACCEPTED/u.test(code)){
    return Object.freeze({kind:'error',confirmed:false,retryMutation:false,code,
      message:'Falta confirmar la revisión previa a la publicación. Marca la casilla de revisión y vuelve a publicar.'});
  }
  if(/ROLE|FORBIDDEN|UNAUTHORIZED|PERMISSION|AUTH_REQUIRED/u.test(code)){
    return Object.freeze({kind:'error',confirmed:false,retryMutation:false,code,
      message:'La sesión o los permisos no autorizan esta acción. Comprueba tu acceso y el cliente seleccionado.'});
  }
  if(/NETWORK|TIMEOUT|FETCH|PENDING|QUEUED/u.test(code)){
    return Object.freeze({kind:'warning',confirmed:false,retryMutation:false,code,
      message:'No se ha podido verificar la respuesta del servidor. El borrador se conserva: comprueba el estado remoto antes de repetir la operación.'});
  }
  if(/REQUIRED|INVALID|MISSING|INCOMPLETE|EMPTY/u.test(code)){
    return Object.freeze({kind:'error',confirmed:false,retryMutation:false,code,
      message:'Hay algún dato requerido o incoherente para esta operación. Revisa los campos señalados antes de continuar.'});
  }
  return Object.freeze({kind:'error',confirmed:false,retryMutation:false,code,
    message:'El servidor no confirmó este cambio. Conservamos los datos; consulta la versión actual y revisa el detalle del error antes de reintentar.'});
}
export function publicationActionKey({action,entity,entityId,clientId}={}){
  const name=String(action||'').trim();
  if(!['manage-publication','validate-plan','approve-report','confirm-appointment','create-appointment','complete-iri','create-client-draft'].includes(name))return null;
  return [name==='manage-publication'?'manage-publication':name,String(entity||'').trim(),String(entityId||clientId||'').trim()].join(':');
}
