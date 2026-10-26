// SIGNATURE U49 · gated dated-workout lifecycle on the U40 encrypted journal.
// U36 is closed and no private detail RPC is live. Do NOT auto-mount this
// service. Caller must supply an authenticated, server-authorized private
// occurrence read; U33 CALENDARIO is intentionally insufficient.
import {
  createOccurrenceWorkoutDraft,rehydrateOccurrenceWorkoutDraft,
  buildOccurrenceWorkoutCommand,applyOccurrenceWorkoutAck,
} from './occurrence-workout-draft.js';
import {
  recordSet,skipExecutionSet,advanceExecution,finishExecution,currentStep,
} from './session-execution.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const fail=code=>{throw new Error('U49_'+code);};
function uid(value){
  if(typeof value!=='string'||!UUID.test(value))fail('IDENTITY_INVALID');
  return value.toLowerCase();
}
export function createOccurrenceWorkoutService({
  enabled=false,coordinator,readPrivateOccurrence,
  createId=()=>globalThis.crypto?.randomUUID?.(),
}={}){
  if(!coordinator||!['send','hasUncertain','retryUncertain'].every(
    name=>typeof coordinator[name]==='function'
  )||typeof readPrivateOccurrence!=='function'||typeof createId!=='function')
    fail('DEPENDENCIES_REQUIRED');
  let current=null,scope=null,busy=false,pending=false,stale=false,error=null;
  const requireEnabled=()=>{if(enabled!==true)fail('API_NOT_ENABLED');};
  const requireEditable=()=>{
    requireEnabled();
    if(busy)fail('BUSY');
    if(pending)fail('RECOVERY_REQUIRED');
    if(stale)fail('PRIVATE_REFRESH_REQUIRED');
    if(!current||current.phase!=='active')fail('ACTIVE_WORKOUT_REQUIRED');
  };
  const view=()=>Object.freeze({
    phase:pending?'pending-recovery':stale?'needs-refresh':
      current?.phase??'idle',
    clientId:scope?.clientId??null,
    occurrenceId:scope?.occurrenceId??null,
    localDate:current?.localDate??null,
    sessionId:current?.sessionId??null,
    occurrenceRevision:current?.occurrenceRevision??null,
    executionRevision:current?.executionRevision??null,
    busy,hasUncertain:pending,error,
    currentStep:current?.execution?
      structuredClone(currentStep(current.execution,current.session)):null,
  });
  async function open({clientId,occurrenceId}={}){
    requireEnabled();
    if(busy||pending)fail('RECOVERY_REQUIRED');
    const target={clientId:uid(clientId),occurrenceId:uid(occurrenceId)};
    busy=true;
    try{
      if(await coordinator.hasUncertain(target)){
        scope=target;current=null;pending=true;
        fail('RECOVERY_REQUIRED');
      }
      const result=await readPrivateOccurrence(target);
      if(!result||!result.occurrence||!result.prescriptionSnapshot||
        uid(result.occurrence.clientId)!==target.clientId||
        uid(result.occurrence.id)!==target.occurrenceId)
        fail('PRIVATE_READ_SCOPE_MISMATCH');
      let next;
      if(result.occurrence.status==='confirmada'){
        next=createOccurrenceWorkoutDraft({
          occurrence:result.occurrence,
          prescriptionSnapshot:result.prescriptionSnapshot,
          executionId:uid(createId()),
        });
      }else if(result.occurrence.status==='en_curso'){
        next=rehydrateOccurrenceWorkoutDraft({
          occurrence:result.occurrence,
          prescriptionSnapshot:result.prescriptionSnapshot,
          executionBody:result.executionBody,
        });
      }else fail('STATE_NOT_EXECUTABLE');
      // A command started by another tab during the read wins over our view.
      if(await coordinator.hasUncertain(target)){
        scope=target;current=null;pending=true;
        fail('RECOVERY_REQUIRED');
      }
      scope=target;current=next;stale=false;error=null;
      return view();
    }catch(e){
      if(!pending){stale=true;current=null;error=String(e?.message||'U49_READ_FAILED');}
      throw e;
    }finally{busy=false;}
  }
  async function dispatch(action){
    requireEnabled();
    if(busy)fail('BUSY');
    if(pending)fail('RECOVERY_REQUIRED');
    if(stale||!current)fail('PRIVATE_REFRESH_REQUIRED');
    const command=buildOccurrenceWorkoutCommand(current,{
      action,operationId:uid(createId()),
    });
    busy=true;pending=true;error=null;
    try{
      const response=await coordinator.send(command);
      if(response.kind!=='ack'){
        pending=false;stale=true;error=String(response.reason||'U49_REJECTED');
        return view(); // A conflict is definitive but requires fresh read.
      }
      if(response.localRecoveryPending){
        error='U49_RECOVERY_CLEANUP_REQUIRED';
        return view(); // Never assume the durable pending journal was cleared.
      }
      applyOccurrenceWorkoutAck(current,command,response);
      pending=false;
      return view();
    }catch(e){
      // A timeout after network dispatch is uncertain. U40 retained the
      // SAME operation ID in U42/U45; never invent another one to retry.
      error=String(e?.message||'U49_REMOTE_UNCERTAIN');
      throw e;
    }finally{busy=false;}
  }
  async function reconcile(){
    requireEnabled();
    if(busy||!scope)fail('RECOVERY_CONTEXT_REQUIRED');
    const target={...scope};
    busy=true;
    try{
      if(!pending&&!(await coordinator.hasUncertain(target)))
        fail('NO_RECOVERY_REQUIRED');
      const receipt=await coordinator.retryUncertain(target);
      if(receipt.kind!=='ack'||receipt.localRecoveryPending){
        pending=Boolean(receipt.localRecoveryPending);
        stale=true;error=String(receipt.reason||'U49_RECOVERY_NOT_CONFIRMED');
        return view();
      }
      pending=false;stale=true;current=null;error=null;
    }catch(e){
      pending=true;error=String(e?.message||'U49_RECOVERY_FAILED');
      throw e;
    }finally{busy=false;}
    // The read is authoritative. No optimistic local start/completion on an
    // ACK recovered after reload or an interrupted network round trip.
    return open(target);
  }
  function record(input={}){
    requireEditable();
    recordSet(current.execution,current.session,input);
    return view();
  }
  function skip(reason){
    requireEditable();
    skipExecutionSet(current.execution,current.session,{reason});
    return view();
  }
  function advance(){
    requireEditable();
    advanceExecution(current.execution);
    return view();
  }
  function finish(feedback){
    requireEditable();
    finishExecution(current.execution,feedback);
    return view();
  }
  return Object.freeze({
    open,view,start:()=>dispatch('start'),save:()=>dispatch('progress'),
    complete:()=>dispatch('complete'),reconcile,record,skip,advance,finish,
  });
}
