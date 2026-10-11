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
}={}){
  let destroyed=false;
  let inFlight=null;
  let inFlightLease=null;

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
    if(inFlight&&stillOwnsSession(ownerLease,inFlightLease))return inFlight;

    const pending=Promise.resolve()
      .then(()=>{
        if(destroyed||!stillOwnsSession(getSession?.(),ownerLease))return false;
        return refreshSession();
      })
      .then((result)=>result!==false)
      .catch(async(error)=>{
        // A late 401 for account A must NEVER log account B out.
        if(destroyed||!stillOwnsSession(getSession?.(),ownerLease))return false;
        if(isPermanentFailure?.(error)===true){
          try{await onPermanentFailure?.(error,reason);}catch{}
        }else{
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
    for(const remove of removeListeners)remove();
  }

  return Object.freeze({
    run,
    destroy,
    get active(){return !destroyed;},
  });
}

export const __sessionForegroundRefreshInternals=Object.freeze({safeVisibility});
