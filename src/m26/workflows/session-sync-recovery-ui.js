const REVIEWABLE_SYNC_STATES=new Set(['conflict','rejected']);
export const TRAINING_SERVICE_NOT_ACTIVE='TRAINING_SERVICE_NOT_ACTIVE';

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
  if(reason!==TRAINING_SERVICE_NOT_ACTIVE)return null;
  const coach=isCoachRole(role);
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
