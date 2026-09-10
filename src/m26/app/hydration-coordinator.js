function safeReason(value){
  return String(value||'bootstrap').trim().slice(0,80)||'bootstrap';
}

export function createHydrationCoordinator(run){
  if(typeof run!=='function')throw new Error('M26_HYDRATION_RUNNER_REQUIRED');
  let inFlight=null;
  let queued=false;
  let queuedReason='bootstrap';

  async function request({reason='bootstrap'}={}){
    const requestedReason=safeReason(reason);
    if(inFlight){
      queued=true;
      queuedReason=requestedReason;
      return inFlight;
    }

    queuedReason=requestedReason;
    inFlight=(async()=>{
      let result=null;
      let currentReason=requestedReason;
      do{
        queued=false;
        result=await run({reason:currentReason});
        currentReason=queuedReason;
      }while(queued);
      return result;
    })().finally(()=>{inFlight=null;});

    return inFlight;
  }

  return Object.freeze({request});
}

export const __hydrationCoordinatorInternals=Object.freeze({safeReason});
