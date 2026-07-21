function safeReason(value){return String(value||'M26_TASK_CANCELLED').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,160)||'M26_TASK_CANCELLED';}

export function createLatestTaskCoordinator(){
  let sequence=0;
  let active=null;

  function begin({reason='M26_TASK_SUPERSEDED'}={}){
    active?.controller?.abort?.(safeReason(reason));
    const controller=new AbortController();
    const id=++sequence;
    const handle=Object.freeze({
      id,
      controller,
      signal:controller.signal,
      isCurrent:()=>active?.id===id&&!controller.signal.aborted,
      finish:()=>{if(active?.id===id)active=null;},
      cancel:(cancelReason='M26_TASK_CANCELLED')=>controller.abort(safeReason(cancelReason)),
    });
    active=handle;
    return handle;
  }

  function cancel(reason='M26_TASK_CANCELLED'){
    const current=active;
    active=null;
    current?.controller?.abort?.(safeReason(reason));
    return Boolean(current);
  }

  function current(){return active;}
  return Object.freeze({begin,cancel,current});
}
