const REVIEWABLE_SYNC_STATES=new Set(['conflict','rejected']);
export const TRAINING_SERVICE_NOT_ACTIVE='TRAINING_SERVICE_NOT_ACTIVE';
const ACTIONABLE_FAILURE_MESSAGES=Object.freeze({
  M26_EXECUTION_RESULT_REQUIRED:{message:'Registra repeticiones o tiempo antes de completar la serie.',focusSelector:'[data-set-field="reps"]'},
  M26_EXECUTION_REPS_INVALID:{message:'Revisa las repeticiones: deben ser un valor válido entre 0 y 10.000.',focusSelector:'[data-set-field="reps"]'},
  M26_EXECUTION_SECONDS_INVALID:{message:'Revisa el tiempo: debe ser un valor válido entre 0 y 86.400 segundos.',focusSelector:'[data-set-field="seconds"]'},
  M26_EXECUTION_RPE_INVALID:{message:'Registra un RPE válido entre 1 y 10.',focusSelector:'[data-set-field="rpe"]'},
  M26_EXECUTION_RPE_OBSERVED_REQUIRED:{message:'Confirma el RPE real de esta serie antes de repetir la referencia anterior.',focusSelector:'[data-set-field="rpe"]'},
  M26_EXECUTION_RIR_INVALID:{message:'Revisa el RIR: debe estar entre 0 y 10, o déjalo vacío.',focusSelector:'[data-set-field="rir"]'},
  M26_EXECUTION_SESSION_RPE_REQUIRED:{message:'Registra el RPE global de la sesión entre 1 y 10.',focusSelector:'[data-session-feedback-rpe]'},
  M26_EXECUTION_FEEDBACK_REQUIRED:{message:'Añade un comentario final antes de cerrar la sesión.',focusSelector:'[data-session-feedback-comment]'},
  M26_EXECUTION_PAIN_NOTES_REQUIRED:{message:'Describe brevemente la molestia o dolor antes de finalizar.',focusSelector:'[data-session-feedback-pain-notes]'},
  M26_EXECUTION_CANCEL_REASON_REQUIRED:{message:'Indica el motivo de cancelación antes de confirmar.',focusSelector:'[data-session-cancel-reason]'},
  M26_EXECUTION_SKIP_SET_REASON_REQUIRED:{message:'Indica por qué se omite esta serie antes de continuar.',focusSelector:'[data-session-skip-set-reason]'},
  M26_EXECUTION_SKIP_EXERCISE_REASON_REQUIRED:{message:'Indica por qué se omite este ejercicio antes de continuar.',focusSelector:'[data-session-skip-exercise-reason]'},
  M26_EXECUTION_SKIP_RECORDED_SET_FORBIDDEN:'Esta serie ya está registrada. Corrígela o avanza sin omitirla.',
  M26_EXECUTION_SUBSTITUTION_REASON_REQUIRED:{message:'Indica el motivo del cambio de ejercicio.',focusSelector:'[data-session-substitute-reason]'},
  M26_EXECUTION_SUBSTITUTE_SAME:{message:'Selecciona un ejercicio diferente para realizar la sustitución.',focusSelector:'[data-session-substitute]'},
  M26_EXECUTION_SUBSTITUTE_NOT_IN_CATALOG:{message:'Selecciona un ejercicio válido de la biblioteca IBERFIT.',focusSelector:'[data-session-substitute]'},
  M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED:'Este ejercicio ya tiene trabajo resuelto. Mantén lo registrado y modifica solo el trabajo pendiente disponible.',
  M26_EXECUTION_ADD_EXERCISE_NOT_IN_CATALOG:{message:'Selecciona un ejercicio válido de la biblioteca antes de añadirlo.',focusSelector:'[data-session-live-add-exercise]'},
  M26_EXECUTION_ADD_EXERCISE_SETS_INVALID:{message:'Revisa el número de series del ejercicio añadido.',focusSelector:'[data-session-live-add-sets]'},
  M26_EXECUTION_ADD_EXERCISE_REST_INVALID:{message:'Revisa el descanso del ejercicio añadido.',focusSelector:'[data-session-live-add-rest]'},
  M26_EXECUTION_ADD_EXERCISE_RPE_INVALID:{message:'Revisa el RPE objetivo del ejercicio añadido: debe estar entre 1 y 10.',focusSelector:'[data-session-live-add-rpe]'},
  M26_EXECUTION_ADD_EXERCISE_RIR_INVALID:{message:'Revisa el RIR objetivo del ejercicio añadido: debe estar entre 0 y 10.',focusSelector:'[data-session-live-add-rir]'},
  M26_EXECUTION_SET_LIMIT:'Se alcanzó el límite de series permitido para este ejercicio.',
  M26_EXECUTION_EXTRA_SET_LAST_SET_REQUIRED:'La serie extra rápida solo puede añadirse después de completar la última serie actual.',
  M26_EXECUTION_EXTRA_SET_GROUP_ORDER_REQUIRED:'Completa primero el orden actual del grupo antes de añadir una ronda o serie extra.',
  M26_EXECUTION_PREVIOUS_SET_UNAVAILABLE:'Aún no hay una serie anterior válida para reutilizar.',
});

function normalizedRole(role){
  return String(role||'').trim().toLowerCase();
}

function isCoachRole(role){
  return ['coach','entrenador'].includes(normalizedRole(role));
}

export function sessionCommandFailureReason(source){
  return String(
    source?.result?.response?.reason
    ||source?.response?.reason
    ||source?.operation?.errorCode
    ||source?.lastSyncError
    ||source?.code
    ||source?.message
    ||''
  ).trim().toUpperCase();
}

export function sessionCommandFailureOutcome(source,{role='',action='',phase='action'}={}){
  const reason=sessionCommandFailureReason(source);
  const coach=isCoachRole(role);
  if(reason!==TRAINING_SERVICE_NOT_ACTIVE){
    if(phase==='sync')return null;
    const recovery=ACTIONABLE_FAILURE_MESSAGES[reason];
    if(!recovery)return null;
    return Object.freeze({status:'retry',code:reason,...recovery});
  }
  if(phase==='sync'){
    return Object.freeze({
      status:'error',
      code:reason,
      message:coach
        ?'El servicio de entrenamiento no está activo. El inicio pendiente no puede confirmarse. El progreso local se conserva para revisión; revisa el servicio del cliente.'
        :'Esta sesión ya no puede sincronizarse. Tu progreso de este dispositivo se conserva para revisión.',
    });
  }
  if(action==='start'){
    return Object.freeze({
      status:'error',
      code:reason,
      message:coach
        ?'El servicio de entrenamiento no está activo. La sesión no se inició. Revisa el servicio del cliente antes de volver a intentarlo.'
        :'Esta sesión ya no está disponible para iniciar. No se ha perdido ningún dato.',
    });
  }
  return Object.freeze({
    status:'error',
    code:reason,
    message:coach
      ?'El servicio de entrenamiento no está activo. No se puede crear ni reactivar trabajo nuevo para este cliente.'
      :'Esta acción de entrenamiento ya no está disponible.',
  });
}

export function sessionRejectedSyncOutcome(execution,{role=''}={}){
  return sessionCommandFailureOutcome(execution,{role,phase:'sync'});
}

export function sessionSyncNeedsRecoveryReview(execution,{role=''}={}){
  const actorRole=normalizedRole(role);
  const status=String(execution?.syncStatus||'').trim().toLowerCase();
  return ['coach','entrenador'].includes(actorRole)&&REVIEWABLE_SYNC_STATES.has(status);
}

export function enhanceSessionSyncRecoveryBanner(root,execution,{role=''}={}){
  const status=String(execution?.syncStatus||'').trim().toLowerCase();
  if(!REVIEWABLE_SYNC_STATES.has(status))return false;
  const banner=root?.querySelector?.(`.m26-sync-banner.is-${status}`)||null;
  if(!banner)return false;
  if(banner.getAttribute?.('role')==='alert'){
    banner.setAttribute?.('aria-live','assertive');
    banner.setAttribute?.('aria-atomic','true');
  }
  if(!sessionSyncNeedsRecoveryReview(execution,{role}))return true;
  if(banner.querySelector?.('[data-session-recovery-review]'))return true;
  const documentLike=banner.ownerDocument||root?.ownerDocument||null;
  const button=documentLike?.createElement?.('button')||null;
  if(!button)return false;
  button.type='button';
  button.className='m26-text-action';
  button.setAttribute('data-session-action','exit-session');
  button.setAttribute('data-session-exit-target','verificacion');
  button.setAttribute('data-session-recovery-review','true');
  button.textContent='Requiere revisión de sincronización';
  banner.append?.(button);
  return true;
}

export function sessionExitTarget(button){
  return button?.getAttribute?.('data-session-exit-target')==='verificacion'
    ?'verificacion'
    :'sesion';
}

export function openSessionRecoveryReview(root){
  const target=root?.querySelector?.('[data-m26-area="verificacion"]')||null;
  if(typeof target?.click!=='function')return false;
  target.click();
  return true;
}
