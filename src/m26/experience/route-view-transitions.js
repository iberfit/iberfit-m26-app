export function routeViewTransitionsEnabled({documentLike=globalThis.document,windowLike=documentLike?.defaultView||globalThis.window}={}){
  if(typeof documentLike?.startViewTransition!=='function')return false;
  try{
    return windowLike?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches!==true;
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
