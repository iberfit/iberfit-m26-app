function safeReason(value){
  return String(value||'bootstrap').trim().slice(0,80)||'bootstrap';
}

// Hydration requests may coalesce only while they belong to the same
// authenticated session generation. Logout, refresh or account switching
// must never force a new owner to await the old owner's snapshot.
export function createHydrationCoordinator(run,{getOwner=()=>null}={}){
  if(typeof run!=='function'||typeof getOwner!=='function')
    throw new Error('M26_HYDRATION_RUNNER_REQUIRED');
  let inFlight=null;

  function request({reason='bootstrap'}={}){
    const requestedReason=safeReason(reason);
    const owner=getOwner();
    if(inFlight&&inFlight.owner===owner){
      // A second initialization of the SAME login is not a server-side
      // change. Never schedule another full privileged bootstrap for it.
      // Mutation-triggered reasons (including identical ones) still queue a
      // fresh pass so post-ACK readbacks cannot be lost.
      if(requestedReason==='login'&&
         (inFlight.runningReason==='login'||inFlight.queuedReason==='login'))
        return inFlight.promise;
      inFlight.queued=true;
      inFlight.queuedReason=requestedReason;
      return inFlight.promise;
    }

    const job={owner,queued:false,queuedReason:requestedReason,runningReason:requestedReason,promise:null,controller:new AbortController()};
    const pending=Promise.resolve().then(async()=>{
      let result=null;
      let currentReason=requestedReason;
      let firstPass=true;
      do{
        // The owner may switch before this runner's first microtask.
        if(inFlight!==job)throw new Error('M26_HYDRATION_OWNER_SUPERSEDED');
        // Preserve requests queued before this deferred runner first started.
        // Otherwise same-session callers can silently lose the second pass.
        const queuedBeforeStart=firstPass&&job.queued;
        firstPass=false;
        job.queued=false;
        job.runningReason=currentReason;
        result=await run({reason:currentReason,ownerSession:owner,signal:job.controller.signal});
        if(job.controller.signal.aborted)throw new Error('M26_HYDRATION_CANCELLED');
        if(queuedBeforeStart)job.queued=true;
        currentReason=job.queuedReason;
      }while(job.queued&&inFlight===job);
      return result;
    }).finally(()=>{
      // An obsolete owner cannot clear the newer owner's active flight.
      if(inFlight===job)inFlight=null;
    });
    job.promise=pending;
    inFlight=job;
    return pending;
  }

  // Abort obsolete network reads and never run a queued pass after teardown.
  function cancel(){
    if(!inFlight)return false;
    inFlight.queued=false;
    inFlight.controller.abort();
    return true;
  }
  return Object.freeze({request,cancel});
}

export const __hydrationCoordinatorInternals=Object.freeze({safeReason});
