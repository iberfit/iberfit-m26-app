export function routeViewTransitionsEnabled({documentLike=globalThis.document,windowLike=documentLike?.defaultView||globalThis.window}={}){
  if(typeof documentLike?.startViewTransition!=='function')return false;
  try{
    return windowLike?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches!==true;
  }catch{
    return false;
  }
}

function boundViewTransition(transition,{windowLike=globalThis.window,maxDurationMs=450}={}){
  if(!transition)return null;
  const timeoutMs=Math.max(120,Math.min(Number(maxDurationMs)||450,1_500));
  const setTimer=windowLike?.setTimeout?.bind?.(windowLike)||globalThis.setTimeout?.bind?.(globalThis);
  const clearTimer=windowLike?.clearTimeout?.bind?.(windowLike)||globalThis.clearTimeout?.bind?.(globalThis);
  if(typeof setTimer!=='function'||typeof transition.skipTransition!=='function')return transition;
  let timer=setTimer(()=>{
    timer=null;
    try{transition.skipTransition();}catch{}
  },timeoutMs);
  Promise.resolve(transition.finished).catch(()=>{}).finally(()=>{
    if(timer!==null&&typeof clearTimer==='function')clearTimer(timer);
    timer=null;
  });
  return transition;
}

export function runRouteViewTransition(update,{documentLike=globalThis.document,windowLike=documentLike?.defaultView||globalThis.window,maxDurationMs=450}={}){
  if(typeof update!=='function')throw new TypeError('M26_ROUTE_VIEW_TRANSITION_UPDATE_REQUIRED');
  if(!routeViewTransitionsEnabled({documentLike,windowLike})){
    update();
    return null;
  }

  let invoked=false;
  const wrappedUpdate=()=>{
    invoked=true;
    return update();
  };

  try{
    return boundViewTransition(
      documentLike.startViewTransition(wrappedUpdate)||null,
      {windowLike,maxDurationMs},
    );
  }catch{
    if(!invoked)update();
    return null;
  }
}

export const __routeViewTransitionInternals=Object.freeze({boundViewTransition});
