const REVIEWABLE_SYNC_STATES=new Set(['conflict','rejected']);

function normalizedRole(role){
  return String(role||'').trim().toLowerCase();
}

export function sessionSyncNeedsRecoveryReview(execution,{role=''}={}){
  const actorRole=normalizedRole(role);
  const status=String(execution?.syncStatus||'').trim().toLowerCase();
  return ['coach','entrenador'].includes(actorRole)&&REVIEWABLE_SYNC_STATES.has(status);
}

export function enhanceSessionSyncRecoveryBanner(root,execution,{role=''}={}){
  if(!sessionSyncNeedsRecoveryReview(execution,{role}))return false;
  const status=String(execution?.syncStatus||'').trim().toLowerCase();
  const banner=root?.querySelector?.(`.m26-sync-banner.is-${status}`)||null;
  if(!banner)return false;
  if(banner.getAttribute?.('role')==='alert'){
    banner.setAttribute?.('aria-live','assertive');
    banner.setAttribute?.('aria-atomic','true');
  }
  if(banner.querySelector?.('[data-session-recovery-review]'))return true;
  const documentLike=banner.ownerDocument||root?.ownerDocument||null;
  const button=documentLike?.createElement?.('button')||null;
  if(!button)return false;
  button.type='button';
  button.className='m26-text-action';
  button.setAttribute('data-session-action','exit-session');
  button.setAttribute('data-session-exit-target','verificacion');
  button.setAttribute('data-session-recovery-review','true');
  button.textContent='Revisar sincronización';
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
