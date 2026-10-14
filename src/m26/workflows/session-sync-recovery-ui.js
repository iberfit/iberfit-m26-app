const REVIEWABLE_SYNC_STATES=new Set(['conflict','rejected']);
export const TRAINING_SERVICE_NOT_ACTIVE='TRAINING_SERVICE_NOT_ACTIVE';
const ACTIONABLE_FAILURE_MESSAGES=Object.freeze({
  ENTITY_NOT_FOUND:{message:'La sesión aún no existe en el servidor. El borrador está conservado: vuelve a revisar la sesión antes de publicar; no crees copias.',focusSelector:'[data-session-action="preview"]'},
  REVISION_MISMATCH:{message:'La sesión cambió desde otra pestaña o dispositivo. Actualiza su información antes de volver a publicar.',focusSelector:'[data-session-action="preview"]'},
  PREVIEW_REQUIRED:{message:'Revisa la vista previa de la sesión y confirma los datos antes de publicarla.',focusSelector:'[data-session-action="preview"]'},
  M26_SESSION_CONFIRM_NOT_VISIBLE:{message:'La publicación fue aceptada, pero no se pudo confirmar su visibilidad. El borrador se conserva. Revisa el estado antes de repetir.',focusSelector:'[data-session-action="preview"]'},
  // These failures occur before a remote start is committed. Give Client a
  // specific recovery path instead of the generic application error banner.
  M43_CLIENT_SESSION_NOT_READY:'La sesión ya no está habilitada para iniciar. Actualiza tus sesiones y consulta con tu Coach si sigue apareciendo disponible.',
  M43_CLIENT_EXECUTION_SCOPE_CONFLICT:'La sesión corresponde a otro expediente o está desactualizada. Vuelve a abrirla desde tu planificación.',
  M26_OFFLINE_START_NOT_ALLOWED:'Necesitas conexión para confirmar el inicio de esta sesión. Tu planificación sigue disponible y no se ha creado otra ejecución.',
  M26_AUTH_REQUIRED:'Tu acceso necesita renovarse antes de iniciar. Vuelve a autenticarte y abre la misma sesión; no se han perdido datos.',
  M26_EXECUTION_NOT_READY:'Esta ejecución ya no está en preparación. Revisa si tienes una sesión en curso o recuperable antes de intentar otra.',
  M26_COMMAND_CONTRACT_INVALID:'La aplicación no pudo validar la orden de inicio. Actualiza la sesión y vuelve a entrar; si persiste, el equipo IBERFIT debe revisar la autorización.',
  REVISION_MISMATCH:'La sesión ha cambiado desde que la abriste. Vuelve a entrar desde Sesiones para cargar su última revisión.',
  INVALID_TRANSITION:'El estado de esta sesión ha cambiado y ya no permite iniciar otra ejecución. Revisa la sesión actualizada.',
  CONFIRMED_APPOINTMENT_REQUIRED:'El servidor solicita una cita confirmada para este inicio. Si tu sesión es guiada en la app, pide al equipo IBERFIT que revise su habilitación.',
  ACTIVE_EXECUTION_EXISTS:'Ya existe un entrenamiento activo asociado a tu cuenta. Revisa la recuperación de sesión antes de iniciar otro; no se ha creado una ejecución duplicada.',
  M28_COACH_LED_CLIENT_START_FORBIDDEN:'Esta sesión requiere ejecución supervisada y no puede iniciarse como entrenamiento autónomo. Consulta con tu Coach.',
  M26_EXECUTION_BLOCK_INVALID:'La prescripción contiene un bloque que no puede ejecutarse. La planificación sigue guardada; tu Coach debe revisar ese ejercicio.',
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
  M26_EXECUTION_STRUCTURE_UNDO_UNAVAILABLE:'Este ajuste ya tiene trabajo registrado o dejó de ser la última modificación; no puede deshacerse de forma segura.',
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

export function sessionCommandFailureOutcome(source,{role='',action='',phase='action',draft=null,catalog=null}={}){
  const reason=sessionCommandFailureReason(source);
  const raw=String(source?.message||source?.code||'');
  if(phase!=='sync'&&raw.startsWith('M26_SESSION_DRAFT_INVALID:')){
    const issue=raw.slice('M26_SESSION_DRAFT_INVALID:'.length).split(',')[0];
    const colon=issue.indexOf(':');
    const kind=colon<0?issue:issue.slice(0,colon);
    const exerciseId=colon<0?'':issue.slice(colon+1);
    const exercise=catalog?.get?.(exerciseId);
    const name=String(exercise?.name_es||exercise?.name||exerciseId||'este ejercicio').slice(0,100);
    const block=(draft?.blocks||[]).find(b=>b.exerciseId===exerciseId||(b.exerciseIds||[]).includes(exerciseId));
    const bid=String(block?.id||'');
    const field=(attr)=>/^[A-Za-z0-9._:-]{1,160}$/.test(bid)?'[data-block-id="'+bid+'"][data-session-block-field="'+attr+'"]':null;
    const messages={
      clientId:'Selecciona un cliente válido antes de revisar la sesión.',
      title:'Introduce un título para la sesión.',
      durationMinutes:'La duración debe estar entre 10 y 240 minutos.',
      deliveryModality:'Selecciona cómo se realizará la sesión.',
      blocks:'Añade al menos un ejercicio para revisar la sesión.',
      exercise:'El ejercicio "'+name+'" no está disponible en la biblioteca.',
      prescription:'Revisa series, objetivo, descansos y esfuerzo de "'+name+'".',
      metrics:'Completa un objetivo válido de tiempo o distancia para "'+name+'". No necesitas introducir repeticiones ficticias.',
      alternative:'Revisa la alternativa seleccionada para "'+name+'".',
      group:'Revisa los ejercicios del circuito o grupo.',
      groupType:'Revisa el tipo de grupo de entrenamiento.',
      rounds:'Indica un número válido de rondas.',
      blockId:'Hay un bloque duplicado o sin identificador en la sesión.'
    };
    const focus=kind==='title'||kind==='durationMinutes'||kind==='deliveryModality'
      ?'[data-session-draft-field="'+kind+'"]'
      :kind==='blocks'?'[data-session-search]'
      :kind==='metrics'||kind==='prescription'?field('plannedDurationMinutes'):null;
    return Object.freeze({status:'retry',code:'M26_SESSION_DRAFT_INVALID',message:messages[kind]||'Revisa los valores del bloque antes de publicar.',focusSelector:focus,blockId:bid||null});
  }
  const coach=isCoachRole(role);
  if(phase!=='sync'&&/^M26_SESSION_DRAFT_(?:SAVE|PERSISTENCE)_FAILED/.test(reason)){
    return Object.freeze({status:'retry',code:'M26_SESSION_DRAFT_SAVE_FAILED',message:'No se ha podido guardar el borrador ni en este dispositivo ni en el servidor. Mantén la sesión abierta y comprueba la conexión y el almacenamiento antes de salir.'});
  }
  if(phase!=='sync'&&reason==='M26_SESSION_PREVIEW_REQUIRED'){
    return Object.freeze({status:'retry',code:reason,message:'Revisa primero la sesión y confirma la vista previa antes de publicar.',focusSelector:'[data-session-action="preview"]'});
  }
  if(reason!==TRAINING_SERVICE_NOT_ACTIVE){
    if(phase==='sync')return null;
    if(reason.startsWith('M26_COMMAND_CONTRACT_INVALID:')){
      return Object.freeze({status:'error',code:'M26_COMMAND_CONTRACT_INVALID',message:ACTIONABLE_FAILURE_MESSAGES.M26_COMMAND_CONTRACT_INVALID});
    }
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
