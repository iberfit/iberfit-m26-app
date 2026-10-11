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
      inFlight.queued=true;
      inFlight.queuedReason=requestedReason;
      return inFlight.promise;
    }

    const job={owner,queued:false,queuedReason:requestedReason,promise:null};
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
        result=await run({reason:currentReason,ownerSession:owner});
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

  return Object.freeze({request});
}

export const __hydrationCoordinatorInternals=Object.freeze({safeReason});
