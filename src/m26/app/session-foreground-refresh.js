const DEFAULT_VISIBLE_STATE='visible';

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

  const canAttempt=()=>{
    if(destroyed||isBusy?.()===true||!safeVisibility(documentLike))return false;
    const current=getSession?.();
    return Boolean(current?.token);
  };

  const run=(reason='foreground')=>{
    if(!canAttempt())return Promise.resolve(false);
    if(inFlight)return inFlight;

    inFlight=Promise.resolve()
      .then(()=>refreshSession())
      .then(()=>true)
      .catch(async(error)=>{
        if(isPermanentFailure?.(error)===true){
          try{await onPermanentFailure?.(error,reason);}catch{}
        }else{
          try{await onTransientFailure?.(error,reason);}catch{}
        }
        return false;
      })
      .finally(()=>{inFlight=null;});

    return inFlight;
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
