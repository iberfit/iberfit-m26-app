// SIGNATURE U49 · gated dated-workout lifecycle on the U40 encrypted journal.
// U36 is closed and no private detail RPC is live. Do NOT auto-mount this
// service. Caller must supply an authenticated, server-authorized private
// occurrence read; U33 CALENDARIO is intentionally insufficient.
import {
  createOccurrenceWorkoutDraft,rehydrateOccurrenceWorkoutDraft,
  buildOccurrenceWorkoutCommand,applyOccurrenceWorkoutAck,canonicalJson,
} from './occurrence-workout-draft.js';
import {
  recordSet,skipExecutionSet,advanceExecution,finishExecution,currentStep,executionResultForStep,skippedSetForStep,
} from './session-execution.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const fail=code=>{throw new Error('U49_'+code);};
function uid(value){
  if(typeof value!=='string'||!UUID.test(value))fail('IDENTITY_INVALID');
  return value.toLowerCase();
}
// A minimal read-only projection, never expose private raw results or notes
// through the terminal view. Count only entries belonging to the frozen queue.
export function datedCompletionSummary(execution){
  if(!execution||!['completed','completada'].includes(execution.status))return null;
  const queue=execution.queue;
  if(!Array.isArray(queue)||!queue.length||queue.length>500||queue.some(item=>!item?.exerciseId||
    !Number.isInteger(item.sets)||item.sets<1||item.sets>100))return null;
  let total=0,recorded=0,omitted=0;
  for(const item of queue){
    for(let number=1;number<=item.sets;number++){
      total++;
      const step={...item,setNumber:number,totalSets:item.sets};
      const result=executionResultForStep(execution,step,number);
      const skipped=skippedSetForStep(execution,step,number);
      const hasResult=result&&typeof result==='object'&&!Array.isArray(result)&&
        [result.reps,result.seconds,result.distanceKm,result.distanceM,result.intervalsCompleted].some(value=>
          (typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&
          Number.isFinite(Number(value))&&Number(value)>=0);
      const hasSkip=skipped&&typeof skipped==='object'&&!Array.isArray(skipped);
      if(hasResult&&hasSkip)return null;
      if(hasResult)recorded++;
      else if(!result&&hasSkip)omitted++;
    }
  }
  const feedback=execution.feedback||{};
  const rpe=feedback.sessionRpe;
  const duration=execution.accumulatedActiveMs;
  return Object.freeze({total,recorded,omitted,missing:total-recorded-omitted,
    sessionRpe:typeof rpe==='number'&&Number.isFinite(rpe)&&rpe>=1&&rpe<=10?rpe:null,
    activeMs:Number.isSafeInteger(duration)&&duration>=0&&duration<=604800000?duration:null,
    pain:typeof feedback.pain==='boolean'?feedback.pain:null});
}
// Only canonical JSON values are compared. Object key order can differ after
// PostgreSQL jsonb round trips; array order and numeric/string types still matter.
const sameCheckpointJson=(left,right)=>
  JSON.stringify(canonicalJson(left))===JSON.stringify(canonicalJson(right));
export function checkpointContainsValues(localValues,remoteValues){
  return Object.entries(localValues||{}).every(([key,value])=>
    Object.prototype.hasOwnProperty.call(remoteValues||{},key)&&
    sameCheckpointJson(value,remoteValues[key]));
}
export function checkpointRevisionAdvanced(local,remote,completed=false){
  const l=[local?.occurrenceRevision,local?.executionRevision];
  const r=[remote?.occurrenceRevision,remote?.executionRevision];
  if(![...l,...r].every(v=>Number.isSafeInteger(v)&&v>=1))
    fail('CHECKPOINT_REVISION_INVALID');
  if(r.some((v,i)=>v<l[i]))fail('CHECKPOINT_REMOTE_REVISION_REGRESSED');
  return completed||r.some((v,i)=>v>l[i]);
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
    if(current.execution?.status==='paused')fail('WORKOUT_PAUSED');
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
    executionStatus:current?.execution?.status??null,
    startedAt:current?.execution?.startedAt??null,
    activeSince:current?.execution?.activeSince??null,
    pausedAt:current?.execution?.pausedAt??null,
    accumulatedActiveMs:current?.execution?.accumulatedActiveMs??0,
    busy,hasUncertain:pending,unsavedWork:dirty,error,
    completionSummary:current?.phase==='completed'&&!pending&&!stale&&!dirty
      ?current.completionSummary??datedCompletionSummary(current.execution):null,
    currentStep:current?.execution?
      structuredClone(currentStep(current.execution,current.session)):null,
  });
  // Return a settled snapshot: finally releases the operation lock before the
  // caller resumes. A successful result must not report a stale busy=true.
  const settledView=()=>Object.freeze({...view(),busy:false});
  async function open({clientId,occurrenceId}={}){
    requireEnabled();
    if(busy||pending)fail('RECOVERY_REQUIRED');
    const target={clientId:uid(clientId),occurrenceId:uid(occurrenceId)};
    if(dirty&&(!stale||scope?.clientId!==target.clientId||
      scope?.occurrenceId!==target.occurrenceId))fail('UNSAVED_WORKOUT_BLOCKED');
    // A new private read never exposes the previous date's execution.
    scope=target;current=null;stale=false;error=null;busy=true;
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
          completionSummary:completed?datedCompletionSummary(b):null,
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
            !sameCheckpointJson(local.execution?.queue,remote.execution?.queue)
          ))||
          (completed&&local.execution?.id!==result.executionBody?.id))
          fail('CHECKPOINT_IDENTITY_DRIFT');
        // An older or malformed private read must never authorize deleting a
        // newer encrypted checkpoint, even if its recorded values happen to match.
        const revisionAdvanced=checkpointRevisionAdvanced(local,remote,completed);
        const sameValues=checkpointContainsValues;
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
      return settledView();
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
        return settledView();
      }
      if(response.localRecoveryPending){
        error='U49_RECOVERY_CLEANUP_REQUIRED';
        return settledView(); // Never assume the durable pending journal was cleared.
      }
      applyOccurrenceWorkoutAck(current,command,response);
      if(dirty){
        // A confirmed server write may clear only its exact local ciphertext.
        // If cleanup fails, remain locked rather than silently losing evidence.
        await checkpoint.clearCheckpoint(scope,checkpointEtag);
        checkpointEtag=null;dirty=false;
      }
      pending=false;
      return settledView();
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
        return settledView();
      }
      pending=false;stale=true;current=null;error=null;
    }catch(e){
      // Another tab may already have released the exact journal. Do not trap
      // the player behind a recovery button for an operation that no longer
      // exists. Only a verified absence permits a fresh private read.
      try{pending=Boolean(await coordinator.hasUncertain(target));}
      catch{pending=true;}
      stale=!pending;error=String(e?.message||'U49_RECOVERY_FAILED');
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
      // Domain validation is performed on an isolated copy. A typo or an
      // incomplete form cannot invalidate the last durable workout.
      const next=structuredClone(current);
      try{fn(next.execution,next.session);}
      catch(e){
        error=String(e?.message||'U49_WORKOUT_INPUT_INVALID');
        throw e;
      }
      // Fail closed only when persistence actually fails. Do not clear or
      // replace the previous checkpoint until the new ciphertext is verified.
      try{
        const nextEtag=await checkpoint.writeCheckpoint(scope,next,checkpointEtag);
        current=next;checkpointEtag=nextEtag;dirty=true;error=null;
      }catch(e){
        stale=true;error=String(e?.message||'U49_CHECKPOINT_FAILED');
        throw e;
      }
      return settledView();
    }finally{busy=false;}
  }
  const record=input=>mutate((execution,session)=>recordSet(execution,session,input));
  // A dated set is one user action: recording and advancing must commit in
  // ONE encrypted CAS checkpoint. Otherwise a crash between two writes can
  // persist a completed set at the previous cursor, trapping the client.
  // Keep record/advance separately for existing domain and recovery callers.
  const recordAndAdvance=input=>mutate((execution,session)=>{
    recordSet(execution,session,input);
    advanceExecution(execution);
  });
  const skip=reason=>mutate((execution,session)=>
    skipExecutionSet(execution,session,{reason}));
  const advance=()=>mutate(execution=>advanceExecution(execution));
  const finish=feedback=>mutate(execution=>finishExecution(execution,feedback));
  return Object.freeze({
    open,view,start:()=>dispatch('start'),
    pause:async()=>{
      if(!current||current.execution?.status!=='active')fail('PAUSE_NOT_ACTIVE');
      if(dirty){
        const saved=await dispatch('progress');
        if(saved.hasUncertain||saved.unsavedWork||saved.phase!=='active')
          fail('RECOVERY_REQUIRED');
      }
      return dispatch('pause');
    },
    resume:()=>{
      if(!current||current.execution?.status!=='paused')fail('RESUME_NOT_PAUSED');
      return dispatch('resume');
    },
    save:()=>dispatch('progress'),
    complete:()=>dispatch('complete'),reconcile,record,recordAndAdvance,skip,advance,finish,
  });
}
