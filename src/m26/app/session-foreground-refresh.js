const DEFAULT_VISIBLE_STATE='visible';

// Compare only ephemeral in-memory session credentials. Never log, persist or
// include a token in diagnostics. A rotated token makes old failures obsolete.
function captureSessionLease(session){
  return {
    token:session?.token||null,
    refreshToken:session?.refreshToken||null,
    userId:session?.user?.id||null,
  };
}
function stillOwnsSession(session,lease){
  return Boolean(session?.token)&&session.token===lease?.token&&
    (session.refreshToken||null)===lease?.refreshToken&&
    (session.user?.id||null)===lease?.userId;
}

function safeVisibility(documentLike){
  const state=String(documentLike?.visibilityState||DEFAULT_VISIBLE_STATE).trim().toLowerCase();
  return state!=='hidden';
}

function addListener(target,type,handler){
  if(typeof target?.addEventListener!=='function')return ()=>{};
  target.addEventListener(type,handler);
  return ()=>{
    try{target.removeEventListener?.(type,handler);}catch{}
  };
}

export function createSessionForegroundRefreshCoordinator({
  scope=globalThis,
  documentLike=scope?.document||globalThis.document,
  getSession=()=>null,
  refreshSession=async()=>null,
  isBusy=()=>false,
  isPermanentFailure=()=>false,
  onPermanentFailure=()=>{},
  onTransientFailure=()=>{},
  now=()=>Date.now(),
  transientRetryMs=15_000,
}={}){
  let destroyed=false;
  let inFlight=null;
  let inFlightLease=null;
  let lastTransientFailure=null;
  if(!Number.isFinite(transientRetryMs)||transientRetryMs<0)
    throw new Error('M26_AUTH_FOREGROUND_RETRY_INTERVAL_INVALID');

  const canAttempt=()=>{
    if(destroyed||isBusy?.()===true||!safeVisibility(documentLike))return false;
    const current=getSession?.();
    return Boolean(current?.token);
  };

  const run=(reason='foreground')=>{
    if(!canAttempt())return Promise.resolve(false);
    const ownerLease=captureSessionLease(getSession?.());
    // Coalesce storms for one identity, never block a new account with an
    // obsolete request from the account previously signed in on this device.
    if(inFlight&&stillOwnsSession(getSession?.(),inFlightLease))return inFlight;
    // Hidden/background/focus storms during an outage must not issue multiple
    // refresh requests. A genuine browser-online event and any new user/token
    // bypass the short cooldown for prompt recovery.
    const ms=now();
    if(!Number.isFinite(ms))return Promise.resolve(false);
    if(reason!=='online'&&lastTransientFailure
      &&stillOwnsSession(getSession?.(),lastTransientFailure.lease)
      &&ms>=lastTransientFailure.at
      &&ms-lastTransientFailure.at<transientRetryMs)return Promise.resolve(false);

    const pending=Promise.resolve()
      .then(()=>{
        if(destroyed||!stillOwnsSession(getSession?.(),ownerLease))return false;
        return refreshSession();
      })
      .then((result)=>{
        if(result!==false)lastTransientFailure=null;
        return result!==false;
      })
      .catch(async(error)=>{
        // A late 401 for account A must NEVER log account B out.
        if(destroyed||!stillOwnsSession(getSession?.(),ownerLease))return false;
        if(isPermanentFailure?.(error)===true){
          try{await onPermanentFailure?.(error,reason);}catch{}
        }else{
          // Preserve exact lease: a failed request from the previous account
          // must not suppress a fresh Client's own refresh after switching.
          lastTransientFailure={lease:ownerLease,at:ms};
          try{await onTransientFailure?.(error,reason);}catch{}
        }
        return false;
      })
      .finally(()=>{
        if(inFlight===pending){
          inFlight=null;
          inFlightLease=null;
        }
      });

    inFlight=pending;
    inFlightLease=ownerLease;
    return pending;
  };

  const onVisibilityChange=()=>{
    if(safeVisibility(documentLike))void run('visibilitychange');
  };
  const onPageShow=()=>{void run('pageshow');};
  const onFocus=()=>{void run('focus');};
  const onOnline=()=>{void run('online');};

  const removeListeners=[
    addListener(documentLike,'visibilitychange',onVisibilityChange),
    addListener(scope,'pageshow',onPageShow),
    addListener(scope,'focus',onFocus),
    addListener(scope,'online',onOnline),
  ];

  function destroy(){
    if(destroyed)return;
    destroyed=true;
    lastTransientFailure=null;
    for(const remove of removeListeners)remove();
  }

  return Object.freeze({
    run,
    destroy,
    get active(){return !destroyed;},
  });
}

export const __sessionForegroundRefreshInternals=Object.freeze({safeVisibility});
