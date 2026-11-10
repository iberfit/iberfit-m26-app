// A high-priority task is a next-task navigation, never a synchronous click
// handler update. Browser support is optional (Safari, embedded PWA).
// No request, payload, owner identity or DOM node is retained by this helper.
export function schedulePriorityNavigation(commit,{windowLike=globalThis.window,priority='user-blocking'}={}){
  if(typeof commit!=='function')throw new TypeError('M26_NAVIGATION_COMMIT_REQUIRED');
  if(!['user-blocking','user-visible'].includes(priority))throw new TypeError('M26_NAVIGATION_PRIORITY_INVALID');
  const timer=windowLike?.setTimeout?.bind?.(windowLike);
  if(typeof timer!=='function')throw new TypeError('M26_NAVIGATION_TASK_TIMER_REQUIRED');
  let attempted=false;
  const once=()=>{
    if(attempted)return;
    attempted=true;
    commit();
  };
  const fallback=()=>{
    if(!attempted)timer(once,0);
  };
  const scheduler=windowLike?.scheduler;
  if(typeof scheduler?.postTask==='function'){
    try{
      // Priority applies to the scheduling slot, not to the user's permissions.
      // A rejected postTask is eligible for exactly one timer fallback *only*
      // if it was never invoked. Never replay a partially committed route.
      Promise.resolve(scheduler.postTask(once,{priority})).catch(fallback);
      return 'priority-task';
    }catch{
      fallback();
      return 'timer';
    }
  }
  fallback();
  return 'timer';
}
