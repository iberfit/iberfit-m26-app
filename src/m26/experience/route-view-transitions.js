export function routeViewTransitionsEnabled({documentLike=globalThis.document,windowLike=documentLike?.defaultView||globalThis.window}={}){
  if(typeof documentLike?.startViewTransition!=='function')return false;
  try{
    const reduced=windowLike?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
    const coarse=windowLike?.matchMedia?.('(pointer: coarse)')?.matches===true;
    const touchPoints=Number(windowLike?.navigator?.maxTouchPoints||0);
    return !reduced&&!coarse&&touchPoints<=0;
  }catch{
    return false;
  }
}

export function runRouteViewTransition(update,{documentLike=globalThis.document,windowLike=documentLike?.defaultView||globalThis.window}={}){
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
    return documentLike.startViewTransition(wrappedUpdate)||null;
  }catch{
    if(!invoked)update();
    return null;
  }
}
