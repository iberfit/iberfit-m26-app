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
  enabled=false,coordinator,readPrivateOccurrence,checkpoint,
  createId=()=>globalThis.crypto?.randomUUID?.(),
}={}){
  if(!coordinator||!['send','hasUncertain','retryUncertain'].every(
    name=>typeof coordinator[name]==='function'
  )||typeof readPrivateOccurrence!=='function'||typeof createId!=='function')
    fail('DEPENDENCIES_REQUIRED');
  if(enabled===true&&(checkpoint?.capability!=='encrypted-owner-bound-cas'||
    !['readCheckpoint','writeCheckpoint','clearCheckpoint']
      .every(name=>typeof checkpoint[name]==='function')))
    fail('ENCRYPTED_CHECKPOINT_REQUIRED');
  let current=null,scope=null,busy=false,pending=false,stale=false,error=null;
  let dirty=false,checkpointEtag=null;
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
    busy,hasUncertain:pending,unsavedWork:dirty,error,
    currentStep:current?.execution?
      structuredClone(currentStep(current.execution,current.session)):null,
  });
  async function open({clientId,occurrenceId}={}){
    requireEnabled();
    if(busy||pending)fail('RECOVERY_REQUIRED');
    if(dirty&&!stale)fail('UNSAVED_WORKOUT_BLOCKED');
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
      }else if(['completada','cancelada'].includes(result.occurrence.status)){
        // A confirmed remote completion after an interrupted ACK is NOT an
        // error and must never be restarted. Keep terminal states read-only.
        const o=result.occurrence,b=result.executionBody;
        const date=String(o.localDate||'');
        if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||
          !Number.isFinite(Date.parse(date+'T12:00:00Z'))||
          new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||
          o.timeZone!=='America/Santiago'||
          !Number.isSafeInteger(o.revision)||o.revision<0)
          fail('TERMINAL_RECORD_INVALID');
        const completed=o.status==='completada';
        if(completed&&(!b||b.status!=='completada'
          ||uid(o.executionId)!==uid(b.id)
          ||uid(b.occurrenceId)!==target.occurrenceId
          ||uid(b.clientId)!==target.clientId
          ||uid(b.sessionId)!==uid(o.sessionId)
          ||!Number.isSafeInteger(b.revision)||b.revision<1))
          fail('COMPLETION_RECEIPT_SCOPE_MISMATCH');
        next={
          clientId:target.clientId,occurrenceId:target.occurrenceId,
          sessionId:uid(o.sessionId),localDate:date,
          occurrenceRevision:o.revision,
          executionRevision:completed?b.revision:null,
          phase:completed?'completed':'cancelled',
          execution:null,session:null,
        };
      }else fail('STATE_NOT_EXECUTABLE');
      // A command started by another tab during the read wins over our view.
      if(await coordinator.hasUncertain(target)){
        scope=target;current=null;pending=true;
        fail('RECOVERY_REQUIRED');
      }
      const saved=await checkpoint.readCheckpoint(target);
      if(saved){
        const local=saved.snapshot,remote=next;
        const completed=remote.phase==='completed';
        if(!local||!['active','completed'].includes(remote.phase)||
          local.phase!=='active'||
          local.clientId!==remote.clientId||
          local.occurrenceId!==remote.occurrenceId||
          local.sessionId!==remote.sessionId||
          local.localDate!==remote.localDate||
          (!completed&&(
            local.execution?.id!==remote.execution?.id||
            JSON.stringify(local.execution?.queue)!==
              JSON.stringify(remote.execution?.queue)
          ))||
          (completed&&local.execution?.id!==result.executionBody?.id))
          fail('CHECKPOINT_IDENTITY_DRIFT');
        const sameValues=(localValues,remoteValues)=>
          Object.entries(localValues||{}).every(([key,value])=>
            Object.prototype.hasOwnProperty.call(remoteValues||{},key)&&
            JSON.stringify(value)===JSON.stringify(remoteValues[key]));
        const revisionAdvanced=completed||
          local.occurrenceRevision!==remote.occurrenceRevision||
          local.executionRevision!==remote.executionRevision;
        if(revisionAdvanced){
          // Only dismiss a stale checkpoint when the server contains ALL
          // locally saved results AND any locally completed feedback.
          const server=completed?result.executionBody:remote.execution;
          const localFeedback=local.execution?.feedback;
          if(!sameValues(local.execution?.results,server?.results)||
            !sameValues(local.execution?.skippedSets,server?.skippedSets)||
            (localFeedback&&!sameValues(localFeedback,server?.feedback)))
            fail('CHECKPOINT_REMOTE_DIVERGED');
          await checkpoint.clearCheckpoint(target,saved.etag);
          checkpointEtag=null;dirty=false;
        }else{
          // Server snapshot is trusted for identity, source and revision.
          // Only AES-GCM authenticated owner-scoped local progress is restored.
          const allowedStatus=new Set(['active','awaiting_feedback','completed']);
          if(!allowedStatus.has(local.execution?.status)||
            local.execution?.clientId!==remote.execution?.clientId||
            local.execution?.sessionId!==remote.execution?.sessionId||
            !local.execution.results||typeof local.execution.results!=='object'||
            !local.execution.skippedSets||
            typeof local.execution.skippedSets!=='object')
            fail('CHECKPOINT_CONTENT_INVALID');
          next=local;checkpointEtag=saved.etag;dirty=true;
        }
      }else{
        checkpointEtag=null;dirty=false;
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
    if(current.phase==='completed'||current.phase==='cancelled')
      fail('TERMINAL_READ_ONLY');
    const command=buildOccurrenceWorkoutCommand(current,{
      action,operationId:uid(createId()),
    });
    busy=true;pending=true;error=null;
    try{
      const response=await coordinator.send(command);
      if(response.kind!=='ack'){
        // Even a definitive rejection can have an UNREMOVED encrypted
        // journal if durable cleanup failed after receiving the response.
        pending=Boolean(response.localRecoveryPending);
        stale=true;error=String(response.reason||'U49_REJECTED');
        return view();
      }
      if(response.localRecoveryPending){
        error='U49_RECOVERY_CLEANUP_REQUIRED';
        return view(); // Never assume the durable pending journal was cleared.
      }
      applyOccurrenceWorkoutAck(current,command,response);
      if(dirty){
        // A confirmed server write may clear only its exact local ciphertext.
        // If cleanup fails, remain locked rather than silently losing evidence.
        await checkpoint.clearCheckpoint(scope,checkpointEtag);
        checkpointEtag=null;dirty=false;
      }
      pending=false;
      return view();
    }catch(e){
      // Distinguish a genuinely uncertain network send from a local validation
      // or pre-dispatch denial. Without a pending journal there is nothing to
      // replay: require a fresh private read instead of deadlocking forever.
      // A failed journal read remains pending (fail closed).
      try{pending=Boolean(await coordinator.hasUncertain(scope));}
      catch{pending=true;}
      stale=!pending;
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
  async function mutate(fn){
    requireEditable();
    busy=true;
    try{
      // Copy first. Do not show a successful set before ciphertext is durable.
      const next=structuredClone(current);
      fn(next.execution,next.session);
      const nextEtag=await checkpoint.writeCheckpoint(scope,next,checkpointEtag);
      current=next;checkpointEtag=nextEtag;dirty=true;error=null;
      return view();
    }catch(e){
      // Includes IndexedDB readback/CAS failure, key loss, quota and eviction.
      stale=true;error=String(e?.message||'U49_CHECKPOINT_FAILED');
      throw e;
    }finally{busy=false;}
  }
  const record=input=>mutate((execution,session)=>recordSet(execution,session,input));
  const skip=reason=>mutate((execution,session)=>
    skipExecutionSet(execution,session,{reason}));
  const advance=()=>mutate(execution=>advanceExecution(execution));
  const finish=feedback=>mutate(execution=>finishExecution(execution,feedback));
  return Object.freeze({
    open,view,start:()=>dispatch('start'),save:()=>dispatch('progress'),
    complete:()=>dispatch('complete'),reconcile,record,skip,advance,finish,
  });
}
