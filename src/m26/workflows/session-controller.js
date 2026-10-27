import { addCatalogExercise, addTrainingGroup, closeTrainingGroup,duplicateSessionBlock,removeSessionBlock,sessionBlockRemovalSnapshot,restoreSessionBlock,moveSessionBlock,updateSessionDraft,updateSessionBlock,acceptSessionPreview,invalidateSessionPreview,applyExerciseMemorySuggestion, buildPublishSessionCommand } from './session-builder.js';
import {
  startExecution,pauseExecution,resumeExecution,cancelExecution,recordSet,correctSet,advanceExecution,retreatExecution,
  adjustRest,beginRest,substituteExercise,addExecutionSet,addExecutionGroupRound,addExtraGroupRoundAndAdvance,undoLastExecutionStructureChange,skipExecutionSet,skipExecutionExercise,addExecutionExercise,
  finishExecution,buildExecutionCommand,buildStartExecutionCommand,
  buildProgressExecutionCommand,buildPauseExecutionCommand,buildResumeExecutionCommand,buildCancelExecutionCommand,
  markExecutionSync,previousSetDraftValues,previousSetReviewDraftValues,plannedSetDraftValues,suggestedSetDraftValues,repeatPreviousSet,addExtraSetAndAdvance,getActiveSetDraft,updateActiveSetDraft,getFinalFeedbackDraft,updateFinalFeedbackDraft,
  currentStep,executionResultForStep,hasNextExecutionStep,advanceExpiredRest
} from './session-execution.js';
import { runAction } from '../ui/action-state.js';
import { createLiveTelemetryController } from '../wearables/live-telemetry.js';
import {setPendingSessionEntry,consumePendingSessionEntry,clearPendingSessionEntry} from '../intelligence/session-entry-intent.js';
import {createM26Id} from '../platform/id.js';
import {executionElapsedMs,formatDuration,restRemainingSeconds} from './session-timer.js';
import {enhanceSessionSyncRecoveryBanner,openSessionRecoveryReview,sessionExitTarget,sessionCommandFailureOutcome,sessionRejectedSyncOutcome} from './session-sync-recovery-ui.js';
import {fillEmptyControls} from '../ui/guided-input.js';
import {renderSessionLibraryResults} from './session-ui.js';
import {liveHeartRatePresentation} from './session-ui.js';
import {deriveLiveSessionIntelligence,LIVE_SESSION_CURRENT_READING_MAX_AGE_MS} from '../intelligence/live-session-intelligence.js';
import {sessionDeliveryModality,sessionDeliveryOwnership,sessionRequiresConfirmedAppointment,actorCanExecuteSession,sessionReadyToStart} from '../rc39/session-policy.js';

function fieldValues(root){const out={};for(const node of root.querySelectorAll?.('[data-set-field]')||[])out[node.getAttribute('data-set-field')]=node.value;return out;}
function feedbackValues(root){return {sessionRpe:root.querySelector?.('[data-session-feedback-rpe]')?.value??'',comment:root.querySelector?.('[data-session-feedback-comment]')?.value??'',pain:Boolean(root.querySelector?.('[data-session-feedback-pain]')?.checked),painNotes:root.querySelector?.('[data-session-feedback-pain-notes]')?.value??''};}
function authoritativeRevisionOrFallback(raw,fallback){
  const baseline=Number(fallback);
  const safeFallback=Number.isSafeInteger(baseline)&&baseline>=0?baseline:0;
  const candidate=Number(raw);
  return Number.isSafeInteger(candidate)&&candidate>=0
    ?Math.max(safeFallback,candidate):safeFallback;
}
function remoteRevision(result,fallback){
  return authoritativeRevisionOrFallback(
    result?.response?.remoteRevision??result?.response?.revision
      ??result?.response?.executionRevision??fallback,fallback);
}
function executionRevision(result,fallback){
  return authoritativeRevisionOrFallback(
    result?.response?.executionRevision??result?.response?.remoteRevision
      ??result?.response?.revision??fallback,fallback);
}
function requireAck(result){if(!result?.ok)throw Object.assign(new Error(`M26_COMMAND_${String(result?.kind||'REJECTED').toUpperCase()}`),{result,status:result?.kind==='conflict'?409:422});return result;}
function markFailure(execution,error){
  if(!execution)return;
  const kind=error?.result?.kind||error?.operation?.status;
  const operationId=error?.result?.command?.operationId||error?.operation?.operationId||null;
  const errorCode=error?.result?.response?.reason||error?.operation?.errorCode||error?.message||null;
  if(kind==='conflict')markExecutionSync(execution,'conflict',{operationId,errorCode});
  else if(kind==='pending')markExecutionSync(execution,'pending',{operationId,errorCode});
  else markExecutionSync(execution,'rejected',{operationId,errorCode});
}
// The remote ACK and the subsequent shell refresh are different outcomes.
// Never turn a committed publication into a failed command because the local
// navigation, hydration, or re-render temporarily failed.
export async function publicationAckRefreshOutcome(result,refresh){
  if(typeof refresh!=='function')return {ackConfirmed:result?.ok===true,refreshOk:true};
  try{await refresh(result);return {ackConfirmed:result?.ok===true,refreshOk:true};}
  catch(error){
    if(result?.ok!==true)throw error;
    return {ackConfirmed:true,refreshOk:false,error};
  }
}
// Prevent a second network command while an acknowledged publication is
// awaiting shell refresh. A changed, re-reviewed prescription gets a new
// fingerprint; a re-render of the unchanged draft reuses the original receipt.
// Keep confirmed server CAS across detached/stale UI snapshots during a slow
// post-ACK hydration. The bus instance is bound to the authenticated owner;
// no revision from another account, Client or execution may be reused.
const confirmedExecutionCasByBus=new WeakMap();
const executingExecutionWritesByBus=new WeakMap();
function executionScopeKey(value){
  const id=String(value?.entityId??value?.id??'');
  const clientId=String(value?.clientId??'');
  return id&&clientId?clientId+'::'+id:null;
}
function confirmedExecutionCas(bus,execution){
  const key=executionScopeKey(execution);
  return key?(confirmedExecutionCasByBus.get(bus)?.get(key)??0):0;
}
function trackConfirmedExecutionCas(bus,command,ack){
  if(!['ack','duplicate'].includes(String(ack?.kind||'').toLowerCase()))return null;
  const key=executionScopeKey(command);
  const revision=Number(ack?.remoteRevision);
  if(!key||!Number.isSafeInteger(revision)||revision<=Number(command?.baseRevision??-1))return null;
  let revisions=confirmedExecutionCasByBus.get(bus);
  if(!revisions){revisions=new Map();confirmedExecutionCasByBus.set(bus,revisions);}
  revisions.set(key,Math.max(revisions.get(key)||0,revision));
  return revision;
}
function trackInFlightExecutionWrite(bus,command,promise){
  if(command?.entityType!=='session_execution')return promise;
  const key=executionScopeKey(command);
  if(!key)return promise;
  let scoped=executingExecutionWritesByBus.get(bus);
  if(!scoped){scoped=new Map();executingExecutionWritesByBus.set(bus,scoped);}
  let pending=scoped.get(key);
  if(!pending){pending=new Set();scoped.set(key,pending);}
  pending.add(promise);
  const cleanup=()=>{pending.delete(promise);if(!pending.size)scoped.delete(key);};
  void promise.then(cleanup,cleanup);
  return promise;
}
// A delayed finish must not cross logout, a different account or replacement
// workspace. A validated ACK is not authorization to use a new JWT/owner.
export function sameLiveExecutionOwner(expected,latest){
  return Boolean(expected?.execution&&latest?.execution
    &&expected.execution===latest.execution
    &&expected.commandBus===latest.commandBus
    &&String(expected.actor?.userId||'')===String(latest.actor?.userId||'')
    &&String(expected.execution.clientId||'')===String(latest.execution.clientId||''));
}
// A tap to return from a just-finished workout may land after the server
// has acknowledged completion but before local persistence and UI refresh
// have settled. Never navigate until ownership and the durable local state
// both match; a rejected/queued completion remains on the recovery screen.
export function sessionExitAfterFinishConfirmed(expected,latest){
  return sameLiveExecutionOwner(expected,latest)
    &&latest.execution?.status==='completed'
    &&latest.execution?.syncStatus==='clean'
    &&!(latest.execution?.pendingOperationIds?.length);
}
export async function settlePriorExecutionWrites(bus,execution){
  const key=executionScopeKey(execution);
  const pending=key?executingExecutionWritesByBus.get(bus)?.get(key):null;
  if(pending?.size)await Promise.all([...pending]);
}
const publishedDraftReceipts=new WeakMap();
const inFlightDraftPublications=new WeakMap();
function publishDraftFingerprint(draft){
  return JSON.stringify({id:draft?.id,clientId:draft?.clientId,title:draft?.title,
    durationMinutes:draft?.durationMinutes,deliveryModality:draft?.deliveryModality,
    blocks:draft?.blocks});
}
function executeAndApply(commandBus,command,apply,execution){
  // U41/U54: authenticated ACK advances CAS before local IndexedDB receipt
  // bookkeeping, queued-lineage reconciliation or a heavyweight bootstrap.
  // Only a terminal completion with exact operation identity may release its
  // UI confirmation early. Conflicts, 401 and network uncertainty never do.
  const terminal=command?.type==='EJECUCION_COMPLETAR'
    &&command?.entityType==='session_execution'&&Boolean(execution);
  let resolveTerminalAck=null,appliedTerminalAck=false;
  const terminalAck=terminal?new Promise(resolve=>{resolveTerminalAck=resolve;}):null;
  const onAck=execution&&command?.entityType==='session_execution'
    ?(response)=>{
      if(String(command?.entityId)!==String(execution?.id)
        ||String(command?.clientId)!==String(execution?.clientId))return;
      const revision=trackConfirmedExecutionCas(commandBus,command,response);
      if(revision!==null&&revision>Number(execution?.revision||0))execution.revision=revision;
      if(!terminal||revision===null||appliedTerminalAck
        ||String(response?.operationId||'')!==String(command?.operationId||''))return;
      // The full terminal snapshot was accepted remotely. Old local "pending"
      // marks for its already-settled sets cannot supersede this final ACK.
      const result={ok:true,kind:String(response.kind).toLowerCase(),response,
        command:{operationId:command.operationId},refreshPending:true};
      apply?.(result);
      markExecutionSync(execution,'clean');
      appliedTerminalAck=true;
      resolveTerminalAck(result);
    }:null;
  const operation=Promise.resolve(commandBus.execute(command,{onAck})).then(requireAck).then((result)=>{
    if(!appliedTerminalAck)apply?.(result);
    if(execution)markExecutionSync(execution,'clean',appliedTerminalAck
      ?{}:{operationId:result?.command?.operationId});
    return result;
  }).catch((error)=>{
    if(!appliedTerminalAck)markFailure(execution,error);
    throw error;
  });
  trackInFlightExecutionWrite(commandBus,command,operation);
  return terminal?Promise.race([operation,terminalAck]):operation;
}
function enqueueAndApply(commandBus,command,apply,execution){
  if(!commandBus?.enqueue)throw new Error('M26_OFFLINE_QUEUE_UNAVAILABLE');
  return Promise.resolve(commandBus.enqueue(command)).then((result)=>{apply?.(result);markExecutionSync(execution,'pending',{operationId:result?.command?.operationId});return {...result,queued:true};});
}
function isOnline(value){return value!==false;}
function progressMutation(execution,commandBus,online,operationId=null){
  if(!commandBus)return {kind:'execution',value:execution};
  // An ACK of the prior set or rest transition can reach the authenticated
  // command bus before a slow UI hydration restores an older execution copy.
  // All progress actions (including NEXT) must use the confirmed, same-owner
  // CAS ledger, not only FINISH. Do not infer revisions from conflicts.
  const busRevision=Number(commandBus?.confirmedExecutionRevision?.(execution)??0);
  const verified=Math.max(confirmedExecutionCas(commandBus,execution),
    Number.isSafeInteger(busRevision)&&busRevision>0?busRevision:0);
  if(verified>Number(execution?.revision||0))execution.revision=verified;
  const safeOperationId=String(operationId||createM26Id()).trim();
  const command={...buildProgressExecutionCommand(execution,execution.revision||0),operationId:safeOperationId};
  const pendingIds=new Set(execution?.pendingOperationIds||[]);
  const hasPending=execution?.syncStatus==='pending'||pendingIds.size>0;
  if(!isOnline(online)||hasPending)return {kind:'queued',operationId:safeOperationId,command,value:enqueueAndApply(commandBus,command,null,execution)};
  return {kind:'command',operationId:safeOperationId,command,value:executeAndApply(commandBus,command,(result)=>{execution.revision=remoteRevision(result,execution.revision);},execution)};
}
function sessionActionTimeout(){const error=new Error('M26_SESSION_ACTION_TIMEOUT');error.code='M26_SESSION_ACTION_TIMEOUT';return error;}
function settleWithin(promise,timeoutMs,onTimeout=()=>{}){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(handler,value)=>{if(settled)return;settled=true;clearTimeout(timer);handler(value);};
    const timer=setTimeout(()=>{if(settled)return;settled=true;try{onTimeout();}catch{}reject(sessionActionTimeout());},timeoutMs);
    Promise.resolve(promise).then((value)=>finish(resolve,value),(error)=>finish(reject,error));
  });
}

// An acknowledged local draft save is not the same as a remote copy.
// Present only persistence guarantees actually established by the store.
export function sessionDraftSaveOutcome(persistence=null){
  const local=persistence?.local===true;
  const remote=persistence?.remote===true;
  if(local&&remote)return Object.freeze({status:'success',message:'Borrador guardado en este dispositivo y sincronizado correctamente.'});
  if(local)return Object.freeze({status:'pending',message:'Borrador guardado en este dispositivo. La sincronización remota no está confirmada; vuelve a guardar con conexión antes de cambiar de dispositivo.'});
  if(remote)return Object.freeze({status:'retry',message:'Borrador sincronizado, pero no se pudo confirmar una copia local en este dispositivo. Puedes volver a guardarlo.'});
  return Object.freeze({status:'error',message:'No se ha confirmado el guardado del borrador. Mantén esta pantalla abierta y vuelve a intentarlo.'});
}

export function manualSessionSyncOutcome(execution,result={},error=null,{role=''}={}){
  const errorSpecific=sessionCommandFailureOutcome(error,{role,phase:'sync'});
  if(errorSpecific)return errorSpecific;
  if(error)return Object.freeze({status:'retry',message:'No fue posible sincronizar ahora. Tu progreso sigue guardado en este dispositivo.'});
  if(result?.online===false)return Object.freeze({status:'retry',message:'Sin conexión. Tu progreso sigue guardado en este dispositivo; vuelve a sincronizar cuando recuperes internet.'});
  const status=String(execution?.syncStatus||'clean').toLowerCase();
  if(status==='clean')return Object.freeze({status:'success',message:'Sincronización completada. Los cambios pendientes quedaron confirmados.'});
  if(status==='conflict')return Object.freeze({status:'retry',message:'La sincronización detectó una versión más reciente. Tu progreso local está protegido y requiere revisión.'});
  if(status==='rejected'){
    const specific=sessionRejectedSyncOutcome(execution,{role});
    if(specific)return specific;
    return Object.freeze({status:'error',message:'El último cambio no pudo confirmarse. Tu progreso local se conserva para revisión.'});
  }
  const deferred=Math.max(0,Number(result?.deferred)||0);
  const remaining=Math.max(0,Number(result?.remaining)||0);
  if(deferred>0)return Object.freeze({status:'retry',message:'Aún hay cambios pendientes de su próximo reintento. Tu progreso sigue guardado de forma segura.'});
  if(remaining>0)return Object.freeze({status:'retry',message:'Aún quedan cambios por sincronizar. Tu progreso local sigue protegido.'});
  return Object.freeze({status:'retry',message:'La sincronización no pudo confirmar todos los cambios todavía. Tu progreso sigue guardado en este dispositivo.'});
}

export function liveAddExerciseSelectionState(exerciseId,catalog){
  const normalizedExerciseId=String(exerciseId||'').trim();
  return Object.freeze({exerciseId:normalizedExerciseId,enabled:Boolean(normalizedExerciseId&&catalog?.has?.(normalizedExerciseId))});
}

export function dispatchSessionAction({action,draft,execution,session,catalog,payload={},commandBus,appointmentId,sessionRevision=0,online=true,offlinePermit={},actor=null}={}){
  switch(action){
    case 'add-exercise': addCatalogExercise(draft,payload.exerciseId,catalog,payload.prescription); return {kind:'draft',value:draft};
    case 'remove-block': {const undo=sessionBlockRemovalSnapshot(draft,payload.blockId);removeSessionBlock(draft,payload.blockId);return {kind:'draft',value:draft,undo};}
    case 'restore-block': restoreSessionBlock(draft,payload.snapshot); return {kind:'draft',value:draft};
    case 'duplicate-block': duplicateSessionBlock(draft,payload.blockId); return {kind:'draft',value:draft};
    case 'move-up': moveSessionBlock(draft,payload.blockId,'up'); return {kind:'draft',value:draft};
    case 'move-down': moveSessionBlock(draft,payload.blockId,'down'); return {kind:'draft',value:draft};
    case 'preview': acceptSessionPreview(draft,catalog); return {kind:'draft',value:draft};
    case 'edit-preview': invalidateSessionPreview(draft); return {kind:'draft',value:draft};
    case 'apply-client-duration': updateSessionDraft(draft,'durationMinutes',payload.durationMinutes); return {kind:'draft',value:draft};
    case 'update-draft': updateSessionDraft(draft,payload.field,payload.value); return {kind:'draft',value:draft};
    case 'update-block': updateSessionBlock(draft,{...payload,catalog}); return {kind:'draft',value:draft};
    case 'reuse-exercise-memory': applyExerciseMemorySuggestion(draft,{blockId:payload.blockId,exerciseId:payload.exerciseId,suggestion:payload.suggestion}); return {kind:'draft',value:draft};
    case 'add-group': addTrainingGroup(draft,payload.groupType,[]); return {kind:'draft',value:draft};
    case 'close-group': closeTrainingGroup(draft); return {kind:'draft',value:draft};
    case 'save-draft': return {kind:'draft',value:draft};
    case 'publish': {
      if(!isOnline(online))throw new Error('M26_OFFLINE_PUBLICATION_NOT_ALLOWED');
      const fingerprint=publishDraftFingerprint(draft);
      const acknowledged=publishedDraftReceipts.get(draft);
      if(commandBus&&draft?.previewAccepted===true&&acknowledged?.fingerprint===fingerprint)
        return {kind:'command',value:Promise.resolve({...acknowledged.result,alreadyConfirmed:true})};
      const pending=commandBus&&inFlightDraftPublications.get(draft);
      if(commandBus&&draft?.previewAccepted===true&&pending?.fingerprint===fingerprint)
        return {kind:'command',value:pending.promise};
      const command=buildPublishSessionCommand(draft,catalog,draft.revision||0);
      if(!commandBus)return {kind:'command',value:command};
      const operation=executeAndApply(commandBus,command,(result)=>{
        draft.revision=remoteRevision(result,draft.revision);
        publishedDraftReceipts.set(draft,{fingerprint,result});
      });
      inFlightDraftPublications.set(draft,{fingerprint,promise:operation});
      // Clear on ACK and rejection. A failed request must allow a real retry.
      void operation.then(
        ()=>{if(inFlightDraftPublications.get(draft)?.promise===operation)inFlightDraftPublications.delete(draft);},
        ()=>{if(inFlightDraftPublications.get(draft)?.promise===operation)inFlightDraftPublications.delete(draft);}
      );
      return {kind:'command',value:operation};
    }
    case 'start': {
      const actorRole=String(actor?.role||'').trim().toLowerCase();
      if(['client','cliente'].includes(actorRole)&&
        (sessionDeliveryModality(session)!=='guiada_en_app'||
          !['client_autonomous','guided_in_app'].includes(sessionDeliveryOwnership(session))))
        throw new Error('M28_SESSION_COACH_LED_CLIENT_START_FORBIDDEN');
      if(['client','cliente'].includes(actorRole)){
        // Publication is not enablement. The UI must never create a local
        // active workout from an unpublished, hidden or already-started one.
        if(!actorCanExecuteSession({role:'client',session})||!sessionReadyToStart(session))
          throw new Error('M43_CLIENT_SESSION_NOT_READY');
        if((actor?.clientId&&String(actor.clientId)!==String(execution?.clientId))||
          (session?.clientId&&String(session.clientId)!==String(execution?.clientId))||
          String(execution?.sessionId||'')!==String(session?.id||''))
          throw new Error('M43_CLIENT_EXECUTION_SCOPE_CONFLICT');
      }
      // A guided workout is autonomous. A stale appointment from this client's
      // calendar or recovered local state must never be attached to its start.
      // The server authorizes the persisted session, not a client assertion.
      const appointmentForStart=sessionRequiresConfirmedAppointment({role:actorRole,session})
        ?(payload.appointmentId||appointmentId):null;
      const command=buildStartExecutionCommand(execution,{appointmentId:appointmentForStart,sessionRevision:payload.sessionRevision??sessionRevision});
      if(!commandBus){startExecution(execution,{actor});return {kind:'execution',value:execution};}
      if(!isOnline(online)){
        if(offlinePermit?.canStart!==true)throw new Error('M26_OFFLINE_START_NOT_ALLOWED');
        return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>startExecution(execution,{actor}),execution)};
      }
      return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{startExecution(execution,{actor});execution.revision=executionRevision(result,1);})};
    }
    case 'complete-set': {
      recordSet(execution,session,{...payload,actor});
      if(hasNextExecutionStep(execution))beginRest(execution,payload.restSeconds??60,{actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'repeat-previous-set': {
      repeatPreviousSet(execution,session,{restSeconds:payload.restSeconds??60,rpe:payload.rpe,rir:payload.rir,actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'correct-set': {
      correctSet(execution,session,{...payload,actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'add-set': {
      addExecutionSet(execution,{actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'add-group-round': {
      addExecutionGroupRound(execution,{actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'extra-group-round-now': {
      addExtraGroupRoundAndAdvance(execution,session,{actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'undo-structure-add': {
      undoLastExecutionStructureChange(execution,{actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'extra-set-now': {
      addExtraSetAndAdvance(execution,session,{actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'skip-set': {
      skipExecutionSet(execution,session,{reason:payload.reason,actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'skip-exercise': {
      skipExecutionExercise(execution,session,{reason:payload.reason,actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'add-live-exercise': {
      addExecutionExercise(execution,{...payload,catalog,actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'previous': {
      const before=[execution.status,execution.index,execution.setIndex,execution.restUntil].join(':');
      retreatExecution(execution,{actor});
      const after=[execution.status,execution.index,execution.setIndex,execution.restUntil].join(':');
      return before===after?{kind:'execution',value:execution}:progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'next': {
      advanceExecution(execution,{actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'rest-expired-auto': {
      advanceExpiredRest(execution,session,{actor,nowMs:payload.nowMs??Date.now()});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'rest-minus': {
      adjustRest(execution,-15,{actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'rest-plus': {
      adjustRest(execution,15,{actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'substitute': {
      substituteExercise(execution,session,{fromExerciseId:payload.fromExerciseId,toExerciseId:payload.toExerciseId,catalog,reason:payload.reason,actor});
      return progressMutation(execution,commandBus,online,payload.operationId);
    }
    case 'pause': {
      const target=structuredClone(execution);pauseExecution(target,{actor});
      if(!commandBus){Object.assign(execution,target);return {kind:'execution',value:execution};}
      const command=buildPauseExecutionCommand(target,execution.revision||0);
      if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,target),execution)};
      return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,target,{revision:remoteRevision(result,target.revision)});},execution)};
    }
    case 'resume': {
      const target=structuredClone(execution);resumeExecution(target,{actor});
      if(!commandBus){Object.assign(execution,target);return {kind:'execution',value:execution};}
      const command=buildResumeExecutionCommand(target,execution.revision||0);
      if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,target),execution)};
      return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,target,{revision:remoteRevision(result,target.revision)});},execution)};
    }
    case 'cancel': {
      const reason=String(payload.reason||'').trim();const target=structuredClone(execution);cancelExecution(target,reason,{actor});
      if(!commandBus){Object.assign(execution,target);return {kind:'execution',value:execution};}
      const command=buildCancelExecutionCommand(target,reason,execution.revision||0);
      if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,target),execution)};
      return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,target,{revision:remoteRevision(result,target.revision)});},execution)};
    }
    case 'finish': {
      // A late hydration or local recovery copy may still hold revision N
      // after this exact Coach/Client execution received ACK N+1. Only an
      // authenticated, same-bus, same-client, same-execution ACK can raise CAS.
      // Two independent, strictly ACK-derived witnesses: the controller's
      // active snapshot and the authenticated bus's own server ledger.
      // A stale UI onAck observer must never make a confirmed second set
      // disappear from the CAS used to finish this exact execution.
      const busRevision=Number(commandBus?.confirmedExecutionRevision?.(execution)??0);
      const verified=Math.max(commandBus?confirmedExecutionCas(commandBus,execution):0,
        Number.isSafeInteger(busRevision)&&busRevision>0?busRevision:0);
      if(Number.isSafeInteger(verified)&&verified>Number(execution?.revision||0))
        execution.revision=verified;
      const completed=structuredClone(execution);finishExecution(completed,payload,{actor});
      const baseRevision=Math.max(Number(payload.baseRevision??execution.revision??0),verified);
      const command=buildExecutionCommand(completed,baseRevision);
      if(!commandBus){Object.assign(execution,completed);return {kind:'command',value:command};}
      if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,completed),execution)};
      return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,completed,{revision:remoteRevision(result,completed.revision)});},execution)};
    }
    default: throw new Error(`M26_SESSION_ACTION_UNKNOWN:${action}`);
  }
}


// SIGNATURE B30: Preserve open Coach prescription panels only across a render
// of the SAME draft. No persistence, account data or external state changes.
const SESSION_BUILDER_DISCLOSURE_SELECTOR='details[data-session-disclosure-key]';
const SESSION_BUILDER_KEY=/^(?:block-index|templates|block:[A-Za-z0-9._:-]{1,200}|group:[A-Za-z0-9._:-]{1,200}:[A-Za-z0-9._:-]{1,200})$/u;
const SESSION_BUILDER_DISCLOSURE_MAX=120;
export function captureSessionBuilderDisclosureState(root,draftId){
  const id=String(draftId||'').trim();
  const panel=id?root?.querySelector?.('[data-session-builder-workbench-v2]'):null;
  if(!panel?.querySelectorAll)return null;
  const open=[];
  for(const entry of panel.querySelectorAll(SESSION_BUILDER_DISCLOSURE_SELECTOR)){
    if(open.length>=SESSION_BUILDER_DISCLOSURE_MAX)break;
    const key=String(entry?.getAttribute?.('data-session-disclosure-key')||'');
    if(entry?.open===true&&SESSION_BUILDER_KEY.test(key)&&!open.includes(key))open.push(key);
  }
  return Object.freeze({draftId:id,open:Object.freeze(open)});
}
export function restoreSessionBuilderDisclosureState(root,snapshot,draftId){
  if(!snapshot||String(draftId||'').trim()!==snapshot.draftId)return 0;
  const panel=root?.querySelector?.('[data-session-builder-workbench-v2]');
  if(!panel?.querySelectorAll)return 0;
  const allowed=new Set(Array.isArray(snapshot.open)?snapshot.open.slice(0,SESSION_BUILDER_DISCLOSURE_MAX):[]);
  let count=0;
  for(const entry of panel.querySelectorAll(SESSION_BUILDER_DISCLOSURE_SELECTOR)){
    const key=String(entry?.getAttribute?.('data-session-disclosure-key')||'');
    if(SESSION_BUILDER_KEY.test(key)&&allowed.has(key)&&entry?.open!==true){entry.open=true;count++;}
  }
  return count;
}


const SESSION_FOCUS_FIELDS=Object.freeze([
  Object.freeze({kind:'block',attribute:'data-session-block-field'}),
  Object.freeze({kind:'draft',attribute:'data-session-draft-field'}),
  Object.freeze({kind:'search',attribute:'data-session-search'}),
  Object.freeze({kind:'filter',attribute:'data-session-filter'}),
  Object.freeze({kind:'template-name',attribute:'data-session-template-name'}),
  Object.freeze({kind:'template-select',attribute:'data-session-template-select'}),
]);
const SESSION_FOCUS_KEY=/^[A-Za-z0-9._:-]{1,200}$/u;
export function captureSessionBuilderFocus(root,draftId){
  const id=String(draftId||'').trim();
  const panel=id?root?.querySelector?.('[data-session-builder-workbench-v2]'):null;
  const focused=root?.ownerDocument?.activeElement;
  if(!panel?.contains?.(focused)||!focused?.getAttribute)return null;
  const definition=SESSION_FOCUS_FIELDS.find(row=>focused.getAttribute(row.attribute)!==null);
  if(!definition)return null;
  const field=String(focused.getAttribute(definition.attribute)||'');
  const blockId=String(focused.getAttribute('data-block-id')||'');
  const exerciseId=String(focused.getAttribute('data-exercise-id')||'');
  if(definition.kind==='block'&&(!SESSION_FOCUS_KEY.test(blockId)||!SESSION_FOCUS_KEY.test(field)))return null;
  if(!['search','template-name','template-select'].includes(definition.kind)&&definition.kind!=='block'&&!SESSION_FOCUS_KEY.test(field))return null;
  if(exerciseId&&!SESSION_FOCUS_KEY.test(exerciseId))return null;
  let start=null,end=null;
  try{
    if(Number.isInteger(focused.selectionStart)&&Number.isInteger(focused.selectionEnd)){
      start=Math.min(focused.selectionStart,200000);
      end=Math.min(focused.selectionEnd,200000);
    }
  }catch{}
  return Object.freeze({draftId:id,kind:definition.kind,field,blockId,exerciseId,start,end});
}
export function restoreSessionBuilderFocus(root,snapshot,draftId){
  if(!snapshot||String(draftId||'').trim()!==snapshot.draftId)return false;
  const panel=root?.querySelector?.('[data-session-builder-workbench-v2]');
  if(!panel?.querySelectorAll)return false;
  if(panel.contains?.(root?.ownerDocument?.activeElement))return false;
  const definition=SESSION_FOCUS_FIELDS.find(x=>x.kind===snapshot.kind);
  if(!definition)return false;
  const candidates=panel.querySelectorAll('['+definition.attribute+']');
  for(const item of candidates){
    if(String(item?.getAttribute?.(definition.attribute)||'')!==snapshot.field)continue;
    if(String(item?.getAttribute?.('data-block-id')||'')!==snapshot.blockId)continue;
    if(String(item?.getAttribute?.('data-exercise-id')||'')!==snapshot.exerciseId)continue;
    if(typeof item.focus!=='function')return false;
    try{item.focus({preventScroll:true});}catch{item.focus();}
    if(Number.isInteger(snapshot.start)&&Number.isInteger(snapshot.end)){
      try{item.setSelectionRange?.(snapshot.start,snapshot.end);}catch{}
    }
    return true;
  }
  return false;
}

// Shortcut reuses exactly the button and its current persistence protections.
export function isCoachDraftSaveShortcut(event,context={},root){
 const role=String(context?.actor?.role||'').trim().toLowerCase();
 if(!['coach','entrenador'].includes(role)||!context?.draft?.id)return false;
 if(String(event?.key||'').toLowerCase()!=='s'||!(event?.ctrlKey||event?.metaKey)||
    event?.altKey||event?.shiftKey||event?.isComposing||event?.repeat)return false;
 if(event?.defaultPrevented||!event?.target?.closest?.('[data-session-builder-workbench-v2]'))return false;
 if(!root?.querySelector?.('[data-session-builder-workbench-v2]'))return false;
 const button=root.querySelector?.('[data-session-action="save-draft"]');
 return Boolean(button&&!button.disabled&&button?.getAttribute?.('aria-disabled')!=='true');
}

export function createSessionController({root,getContext,render,onError=()=>{},autosaveDelayMs=180,progressActionTimeoutMs=4000,liveAddTimeoutMs=20000,finishTimeoutMs=20000,liveTelemetryController=null,telemetryOutbox=null,telemetryRemoteSync=null,lifecycleTarget=globalThis,visibilityTarget=globalThis.document,clockTarget=globalThis}){if(!root?.addEventListener)throw new Error('M26_SESSION_ROOT_REQUIRED');
  if(telemetryRemoteSync!==null&&typeof telemetryRemoteSync?.notifyStaged!=='function')throw new Error('M26_TELEMETRY_REMOTE_SYNC_INVALID');
  let mounted=false,autosaveTimer=null,scheduledContext=null,autosaveChain=Promise.resolve();
  let executionDraftTimer=null,scheduledExecutionContext=null,executionDraftChain=Promise.resolve();
  let pendingExecutionSyncTimer=null,pendingExecutionSyncRunning=false;
  const safeDelay=Math.max(50,Math.min(2000,Number(autosaveDelayMs)||180));
  const safeProgressActionTimeout=Math.max(250,Math.min(12000,Number(progressActionTimeoutMs)||4000));
  const safeLiveAddTimeout=Math.max(20,Math.min(120000,Number(liveAddTimeoutMs)||20000));
  const safeFinishTimeout=Math.max(20,Math.min(120000,Number(finishTimeoutMs)||20000));
  let sessionStickyTopbar=null,sessionStickyResizeObserver=null,sessionStickyResizeTarget=null;
  function currentSessionTopbar(){return root?.ownerDocument?.querySelector?.('.m26-topbar')||root.querySelector?.('.m26-topbar')||null;}
  function syncSessionStickyTop(){
    const topbar=currentSessionTopbar();
    const view=root?.ownerDocument?.defaultView||globalThis;
    let position='';
    try{position=topbar&&view?.getComputedStyle?String(view.getComputedStyle(topbar)?.position||''):'';}catch{position='';}
    const height=topbar?Math.max(0,Math.ceil(Number(topbar?.getBoundingClientRect?.().height||topbar?.offsetHeight||0))):0;
    const anchored=position==='sticky'||position==='fixed';
    root.style?.setProperty?.('--m26-session-sticky-top',anchored&&height>0?String(height+6)+'px':'.4rem');
    return anchored?height:0;
  }
  function bindSessionStickyTop(){
    const topbar=currentSessionTopbar();
    if(topbar!==sessionStickyTopbar){
      sessionStickyResizeObserver?.disconnect?.();
      sessionStickyResizeObserver=null;
      sessionStickyTopbar=topbar;
      const view=root?.ownerDocument?.defaultView||globalThis;
      const Observer=view?.ResizeObserver||globalThis.ResizeObserver;
      if(topbar&&typeof Observer==='function'){
        sessionStickyResizeObserver=new Observer(()=>syncSessionStickyTop());
        sessionStickyResizeObserver.observe(topbar);
      }
    }
    return syncSessionStickyTop();
  }
  function mountSessionStickyTop(){
    const view=root?.ownerDocument?.defaultView||globalThis;
    if(!sessionStickyResizeTarget&&view?.addEventListener){view.addEventListener('resize',bindSessionStickyTop,{passive:true});sessionStickyResizeTarget=view;}
    return bindSessionStickyTop();
  }
  function unmountSessionStickyTop(){
    sessionStickyResizeObserver?.disconnect?.();sessionStickyResizeObserver=null;sessionStickyTopbar=null;
    sessionStickyResizeTarget?.removeEventListener?.('resize',bindSessionStickyTop);sessionStickyResizeTarget=null;
    root.style?.removeProperty?.('--m26-session-sticky-top');
  }
  function hydrateActiveSetDraft(context=getContext()){
    const draft=context?.execution&&context?.session?getActiveSetDraft(context.execution,context.session):null;
    if(!draft)return;
    for(const node of root.querySelectorAll?.('[data-set-field]')||[]){
      const field=node.getAttribute('data-set-field');
      if(Object.prototype.hasOwnProperty.call(draft.values||{},field))node.value=draft.values[field]??'';
    }
  }
  function syncFeedbackPainControl(){
    const pain=root.querySelector?.('[data-session-feedback-pain]');
    const detail=root.querySelector?.('[data-session-feedback-pain-detail]');
    const painNotes=root.querySelector?.('[data-session-feedback-pain-notes]');
    const active=Boolean(pain?.checked);
    if(detail)detail.hidden=!active;
    pain?.setAttribute?.('aria-expanded',active?'true':'false');
    if(painNotes){painNotes.required=active;painNotes.setAttribute?.('aria-required',active?'true':'false');}
    return active;
  }
  function hydrateFinalFeedbackDraft(context=getContext()){
    const draft=context?.execution?getFinalFeedbackDraft(context.execution):null;
    if(!draft){syncFeedbackPainControl();return;}
    const values=draft.values||{};
    const rpe=root.querySelector?.('[data-session-feedback-rpe]');if(rpe)rpe.value=values.sessionRpe??'';
    const comment=root.querySelector?.('[data-session-feedback-comment]');if(comment)comment.value=values.comment??'';
    const pain=root.querySelector?.('[data-session-feedback-pain]');if(pain)pain.checked=Boolean(values.pain);
    const painNotes=root.querySelector?.('[data-session-feedback-pain-notes]');if(painNotes)painNotes.value=values.painNotes??'';
    syncFeedbackPainControl();
  }
  let liveAddPending=false,liveAddBlockedOperationId=null;
  let finishPending=false,finishBlockedOperationId=null;
  let queuedExitAfterFinish=null;
  let manualSyncPending=false;
  let sessionActionPending=false;
  // Compatibility name retained for the existing contract tests. This now
  // guards every primary focus action, not only Next: optimistic execution
  // state may render the following control before the previous remote mutation
  // has fully settled, and a fast tap must wait rather than disappear.
  function syncPendingNextControls(){
    const proxies=[...(root.querySelectorAll?.('[data-session-focus-proxy]')||[])];
    const targets=new Set(root.querySelectorAll?.('[data-session-action="next"]')||[]);
    const pairs=[];
    for(const proxy of proxies){
      const selector=String(proxy.getAttribute?.('data-session-focus-target')||'').trim();
      const live=proxy.closest?.('[data-session-live-state]');
      const target=selector&&live?.querySelector?.(selector);
      if(target)targets.add(target);
      pairs.push({proxy,target});
    }
    const restoreTarget=(button)=>{
      const action=button.getAttribute?.('data-session-action');
      let disabled=false;
      if(action==='complete-set'){
        const validation=root.querySelector?.('[data-m28-set-validation]');
        if(validation)disabled=validation.getAttribute?.('data-valid')!=='true';
      }else if(action==='finish'){
        const latest=getContext();
        const pendingIds=new Set(latest?.execution?.pendingOperationIds||[]);
        if(finishBlockedOperationId&&!pendingIds.has(finishBlockedOperationId))finishBlockedOperationId=null;
        disabled=finishPending||Boolean(finishBlockedOperationId)||latest?.execution?.status!=='awaiting_feedback';
      }
      button.disabled=disabled;
      button.setAttribute?.('aria-disabled',disabled?'true':'false');
      button.removeAttribute?.('aria-busy');
      button.removeAttribute?.('data-m26-wait-for-ack');
    };
    for(const button of targets){
      if(sessionActionPending){
        if(!button.disabled)button.setAttribute?.('data-m26-wait-for-ack','true');
        if(button.getAttribute?.('data-m26-wait-for-ack')==='true'){
          button.disabled=true;
          button.setAttribute?.('aria-disabled','true');
          button.setAttribute?.('aria-busy','true');
        }
      }else if(button.getAttribute?.('data-m26-wait-for-ack')==='true'){
        restoreTarget(button);
      }
    }
    for(const {proxy,target} of pairs){
      if(sessionActionPending){
        proxy.setAttribute?.('data-m26-wait-for-ack','true');
        proxy.disabled=true;
        proxy.setAttribute?.('aria-disabled','true');
        proxy.setAttribute?.('aria-busy','true');
      }else if(proxy.getAttribute?.('data-m26-wait-for-ack')==='true'){
        const disabled=Boolean(target?.disabled);
        proxy.disabled=disabled;
        proxy.setAttribute?.('aria-disabled',disabled?'true':'false');
        proxy.removeAttribute?.('aria-busy');
        proxy.removeAttribute?.('data-m26-wait-for-ack');
      }
    }
  }
  // Serialize shell auto-start and the explicit start action across renders.
  let startPending=false;
  let exitPending=false;
  let sessionClockTimer=null;
  let coachRestTimer=null,coachRestTimerSignature=null,coachRestSuppressedSignature=null,coachRestAdvancePending=false;
  function stopSessionClockTicker(){
    if(sessionClockTimer===null)return;
    clockTarget?.clearInterval?.(sessionClockTimer);
    sessionClockTimer=null;
  }
  function syncLiveReading(context){
    const heading=root.querySelector?.('[data-session-live-current-heading]');
    const value=root.querySelector?.('[data-session-live-current-value]');
    const note=root.querySelector?.('[data-session-live-reading-note]');
    if((!heading&&!value&&!note)||!context?.execution?.liveTelemetry)return false;
    // A normal one-second timer tick must not reprocess a whole workout and
    // redraw UI. Read the last certified timestamp; derive only at expiry or
    // if a legacy DOM surface has no state. The sensor adapter itself re-renders
    // on a new sample and provides a new timestamp.
    const displayed=note?.getAttribute?.('data-session-live-reading-state')||'';
    const lastAt=Date.parse(note?.getAttribute?.('data-session-live-last-at')||'');
    const expired=!Number.isFinite(lastAt)||Date.now()-lastAt>LIVE_SESSION_CURRENT_READING_MAX_AGE_MS;
    const connected=String(context.execution.liveTelemetry.status||'').toLowerCase()==='connected';
    if(displayed&&displayed!=='current'||
       displayed==='current'&&connected&&!expired)return true;
    const intelligence=deriveLiveSessionIntelligence(context.execution);
    const view=liveHeartRatePresentation(intelligence);
    if(heading){
      const next=`FC actual · ${view.bpm}`;
      if(heading.textContent!==next)heading.textContent=next;
    }
    if(value&&value.textContent!==view.bpm)value.textContent=view.bpm;
    if(note&&note.getAttribute?.('data-session-live-reading-state')!==view.state){
      note.textContent=view.note;
      note.hidden=!view.note;
      note.setAttribute?.('data-session-live-reading-state',view.state);
      note.setAttribute?.('data-session-live-last-at',intelligence.liveReading.lastAt||'');
    }
    return true;
  }
  function syncSessionClock(context=getContext()){
    const execution=context?.execution;
    if(!execution)return false;
    const elapsedNode=root.querySelector?.('[data-session-elapsed]');
    const restNode=root.querySelector?.('[data-session-rest]');
    const restCountdownNode=root.querySelector?.('[data-session-rest-countdown-value]');
    const hasLive=syncLiveReading(context);
    if(!elapsedNode&&!restNode&&!restCountdownNode)return hasLive;
    const rest=restRemainingSeconds(execution);
    if(elapsedNode)elapsedNode.textContent=formatDuration(executionElapsedMs(execution));
    if(restNode)restNode.textContent=rest>0?`${rest} s`:'—';
    if(restCountdownNode)restCountdownNode.textContent=`${rest} s`;
    return true;
  }
  function ensureSessionClockTicker(context=getContext()){
    const execution=context?.execution;
    const hasClock=syncSessionClock(context);
    if(!hasClock||execution?.status!=='active'||visibilityTarget?.visibilityState==='hidden'){
      stopSessionClockTicker();
      return;
    }
    if(sessionClockTimer!==null||typeof clockTarget?.setInterval!=='function')return;
    sessionClockTimer=clockTarget.setInterval(()=>{
      const latest=getContext();
      if(!syncSessionClock(latest)||latest?.execution?.status!=='active'||visibilityTarget?.visibilityState==='hidden'){
        stopSessionClockTicker();
      }
    },1000);
  }
  function isCoachContext(context){
    const role=String(context?.actor?.role||'').trim().toLowerCase();
    return role==='coach'||role==='entrenador';
  }
  function syncRecoveryReviewControl(context=getContext()){
    return enhanceSessionSyncRecoveryBanner(root,context?.execution,{role:context?.actor?.role});
  }
  function coachRestSignature(context=getContext()){
    const execution=context?.execution;
    if(!execution?.id||!execution?.restUntil)return null;
    return [execution.id,execution.index,execution.setIndex,execution.restUntil].join(':');
  }
  function cancelCoachRestAutoAdvance({suppress=false}={}){
    const signature=coachRestTimerSignature||coachRestSignature(getContext());
    if(suppress&&signature)coachRestSuppressedSignature=signature;
    clearTimeout(coachRestTimer);
    coachRestTimer=null;
    coachRestTimerSignature=null;
  }
  function restCorrectionInProgress(){
    const disclosure=root.querySelector?.('[data-session-rest-correction]');
    if(!disclosure)return false;
    const active=root.ownerDocument?.activeElement||null;
    return Boolean(disclosure.open||(active&&disclosure.contains?.(active)));
  }
  function scheduleCoachRestAutoAdvance(context=getContext()){
    if(coachRestAdvancePending)return;
    const execution=context?.execution;
    if(!isCoachContext(context)||execution?.status!=='active'||execution?.syncStatus!=='clean'){
      cancelCoachRestAutoAdvance();
      return;
    }
    const step=currentStep(execution,context?.session);
    const recorded=step?executionResultForStep(execution,step):null;
    const hasNext=hasNextExecutionStep(execution);
    if(!recorded||!hasNext||!execution.restUntil){
      cancelCoachRestAutoAdvance();
      return;
    }
    const deadline=new Date(execution.restUntil).getTime();
    if(!Number.isFinite(deadline)){
      cancelCoachRestAutoAdvance();
      return;
    }
    const signature=coachRestSignature(context);
    if(!signature||coachRestSuppressedSignature===signature)return;
    if(coachRestTimer&&coachRestTimerSignature===signature)return;
    cancelCoachRestAutoAdvance();
    const delay=Math.max(0,deadline-Date.now());
    coachRestTimerSignature=signature;
    coachRestTimer=setTimeout(async()=>{
      coachRestTimer=null;
      coachRestTimerSignature=null;
      const latest=getContext();
      if(coachRestSignature(latest)!==signature||coachRestSuppressedSignature===signature)return;
      if(
        visibilityTarget?.visibilityState==='hidden'||
        restCorrectionInProgress()
      ){
        coachRestSuppressedSignature=signature;
        return;
      }
      // Network uncertainty must defer auto-advance, not disable it for this rest forever.
      // A later reconciliation render will reschedule the already-expired rest immediately.
      if(latest?.execution?.syncStatus!=='clean')return;
      coachRestAdvancePending=true;
      try{
        const result=dispatchSessionAction({
          ...latest,
          action:'rest-expired-auto',
          payload:{nowMs:Date.now()},
        });
        await settleProgressMutation(result,latest);
        await persistContext(getContext());
        renderSession();
      }catch(error){
        coachRestSuppressedSignature=signature;
        onError(error);
        await persistContext(getContext()).catch(()=>{});
        renderSession();
      }finally{
        coachRestAdvancePending=false;
      }
    },Math.max(0,delay+25));
  }
  function syncLiveAddExerciseControl(context=getContext()){
    const select=root.querySelector?.('[data-session-live-add-exercise]');
    const button=root.querySelector?.('[data-session-action="add-live-exercise"]');
    if(!button)return;
    if(liveAddBlockedOperationId&&!new Set(context?.execution?.pendingOperationIds||[]).has(liveAddBlockedOperationId))liveAddBlockedOperationId=null;
    const state=liveAddExerciseSelectionState(select?.value,context?.catalog);
    const uncertain=Boolean(liveAddBlockedOperationId);
    button.disabled=liveAddPending||uncertain||!state.enabled;
    button.setAttribute?.('aria-disabled',!button.disabled?'false':'true');
    if(uncertain)button.setAttribute?.('title','Sincronizando el último ejercicio antes de permitir otra alta');
    else if(state.enabled)button.removeAttribute?.('title');
    else button.setAttribute?.('title','Selecciona un ejercicio válido antes de añadirlo');
    if(select){
      const hasSelectableOption=Array.from(select.options||[]).some((option)=>!option?.disabled&&liveAddExerciseSelectionState(option?.value,context?.catalog).enabled);
      select.disabled=liveAddPending||!hasSelectableOption;
      if(!select.disabled)select.removeAttribute?.('aria-disabled');
      else select.setAttribute?.('aria-disabled','true');
    }
  }
  function syncFinishControl(context=getContext()){
    const button=root.querySelector?.('[data-session-action="finish"]');
    if(!button)return;
    const pendingIds=new Set(context?.execution?.pendingOperationIds||[]);
    if(finishBlockedOperationId&&!pendingIds.has(finishBlockedOperationId))finishBlockedOperationId=null;
    const uncertain=Boolean(finishBlockedOperationId);
    const closable=context?.execution?.status==='awaiting_feedback';
    button.disabled=finishPending||uncertain||!closable;
    button.setAttribute?.('aria-disabled',button.disabled?'true':'false');
    if(uncertain)button.setAttribute?.('title','Confirmando el cierre de la sesión antes de permitir otro intento');
    else if(closable)button.removeAttribute?.('title');
    else button.setAttribute?.('title','La sesión ya no está pendiente de cierre');
  }
  function syncManualSyncControl(context=getContext()){
    const button=root.querySelector?.('[data-session-action="sync-now"]');
    if(!button)return;
    const pending=context?.execution?.syncStatus==='pending';
    button.disabled=manualSyncPending||!pending;
    button.setAttribute?.('aria-disabled',button.disabled?'true':'false');
    if(manualSyncPending)button.setAttribute?.('title','Sincronización en curso');
    else if(pending)button.removeAttribute?.('title');
    else button.setAttribute?.('title','No hay cambios pendientes para sincronizar');
  }
  function syncQuickRpeControl(){
    const input=root.querySelector?.('[data-set-field="rpe"]');
    const selected=Number(input?.value);
    for(const button of root.querySelectorAll?.('[data-session-action="set-rpe-quick"]')||[]){
      const value=Number(button.getAttribute?.('data-rpe-value'));
      const active=Number.isFinite(selected)&&Number.isFinite(value)&&selected===value;
      button.setAttribute?.('aria-pressed',active?'true':'false');
    }
    const currentRpe=String(input?.value??'').trim();
    const hasObservedRpe=Boolean(currentRpe)&&Number.isFinite(selected)&&selected>=1&&selected<=10;
    for(const repeat of root.querySelectorAll?.('[data-session-action=\"repeat-previous-set\"]')||[]){
      const priorRpe=String(repeat.getAttribute?.('data-rpe-value')??'').trim();
      const priorValid=Boolean(priorRpe)&&Number.isFinite(Number(priorRpe))&&Number(priorRpe)>=1&&Number(priorRpe)<=10;
      repeat.disabled=!(hasObservedRpe||priorValid);
      repeat.setAttribute?.('aria-label',hasObservedRpe?'Completar con el RPE real indicado':priorValid?'Confirmar RPE '+priorRpe+' como esfuerzo real de esta serie y completar':'Indica primero el RPE real para repetir el trabajo anterior');
    }
  }
  function syncFeedbackRpeControl(){
    const input=root.querySelector?.('[data-session-feedback-rpe]');
    const selected=Number(input?.value);
    for(const button of root.querySelectorAll?.('[data-session-action="set-session-rpe-quick"]')||[]){
      const value=Number(button.getAttribute?.('data-rpe-value'));
      const active=Number.isFinite(selected)&&Number.isFinite(value)&&selected===value;
      button.setAttribute?.('aria-pressed',active?'true':'false');
    }
  }
  function focusCoachReviewField(values={}){
    const rpe=root.querySelector?.('[data-set-field="rpe"]');
    if(typeof rpe?.focus==='function'){
      rpe.focus();
      return true;
    }
    const field=['reps','seconds','load','rir']
      .find((candidate)=>!String(values?.[candidate]??'').trim());
    if(!field)return false;
    const input=root.querySelector?.(`[data-set-field="${field}"]`);
    if(typeof input?.focus!=='function')return false;
    input.focus();
    return true;
  }
  function applySetDraftValues(context,values,{message}={}){
    if(!values||!context?.execution||!context?.session)return false;
    for(const node of root.querySelectorAll?.('[data-set-field]')||[]){
      const field=node.getAttribute('data-set-field');
      if(field==='notes'||!Object.prototype.hasOwnProperty.call(values,field))continue;
      node.value=values[field]??'';
    }
    const saved=updateActiveSetDraft(context.execution,context.session,fieldValues(root));
    if(saved)queueExecutionDraftPersist(context);
    if(context?.actionState){
      context.actionState.status='success';
      context.actionState.message=message||'Borrador actualizado. Revísalo antes de confirmar.';
    }
    if(isCoachContext(context)){
      syncQuickRpeControl();
      focusCoachReviewField(values);
      return true;
    }
    renderSession();
    return true;
  }
  function primeCoachSetDraft(context=getContext()){
    if(
      !isCoachContext(context)||
      context?.execution?.status!=='active'||
      !context?.session||
      getActiveSetDraft(context.execution,context.session)
    )return null;
    const step=currentStep(context.execution,context.session);
    if(!step||executionResultForStep(context.execution,step))return null;
    const suggestion=suggestedSetDraftValues(context.execution,context.session);
    if(!suggestion?.values)return null;
    fillEmptyControls(root,suggestion.values,{
      selector:'[data-set-field]',
      attribute:'data-set-field',
      skip:['notes','rpe','rir'],
    });
    const saved=updateActiveSetDraft(context.execution,context.session,fieldValues(root));
    if(!saved)return null;
    queueExecutionDraftPersist(context);
    return suggestion;
  }
  const baseRender=render;
  render=()=>{const draftBefore=getContext()?.draft?.id||null;const disclosure=captureSessionBuilderDisclosureState(root,draftBefore);const focused=captureSessionBuilderFocus(root,draftBefore);baseRender?.();const draftAfter=getContext()?.draft?.id||null;restoreSessionBuilderDisclosureState(root,disclosure,draftAfter);restoreSessionBuilderFocus(root,focused,draftAfter);hydrateActiveSetDraft(getContext());primeCoachSetDraft(getContext());hydrateFinalFeedbackDraft(getContext());syncLiveAddExerciseControl(getContext());syncFinishControl(getContext());syncManualSyncControl(getContext());syncQuickRpeControl();syncFeedbackRpeControl();syncRecoveryReviewControl(getContext());scheduleCoachRestAutoAdvance(getContext());ensureSessionClockTicker(getContext());syncPendingNextControls();};
  function renderSession(){render?.();}
  const telemetry=liveTelemetryController||createLiveTelemetryController({scope:globalThis,onUpdate:()=>render?.(),onDiagnostic:()=>{},telemetryOutbox,onOutboxStaged:()=>telemetryRemoteSync?.notifyStaged?.()});
  function queueAutosave(context){
    if(!context?.draft||!context?.autosaveDraft)return;
    // A fast client/plan switch must checkpoint the prior unsaved draft first.
    if(scheduledContext?.draft&&scheduledContext.draft!==context.draft){
      const previous=scheduledContext;
      autosaveChain=autosaveChain.then(()=>previous.autosaveDraft(previous.draft)).catch(onError);
    }
    scheduledContext=context;clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>{autosaveTimer=null;const target=scheduledContext;scheduledContext=null;autosaveChain=autosaveChain.then(()=>target?.autosaveDraft?.(target.draft)).catch(onError);},safeDelay);
  }
  function persistExecutionDraft(context){
    if(!context?.execution||!context?.recoveryCoordinator)return Promise.resolve();
    return Promise.resolve(context.recoveryCoordinator.persist({execution:context.execution,session:context.session,appointmentId:context.appointmentId,sessionRevision:context.sessionRevision}));
  }
  function queueExecutionDraftPersist(context){
    if(!context?.execution||!context?.recoveryCoordinator)return;
    // An unsaved set/feedback belongs to the original execution and client.
    if(scheduledExecutionContext?.execution&&(
      scheduledExecutionContext.execution.id!==context.execution.id||
      scheduledExecutionContext.execution.clientId!==context.execution.clientId
    )){
      const previous=scheduledExecutionContext;
      executionDraftChain=executionDraftChain.then(()=>persistExecutionDraft(previous)).catch(onError);
    }
    scheduledExecutionContext=context;clearTimeout(executionDraftTimer);executionDraftTimer=setTimeout(()=>{executionDraftTimer=null;const target=scheduledExecutionContext;scheduledExecutionContext=null;executionDraftChain=executionDraftChain.then(()=>persistExecutionDraft(target)).catch(onError);},safeDelay);
  }
  async function flushExecutionDraft(context=scheduledExecutionContext){
    if(executionDraftTimer){clearTimeout(executionDraftTimer);executionDraftTimer=null;const target=scheduledExecutionContext||context;scheduledExecutionContext=null;executionDraftChain=executionDraftChain.then(()=>persistExecutionDraft(target)).catch((error)=>{onError(error);throw error;});}
    await executionDraftChain;
  }
  async function flushAutosave(context=scheduledContext,{force=false}={}){
    let pendingSaved=false;
    if(autosaveTimer){
      clearTimeout(autosaveTimer);autosaveTimer=null;
      const target=scheduledContext||context;scheduledContext=null;pendingSaved=Boolean(target?.draft&&target?.autosaveDraft&&target.draft===context?.draft);
      autosaveChain=autosaveChain.then(()=>target?.draft?target.autosaveDraft?.(target.draft):undefined).catch((error)=>{onError(error);throw error;});
    }
    await autosaveChain;
    if(force&&context?.draft&&context?.autosaveDraft&&!pendingSaved)await context.autosaveDraft(context.draft);
  }
  async function persistContext(context,{recoveryCheckpoint=null}={}){
    if(context?.draft)await flushAutosave(context,{force:true});
    await flushExecutionDraft(context);
    if(!context?.execution||!context?.recoveryCoordinator)return;
    if(recoveryCheckpoint)await recoveryCheckpoint;
    await context.recoveryCoordinator.persist({execution:context.execution,session:context.session,appointmentId:context.appointmentId,sessionRevision:context.sessionRevision});
    await context.recoveryCoordinator.settle(context.execution);
  }
  function schedulePendingExecutionSync(context=getContext(),delayMs=1250){
    if(!context?.recoveryCoordinator?.synchronize||pendingExecutionSyncRunning)return false;
    const delay=Math.max(0,Number(delayMs)||0);
    if(pendingExecutionSyncTimer){
      if(delay>0)return false;
      clearTimeout(pendingExecutionSyncTimer);
      pendingExecutionSyncTimer=null;
    }
    pendingExecutionSyncTimer=setTimeout(async()=>{
      pendingExecutionSyncTimer=null;
      const latest=getContext();
      if(!latest?.execution||!latest?.recoveryCoordinator?.synchronize)return;
      pendingExecutionSyncRunning=true;
      try{
        await latest.recoveryCoordinator.synchronize();
        await persistContext(getContext()).catch(onError);
      }catch(error){onError(error);}
      finally{
        pendingExecutionSyncRunning=false;
        renderSession();
      }
    },delay);
    return true;
  }
  function settleProgressMutation(result,context){
    if(!result?.value)return Promise.resolve(result?.value);
    if(result.kind!=='command'||!result.operationId)return Promise.resolve(result.value);
    let uiTimedOut=false;
    const remote=Promise.resolve(result.value);
    void remote.then(
      ()=>{if(uiTimedOut)schedulePendingExecutionSync(getContext(),0);},
      ()=>{if(uiTimedOut)schedulePendingExecutionSync(getContext(),1250);},
    );
    return settleWithin(remote,safeProgressActionTimeout,()=>{
      uiTimedOut=true;
      markExecutionSync(context.execution,'pending',{operationId:result.operationId,errorCode:'M26_SESSION_PROGRESS_TIMEOUT'});
    });
  }
  function persistLifecycleContext(context=getContext()){
    if(!context?.execution||!context?.recoveryCoordinator)return;
    let recoveryCheckpoint=Promise.resolve();
    try{
      recoveryCheckpoint=Promise.resolve(persistExecutionDraft(context)).catch((error)=>{onError(error);});
    }catch(error){
      onError(error);
    }
    void persistContext(context,{recoveryCheckpoint}).catch(onError);
  }
  function pagehide(){persistLifecycleContext();}
  function visibilitychange(){
    if(visibilityTarget?.visibilityState==='hidden'){
      stopSessionClockTicker();
      cancelCoachRestAutoAdvance({suppress:true});
      persistLifecycleContext();
      return;
    }
    coachRestSuppressedSignature=null;
    scheduleCoachRestAutoAdvance(getContext());
    ensureSessionClockTicker(getContext());
  }
  async function start(){
    // The shell may auto-start at the same moment a Coach taps Inicio.
    if(startPending||sessionActionPending)return false;
    const context=getContext();
    if(!context?.execution||!context?.session)throw new Error('M26_SESSION_EXECUTION_REQUIRED');
    if(context.execution.status!=='ready')return false;
    startPending=true;
    const task=async()=>{
      await flushAutosave(context);
      const result=dispatchSessionAction({...context,action:'start',payload:{appointmentId:context.appointmentId,sessionRevision:context.sessionRevision}});
      return await result.value;
    };
    try{
      const outcome=context.actionState?await runAction(context.actionState,task):{ok:true,value:await task()};
      if(!outcome.ok){
        // Global diagnostics may supply a generic message. The action-specific
        // recovery message must be the last committed UI state, not overwritten.
        onError(outcome.error);
        const mapped=sessionCommandFailureOutcome(outcome.error,{action:'start',role:context?.actor?.role,execution:context?.execution});
        if(mapped&&context?.actionState){context.actionState.status=mapped.status;context.actionState.message=mapped.message;}
        renderSession();return false;
      }
      // A confirmed SESION_INICIAR is the source of truth. Local checkpoint
      // persistence can fail (private mode, quota, crash, another tab) but
      // must never relabel an already-committed workout as "failed to start".
      try{void telemetry.start(context.execution);}catch{}
      try{await persistContext(getContext());}
      catch(error){
        if(context?.actionState){
          context.actionState.status='retry';
          context.actionState.message='Entrenamiento iniciado y confirmado. No se pudo guardar la copia de recuperación en este dispositivo; comprueba la sincronización antes de salir.';
        }
      }
      renderSession();
      return true;
    }catch(error){
      if(context?.execution?.status==='active'){
        if(context?.actionState){
          context.actionState.status='retry';
          context.actionState.message='El inicio está confirmado. Hubo un problema al actualizar esta pantalla; vuelve a abrir la sesión para recuperar el entrenamiento.';
        }
        try{renderSession();}catch{}
        return true;
      }
      await persistContext(context).catch(()=>{});
      onError(error);
      const mapped=sessionCommandFailureOutcome(error,{action:'start',role:context?.actor?.role,execution:context?.execution});
      if(mapped&&context?.actionState){context.actionState.status=mapped.status;context.actionState.message=mapped.message;}
      renderSession();
      return false;
    }finally{
      startPending=false;
    }
  }
  function captureSessionEntryIntent(event){
    const button=event.target.closest?.('[data-workflow-action="start-published-session"][data-session-entry-level]');
    if(!button)return;
    const context=getContext();
    const clientId=String(context?.actor?.clientId||'').trim();
    const sessionId=String(button.getAttribute?.('data-entity-id')||'').trim();
    try{setPendingSessionEntry(root,{clientId,sessionId});}
    catch{clearPendingSessionEntry(root);}
  }
  async function onShellRendered(){
    bindSessionStickyTop();hydrateActiveSetDraft(getContext());hydrateFinalFeedbackDraft(getContext());syncLiveAddExerciseControl(getContext());syncFinishControl(getContext());syncManualSyncControl(getContext());syncQuickRpeControl();syncRecoveryReviewControl(getContext());scheduleCoachRestAutoAdvance(getContext());ensureSessionClockTicker(getContext());
    const pending=consumePendingSessionEntry(root);
    if(!pending)return;
    const context=getContext();
    const execution=context?.execution;
    const session=context?.session;
    if(!execution||!session)return;
    if(String(execution.clientId||'')!==pending.clientId||String(session.id||'')!==pending.sessionId)return;
    if(String(execution.status||'').trim().toLowerCase()!=='ready')return;
    if(pending.decision?.directStartAllowed!==true||pending.decision?.level!=='normal')return;
    await start();
  }
  function focusSessionRecoveryField(selector){
    if(!selector)return false;
    const target=root.querySelector?.(selector);
    if(typeof target?.focus!=='function')return false;
    const details=target.closest?.('details');if(details)details.open=true;
    try{target.focus({preventScroll:false});}catch{target.focus?.();}
    return true;
  }
  function focusBuilderBlock(blockId,{action=null,scrollOnNarrow=false}={}){
  const safeId=String(blockId||'').trim();
  if(!safeId)return false;
  const target=Array.from(root.querySelectorAll?.('[data-block-id]')||[]).find((node)=>String(node.getAttribute?.('data-block-id')||'')===safeId);
  if(!target)return false;
  const view=root?.ownerDocument?.defaultView||globalThis;
  let narrow=false;
  try{narrow=typeof view?.matchMedia==='function'&&view.matchMedia('(max-width: 840px)').matches;}catch{narrow=false;}
  if(scrollOnNarrow&&narrow){try{target.scrollIntoView?.({behavior:'smooth',block:'start'});}catch{target.scrollIntoView?.();}}
  const requested=action?target.querySelector?.(`[data-session-action="${action}"]`):null;
  const inverse=action==='move-up'?'move-down':action==='move-down'?'move-up':null;
  const alternate=inverse?target.querySelector?.(`[data-session-action="${inverse}"]`):null;
  const focusable=(node)=>Boolean(node&&!node.disabled&&node.getAttribute?.('aria-disabled')!=='true');
  // Reordering to a boundary disables the original arrow. Do not lose
  // keyboard focus in the detached button or attempt to focus a disabled one.
  const focusTarget=focusable(requested)?requested:focusable(alternate)?alternate:target;
  try{focusTarget.focus?.({preventScroll:true});}catch{focusTarget.focus?.();}
  return true;
}
async function click(event){
  const reasonPreset=event.target.closest?.('[data-session-reason-preset-target]');
  if(reasonPreset){
    event.preventDefault?.();
    const target=String(reasonPreset.getAttribute('data-session-reason-preset-target')||'').trim();
    const value=String(reasonPreset.getAttribute('data-session-reason-preset-value')||'').trim();
    const selector=({
      substitute:'[data-session-substitute-reason]',
      'skip-set':'[data-session-skip-set-reason]',
      'skip-exercise':'[data-session-skip-exercise-reason]',
    })[target]||null;
    const input=selector?root.querySelector?.(selector):null;
    if(value&&input){
      input.value=value;
      try{input.focus?.({preventScroll:true});}catch{input.focus?.();}
    }
    return;
  }
  const openSubstitution=event.target.closest?.('[data-session-open-substitution]');
  if(openSubstitution){
    event.preventDefault?.();
    const outer=root.querySelector?.('[data-session-live-secondary-context]');
    const panel=root.querySelector?.('[data-session-substitution-panel]');
    if(outer)outer.open=true;
    if(panel){
      panel.open=true;
      try{panel.scrollIntoView?.({behavior:'smooth',block:'nearest'});}catch{panel.scrollIntoView?.();}
    }
    const select=root.querySelector?.('[data-session-substitute]');
    try{select?.focus?.({preventScroll:true});}catch{select?.focus?.();}
    return;
  }
  const reviewBlock=event.target.closest?.('[data-session-review-block]');
  if(reviewBlock){
    event.preventDefault?.();
    const blockId=String(reviewBlock.getAttribute('data-session-review-block')||'').trim();
    const target=blockId?Array.from(root.querySelectorAll?.('[data-block-id]')||[]).find((node)=>String(node.getAttribute?.('data-block-id')||'')===blockId):null;
    if(target){
      try{target.scrollIntoView?.({behavior:'smooth',block:'start'});}catch{target.scrollIntoView?.();}
      focusBuilderBlock(blockId);
    }
    return;
  }
  const jump=event.target.closest?.('[data-session-jump]');
  if(jump){
    event.preventDefault?.();
    const targetKey=String(jump.getAttribute('data-session-jump')||'').trim();
    const target=targetKey?root.querySelector?.(`[data-session-jump-target="${targetKey}"]`):null;
    if(target){
      try{target.scrollIntoView?.({behavior:'smooth',block:'start'});}catch{target.scrollIntoView?.();}
      try{target.focus?.({preventScroll:true});}catch{target.focus?.();}
    }
    return;
  }
  const button=event.target.closest?.('[data-session-action]');if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')return;event.preventDefault?.();const action=button.getAttribute('data-session-action');const context=getContext();if(action==='load-more-library'){
    if(!context?.draft||!context?.catalog)return;
    const current=Math.max(24,Number(context.libraryVisibleLimit)||24);
    const result=renderSessionLibraryResults({
      draft:context.draft,catalog:context.catalog,query:context.query||'',
      filters:context.filters||{},mediaMap:context.mediaMap||null,
      role:context.role||'coach',visibleLimit:current+24,
    });
    const holder=root.querySelector?.('[data-session-search-results]');
    if(!holder)return;
    context.setLibraryVisibleLimit?.(current+24);
    holder.innerHTML=result.markup;
    // Move focus to an actual newly visible result; never replace the search
    // field or strand keyboard users on a removed "load more" button.
    const all=[...(holder.querySelectorAll?.('[data-session-action="add-exercise"]')||[])];
    const newlyAvailable=all.slice(current).find(button=>!button.disabled);
    const fallback=holder.querySelector?.('[data-session-action="load-more-library"]')||root.querySelector?.('[data-session-search]');
    (newlyAvailable||fallback)?.focus?.({preventScroll:false});
    return;
  }if(action==='clear-library-filters'){context.setQuery?.('');context.setLibraryVisibleLimit?.(24);for(const key of ['pattern','equipment','difficulty','intent'])context.setFilter?.(key,'');renderSession();const search=root.querySelector?.('[data-session-search]');try{search?.focus?.({preventScroll:true});}catch{search?.focus?.();}return;}if(action==='next'){
    if(coachRestAdvancePending)return;
    cancelCoachRestAutoAdvance({suppress:true});
  }else if(action==='rest-minus'||action==='rest-plus'){
    cancelCoachRestAutoAdvance();
  }if(action==='add-live-exercise'){
    if(liveAddPending||liveAddBlockedOperationId){syncLiveAddExerciseControl(context);return;}
    const liveSelection=liveAddExerciseSelectionState(root.querySelector?.('[data-session-live-add-exercise]')?.value,context?.catalog);
    if(!liveSelection.enabled){syncLiveAddExerciseControl(context);return;}
  }if(action==='finish'&&(finishPending||finishBlockedOperationId)){syncFinishControl(context);return;}if(action==='sync-now'){
  if(manualSyncPending){syncManualSyncControl(context);return;}
  const actionState=context?.actionState;
  const wasDisabled=button.disabled;
  manualSyncPending=true;
  button.disabled=true;
  button.setAttribute('aria-busy','true');
  syncManualSyncControl(context);
  try{
    if(!context?.execution||context.execution.syncStatus!=='pending')throw new Error('M26_SESSION_SYNC_NOT_PENDING');
    if(!context?.recoveryCoordinator?.synchronize)throw new Error('M26_SESSION_SYNC_UNAVAILABLE');
    const result=await context.recoveryCoordinator.synchronize();
    const outcome=manualSessionSyncOutcome(context.execution,result,null,{role:context?.actor?.role});
    if(actionState){actionState.status=outcome.status;actionState.message=outcome.message;}
  }catch(error){
    onError(error);
    const outcome=manualSessionSyncOutcome(context?.execution,null,error,{role:context?.actor?.role});
    if(actionState){actionState.status=outcome.status;actionState.message=outcome.message;}
  }finally{
    manualSyncPending=false;
    button.disabled=wasDisabled;
    button.removeAttribute('aria-busy');
    renderSession();
  }
  return;
}if(action==='reuse-planned-set'){
  if(!isCoachContext(context))throw new Error('M26_EXECUTION_COACH_ACTION_REQUIRED');
  const values=plannedSetDraftValues(context?.execution,context?.session);
  if(!values)return;
  applySetDraftValues(context,values,{message:'Objetivo planificado copiado como borrador. Revísalo antes de confirmar.'});
  return;
}if(action==='reuse-previous-set'){
  const values=previousSetReviewDraftValues(context?.execution);
  if(!values)return;
  applySetDraftValues(context,values,{message:'Reps, tiempo y carga de la serie anterior preparados. Registra el esfuerzo real antes de confirmar.'});
  return;
}if(action==='set-rpe-quick'){
  const value=Number(button.getAttribute('data-rpe-value'));
  const input=root.querySelector?.('[data-set-field="rpe"]');
  if(!Number.isFinite(value)||value<1||value>10||!input)return;
  input.value=String(value);
  const saved=context?.execution&&context?.session?updateActiveSetDraft(context.execution,context.session,fieldValues(root)):null;
  if(saved)queueExecutionDraftPersist(context);
  syncQuickRpeControl();
  return;
}if(action==='set-session-rpe-quick'){
  // Both Coach and Client can confirm their own real RPE; the existing
  // feedback command still enforces identity, permissions and final review.
  const value=Number(button.getAttribute('data-rpe-value'));
  const input=root.querySelector?.('[data-session-feedback-rpe]');
  if(!Number.isFinite(value)||value<1||value>10||!input||!context?.execution)return;
  input.value=String(value);
  try{const saved=updateFinalFeedbackDraft(context.execution,feedbackValues(root));if(saved)queueExecutionDraftPersist(context);}catch(error){onError(error);}
  syncFeedbackRpeControl();
  const comment=root.querySelector?.('[data-session-feedback-comment]');
  if(!String(comment?.value||'').trim())try{comment?.focus?.({preventScroll:true});}catch{comment?.focus?.();}
  return;
 }if(action==='exit-session'){
      // Exit is a persistence boundary: never navigate twice or race a mutation.
      if(exitPending||startPending)return;
      if(sessionActionPending){
        // Only the real user's explicit exit tap is deferred, and only when
        // the just-finished execution has already reached its local terminal
        // screen. Other overlapping actions remain fail-closed.
        if(finishPending&&context?.execution?.status==='completed'){
          queuedExitAfterFinish={context,target:sessionExitTarget(button)};
          button.setAttribute?.('aria-busy','true');
        }
        return;
      }
      exitPending=true;sessionActionPending=true;
      const target=sessionExitTarget(button);
      const wasDisabled=button.disabled;
      button.disabled=true;button.setAttribute('aria-busy','true');
      try{
        await settleWithin(persistContext(context),safeFinishTimeout);
        await context.onExit?.();
        if(target==='verificacion')queueMicrotask(()=>openSessionRecoveryReview(root));
      }catch(error){
        onError(error);
        // Do not navigate after a failed or uncertain recovery checkpoint.
        // Retain the form and clearly explain how to retry a safe exit.
        if(context?.actionState){
          context.actionState.status='retry';
          context.actionState.message='No se pudo confirmar el guardado antes de salir. La sesión sigue abierta con tus datos actuales; comprueba la conexión o el almacenamiento y vuelve a intentar Guardar y salir.';
        }
        renderSession();
      }finally{
        exitPending=false;sessionActionPending=false;
        button.disabled=wasDisabled;button.removeAttribute('aria-busy');
      }
      return;
    }
    if(sessionActionPending||action==='start'&&startPending)return;
    // A stale DOM control, accessibility activation or double tap after ACK
    // must never send another SESION_INICIAR for an already-active execution.
    if(action==='start'&&context?.execution?.status!=='ready')return;
    sessionActionPending=true;
    // Dock rerenders cannot overrule the actual controller's write lock.
    if(root.dataset)root.dataset.m26SessionActionPending='true';
    syncPendingNextControls();
    if(action==='start')startPending=true;
    const liveAddOperationId=action==='add-live-exercise'?createM26Id():null;
    const finishOperationId=action==='finish'?String(context?.execution?.id||''):null;
    let liveAddDispatched=false,liveAddTimedOut=false;
    let finishDispatched=false,finishTimedOut=false;
    let startRecoveryStorageWarning=false;
    if(action==='add-live-exercise')liveAddPending=true;
    if(action==='finish')finishPending=true;
    const actionState=context.actionState;let failureFocusSelector=null,builderFocusBlockId=null,builderFocusAction=null,builderFocusScroll=false,builderFocusAlways=false;const builderInsertContext=['add-exercise','add-group','duplicate-block'].includes(action)&&context?.draft?{activeGroupId:String(context.draft.activeGroupId||'').trim()||null,blockIds:new Set((context.draft.blocks||[]).map((item)=>item?.id).filter(Boolean))}:null;const wasDisabled=button.disabled;button.setAttribute('aria-busy','true');button.disabled=true;
    const task=async()=>{if(action==='publish'){try{await flushAutosave(context);}catch{/* El servidor puede confirmar aunque falle el guardado auxiliar; no crear un segundo envío. */}}else if(action==='start'){try{await flushAutosave(context);}catch{startRecoveryStorageWarning=true;}}else if(!['preview','edit-preview'].includes(action))await flushAutosave(context);if((action==='add-live-exercise'&&liveAddTimedOut)||(action==='finish'&&finishTimedOut))throw sessionActionTimeout();if(action==='start'){try{await flushExecutionDraft(context);}catch{startRecoveryStorageWarning=true;}}else await flushExecutionDraft(context);if(action==='finish'&&context?.commandBus&&context?.execution){await settlePriorExecutionWrites(context.commandBus,context.execution);if(!sameLiveExecutionOwner(context,getContext()))throw new Error('M26_SESSION_ACTION_OWNER_CHANGED');}if((action==='add-live-exercise'&&liveAddTimedOut)||(action==='finish'&&finishTimedOut))throw sessionActionTimeout();if(action==='discard-draft'){if(!context.discardDraft)throw new Error('M26_SESSION_DRAFT_DISCARD_UNAVAILABLE');return await context.discardDraft();}if(action==='save-template'){const name=String(root.querySelector?.('[data-session-template-name]')?.value||'').trim();if(!context.saveTemplate)throw new Error('M26_SESSION_TEMPLATE_SAVE_UNAVAILABLE');return await context.saveTemplate(name);}if(action==='load-template'){const templateId=String(root.querySelector?.('[data-session-template-select]')?.value||'').trim();if(!templateId)throw new Error('M26_SESSION_TEMPLATE_SELECTION_REQUIRED');if(!context.loadTemplate)throw new Error('M26_SESSION_TEMPLATE_LOAD_UNAVAILABLE');return await context.loadTemplate(templateId);}if(action==='restore-template-load'){if(!context.restoreTemplateLoad)throw new Error('M26_SESSION_TEMPLATE_UNDO_UNAVAILABLE');return await context.restoreTemplateLoad();}const payload={exerciseId:button.getAttribute('data-exercise-id'),blockId:button.getAttribute('data-block-id'),groupType:button.getAttribute('data-group-type'),restSeconds:button.getAttribute('data-rest-seconds')||undefined,durationMinutes:button.getAttribute('data-duration-minutes')||undefined,...fieldValues(root)};if(action==='reuse-exercise-memory'){const rawSets=button.getAttribute('data-reference-sets');payload.suggestion={sets:rawSets?Number(rawSets):null,reps:button.getAttribute('data-reference-reps')||'',plannedLoad:button.getAttribute('data-reference-load')||''};}if(action==='start'){payload.appointmentId=context.appointmentId;payload.sessionRevision=context.sessionRevision;}if(action==='substitute'){payload.fromExerciseId=button.getAttribute('data-from-exercise-id');payload.toExerciseId=root.querySelector?.('[data-session-substitute]')?.value;payload.reason=root.querySelector?.('[data-session-substitute-reason]')?.value;}
    if(action==='repeat-previous-set'){
      // One tap is truthful only if Coach explicitly confirms the displayed prior RPE.
      const enteredRpe=String(root.querySelector?.('[data-set-field="rpe"]')?.value??'').trim();
      payload.rpe=enteredRpe||String(button.getAttribute('data-rpe-value')||'').trim();
    }
    if(action==='skip-set')payload.reason=root.querySelector?.('[data-session-skip-set-reason]')?.value;
    if(action==='skip-exercise')payload.reason=root.querySelector?.('[data-session-skip-exercise-reason]')?.value;
    if(action==='add-live-exercise'){
      const liveSelection=liveAddExerciseSelectionState(root.querySelector?.('[data-session-live-add-exercise]')?.value,context?.catalog);
      if(!liveSelection.enabled)throw new Error('Selecciona un ejercicio válido antes de añadirlo');
      payload.operationId=liveAddOperationId;
      payload.exerciseId=liveSelection.exerciseId;
      payload.sets=root.querySelector?.('[data-session-live-add-sets]')?.value;
      payload.reps=root.querySelector?.('[data-session-live-add-reps]')?.value;
      payload.restSeconds=root.querySelector?.('[data-session-live-add-rest]')?.value;
      payload.tempo=root.querySelector?.('[data-session-live-add-tempo]')?.value;
      payload.targetRpe=root.querySelector?.('[data-session-live-add-rpe]')?.value;
      payload.targetRir=root.querySelector?.('[data-session-live-add-rir]')?.value;
      payload.position='next';
    }
    if(action==='restore-block'){payload.snapshot=context.builderUndo;if(!payload.snapshot)throw new Error('M26_SESSION_BLOCK_UNDO_UNAVAILABLE');}
    if(action==='cancel'){payload.reason=root.querySelector?.('[data-session-cancel-reason]')?.value;}if(action==='finish'){payload.sessionRpe=root.querySelector?.('[data-session-feedback-rpe]')?.value;payload.comment=root.querySelector?.('[data-session-feedback-comment]')?.value;payload.pain=root.querySelector?.('[data-session-feedback-pain]')?.checked;payload.painNotes=root.querySelector?.('[data-session-feedback-pain-notes]')?.value;}const result=dispatchSessionAction({...context,action,payload});if(['add-exercise','remove-block','restore-block','duplicate-block','move-up','move-down','reuse-exercise-memory','add-group','close-group','apply-client-duration'].includes(action))context.clearTemplateUndo?.();if(builderInsertContext){if(action==='add-exercise')builderFocusBlockId=builderInsertContext.activeGroupId||(context.draft?.blocks||[]).find((item)=>item?.id&&!builderInsertContext.blockIds.has(item.id))?.id||null;else builderFocusBlockId=(context.draft?.blocks||[]).find((item)=>item?.id&&!builderInsertContext.blockIds.has(item.id))?.id||null;if(builderFocusBlockId)builderFocusScroll=true;}if(['move-up','move-down'].includes(action)&&payload.blockId){builderFocusBlockId=payload.blockId;builderFocusAction=action;}if(action==='restore-block'&&payload.snapshot?.block?.id){builderFocusBlockId=payload.snapshot.block.id;builderFocusScroll=true;}if(action==='edit-preview'&&payload.blockId){builderFocusBlockId=payload.blockId;builderFocusAlways=true;}if(action==='remove-block'&&result.undo)context.setBuilderUndo?.(result.undo);if(action==='restore-block')context.setBuilderUndo?.(null);if(action==='add-live-exercise')liveAddDispatched=true;if(action==='finish')finishDispatched=true;
    if(['complete-set','repeat-previous-set','correct-set','add-set','add-group-round','extra-set-now','extra-group-round-now','skip-set','skip-exercise','previous','next','rest-minus','rest-plus','substitute'].includes(action))return await settleProgressMutation(result,context);
    return await result.value;};
    function observeLateFinish(promise){
      if(action!=='finish')return;
      void Promise.resolve(promise).then(async()=>{
        if(!finishTimedOut||!finishDispatched)return;
        finishBlockedOperationId=null;
        void telemetry.stop(context.execution,{reason:'finish'});
        await persistContext(getContext()).catch(onError);
        renderSession();
      },async()=>{
        if(!finishTimedOut||!finishDispatched)return;
        finishBlockedOperationId=null;
        await persistContext(getContext()).catch(onError);
        renderSession();
      });
    }
    const invokeTask=()=>{const promise=task();observeLateFinish(promise);return promise;};
    let runTask=invokeTask;
    if(action==='add-live-exercise')runTask=()=>settleWithin(invokeTask(),safeLiveAddTimeout,()=>{liveAddTimedOut=true;if(liveAddDispatched){liveAddBlockedOperationId=liveAddOperationId;markExecutionSync(context.execution,'pending',{operationId:liveAddOperationId,errorCode:'M26_SESSION_ACTION_TIMEOUT'});}});
    else if(action==='finish')runTask=()=>settleWithin(invokeTask(),safeFinishTimeout,()=>{finishTimedOut=true;if(finishDispatched&&finishOperationId){finishBlockedOperationId=finishOperationId;markExecutionSync(context.execution,'pending',{operationId:finishOperationId,errorCode:'M26_SESSION_ACTION_TIMEOUT'});}});
    try{const outcome=actionState?await runAction(actionState,runTask):{ok:true,value:await runTask()};if(!outcome.ok){const mapped=sessionCommandFailureOutcome(outcome.error,{action,role:context?.actor?.role,execution:context?.execution,draft:context?.draft,catalog:context?.catalog});onError(outcome.error);if(mapped&&actionState){actionState.status=mapped.status;actionState.message=mapped.message;failureFocusSelector=mapped.focusSelector||null;}if(context?.execution?.syncStatus==='pending')schedulePendingExecutionSync(context,1250);}if(outcome.ok){if(action==='start')void telemetry.start(context.execution);else if(action==='pause')void telemetry.pause(context.execution);else if(action==='resume')void telemetry.resume(context.execution);else if(action==='cancel'||action==='finish')void telemetry.stop(context.execution,{reason:action});}const timedOut=outcome.error?.code==='M26_SESSION_ACTION_TIMEOUT'||outcome.error?.message==='M26_SESSION_ACTION_TIMEOUT';if(timedOut&&context?.execution?.syncStatus==='pending'&&actionState){actionState.status='pending';actionState.message='Guardado en este dispositivo. Puedes continuar la sesión mientras IBERFIT confirma la sincronización.';}if(outcome.ok&&action==='publish'){
      const publication=await publicationAckRefreshOutcome(outcome.value,context.onPublished);
      if(!publication.refreshOk){
        // A second click would generate a different operation ID. Preserve the
        // confirmed remote result and the local draft until the view recovers.
        if(actionState){
          actionState.status='pending';
          actionState.message='El servidor confirmó la publicación, pero la vista todavía no se pudo actualizar. Conservamos el borrador; revisa la sesión antes de volver a publicar.';
        }
        try{await persistContext(getContext());}catch{}
        try{context.onPublicationRefreshPending?.(publication.error);}catch{}
      }
    }
    else if(timedOut)void persistContext(getContext()).catch(onError);
    else if(outcome.ok&&['preview','edit-preview'].includes(action)){
      try{await persistContext(getContext());}
      catch(error){
        if(actionState){actionState.status='pending';actionState.message='Revisión disponible, pero el borrador aún no se pudo guardar. Mantén esta pantalla abierta y vuelve a pulsar Guardar borrador antes de salir.';}
      }
    }
    else if(outcome.ok&&action==='start'){
      // Real button path: the server ACK has already advanced execution to
      // active. Persistence failures are recoverable warnings, not new starts.
      try{await persistContext(getContext());}
      catch{startRecoveryStorageWarning=true;}
      if(startRecoveryStorageWarning&&actionState){
        actionState.status='retry';
        actionState.message='Entrenamiento iniciado y confirmado. No se pudo guardar la copia de recuperación en este dispositivo; comprueba la sincronización antes de salir.';
      }
    }
    else if(outcome.ok&&action!=='discard-draft')await persistContext(getContext());
    // On invalid preview, never replace the actionable validation message with
    // a secondary local-storage error. Autosave remains scheduled separately.
    if(outcome.ok&&action==='save-draft'&&actionState){const confirmation=sessionDraftSaveOutcome(getContext()?.draftPersistence);actionState.status=confirmation.status;actionState.message=confirmation.message;}if(outcome.ok&&action==='reuse-exercise-memory'&&actionState){actionState.status='success';actionState.message='Referencia confirmada aplicada al borrador. Revisa la prescripción antes de publicar.';}if(outcome.ok&&action==='remove-block'&&actionState){actionState.status='success';actionState.message='Bloque eliminado del borrador.';}if(outcome.ok&&action==='restore-block'&&actionState){actionState.status='success';actionState.message='Bloque restaurado.';}if(outcome.ok&&action==='apply-client-duration'&&actionState){actionState.status='success';actionState.message='Duración del cliente aplicada al borrador. Revisa la sesión antes de publicar.';}renderSession();if(outcome.ok&&builderFocusAlways&&builderFocusBlockId){const target=Array.from(root.querySelectorAll?.('[data-block-id]')||[]).find((node)=>String(node.getAttribute?.('data-block-id')||'')===String(builderFocusBlockId));if(target){try{target.scrollIntoView?.({behavior:'smooth',block:'start'});}catch{target.scrollIntoView?.();}}}if(outcome.ok&&builderFocusBlockId)focusBuilderBlock(builderFocusBlockId,{action:builderFocusAction,scrollOnNarrow:builderFocusScroll});if(failureFocusSelector)focusSessionRecoveryField(failureFocusSelector);}catch(error){if(action==='start'&&context?.execution?.status==='active'){
      // A committed start must remain authoritative even if the UI refresh
      // throws. No second SESION_INICIAR with another operation ID.
      if(actionState){
        actionState.status='retry';
        actionState.message='El inicio está confirmado. Hubo un problema al actualizar esta pantalla; vuelve a abrir la sesión para recuperar el entrenamiento.';
      }
      try{renderSession();}catch{}
    }else{
      const timedOut=error?.code==='M26_SESSION_ACTION_TIMEOUT'||error?.message==='M26_SESSION_ACTION_TIMEOUT';
      if(timedOut)void persistContext(context).catch(onError);else await persistContext(context).catch(()=>{});
      onError(error);
      const mapped=sessionCommandFailureOutcome(error,{action,role:context?.actor?.role,execution:context?.execution,draft:context?.draft,catalog:context?.catalog});
      if(mapped&&actionState){actionState.status=mapped.status;actionState.message=mapped.message;}
      renderSession();
      if(mapped?.focusSelector)focusSessionRecoveryField(mapped.focusSelector);
    }}finally{sessionActionPending=false;if(root.dataset)delete root.dataset.m26SessionActionPending;syncPendingNextControls();if(action==='start')startPending=false;button.disabled=wasDisabled;button.removeAttribute('aria-busy');if(action==='add-live-exercise'){liveAddPending=false;syncLiveAddExerciseControl(getContext());}if(action==='finish'){
        finishPending=false;syncFinishControl(getContext());
        const intent=queuedExitAfterFinish;queuedExitAfterFinish=null;
        if(intent&&sessionExitAfterFinishConfirmed(intent.context,getContext())){
          queueMicrotask(()=>{
            if(!mounted||exitPending||sessionActionPending||startPending)return;
            if(!sessionExitAfterFinishConfirmed(intent.context,getContext()))return;
            const next=[...(root.querySelectorAll?.('[data-session-action="exit-session"]')||[])]
              .find(node=>!node.disabled&&sessionExitTarget(node)===intent.target);
            // Reuse the original guarded persistence boundary rather than
            // bypassing the exit controller or navigating from stale state.
            next?.click?.();
          });
        }
      }}}
  function input(event){const context=getContext();const search=event.target.closest?.('[data-session-search]');if(search){
      context.setQuery?.(search.value);
      context.setLibraryVisibleLimit?.(24);
      const holder=root.querySelector?.('[data-session-search-results]');
      if(holder&&context.draft&&context.catalog){
        // Only update matches; never replace Coach's focused input or set editors.
        const result=renderSessionLibraryResults({
          draft:context.draft,catalog:context.catalog,query:search.value,
          filters:context.filters||{},mediaMap:context.mediaMap||null,
          role:context.role||'coach',visibleLimit:24,
        });
        holder.innerHTML=result.markup;
        const count=root.querySelector?.('[data-session-library-result-count]');
        if(count){
          const n=Number(result.count)||0,active=Object.values(context.filters||{}).filter(Boolean).length;
          count.textContent=`${n} ${n===1?'resultado':'resultados'}${active?` · ${active} ${active===1?'filtro':'filtros'}`:''}`;
        }
      }else renderSession();
    }
    const liveAddSelect=event.target.closest?.('[data-session-live-add-exercise]');if(liveAddSelect)syncLiveAddExerciseControl(context);
    const draftField=event.target.closest?.('[data-session-draft-field]');if(draftField&&context.draft){try{context.clearTemplateUndo?.();dispatchSessionAction({...context,action:'update-draft',payload:{field:draftField.getAttribute('data-session-draft-field'),value:draftField.value}});}catch(error){onError(error);}}
    const blockField=event.target.closest?.('[data-session-block-field]');if(blockField&&context.draft){try{context.clearTemplateUndo?.();dispatchSessionAction({...context,action:'update-block',payload:{blockId:blockField.getAttribute('data-block-id'),exerciseId:blockField.getAttribute('data-exercise-id')||null,field:blockField.getAttribute('data-session-block-field'),value:blockField.value}});}catch(error){onError(error);}}
    const setField=event.target.closest?.('[data-set-field]');if(setField&&context.execution&&context.session){try{const saved=updateActiveSetDraft(context.execution,context.session,fieldValues(root));if(saved)queueExecutionDraftPersist(context);}catch(error){onError(error);}}
    if(setField?.getAttribute?.('data-set-field')==='rpe')syncQuickRpeControl();
    const feedbackField=event.target.closest?.('[data-session-feedback-rpe],[data-session-feedback-comment],[data-session-feedback-pain],[data-session-feedback-pain-notes]');if(feedbackField&&context.execution){try{const saved=updateFinalFeedbackDraft(context.execution,feedbackValues(root));if(saved)queueExecutionDraftPersist(context);}catch(error){onError(error);}if(feedbackField.matches?.('[data-session-feedback-pain]'))syncFeedbackPainControl();if(feedbackField.matches?.('[data-session-feedback-rpe]'))syncFeedbackRpeControl();}
    if(draftField||blockField)queueAutosave(context);
    if(sessionActionPending)queueMicrotask(syncPendingNextControls);
  }
  function keydown(event){
    const context=getContext();
    if(isCoachDraftSaveShortcut(event,context,root)){
      event.preventDefault?.();
      root.querySelector('[data-session-action="save-draft"]')?.click?.();
      return;
    }
    if(
      !isCoachContext(context)||
      event?.key!=='Enter'||
      event?.repeat||
      event?.isComposing||
      event?.shiftKey||
      event?.altKey||
      event?.ctrlKey||
      event?.metaKey
    )return;
    const trigger=event.target?.closest?.('[data-session-enter-complete]');
    if(!trigger)return;
    const entry=trigger.closest?.('[data-session-set-entry="current"]');
    const button=entry?.querySelector?.('[data-session-action="complete-set"]')||root.querySelector?.('[data-session-action="complete-set"]');
    if(!button||button.disabled)return;
    event.preventDefault?.();
    button.click?.();
  }
  function change(event){
    const filter=event.target.closest?.('[data-session-filter]');
    if(filter){
      const context=getContext();
      const key=String(filter.getAttribute('data-session-filter')||'').trim();
      const wasFocused=root.ownerDocument?.activeElement===filter;
      context.setFilter?.(key,filter.value);
      context.setLibraryVisibleLimit?.(24);
      renderSession();
      if(wasFocused&&key){
        const replacement=root.querySelector?.(`[data-session-filter="${key}"]`);
        try{replacement?.focus?.({preventScroll:true});}catch{replacement?.focus?.();}
      }
      return;
    }
    if(event.target.closest?.('[data-session-live-add-exercise]'))syncLiveAddExerciseControl(getContext());
    if(event.target.closest?.('[data-session-feedback-pain]'))syncFeedbackPainControl();
  }
  return Object.freeze({mount(){if(mounted)return;root.addEventListener('click',captureSessionEntryIntent,true);root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('keydown',keydown);root.addEventListener('m26:shell-rendered',onShellRendered);lifecycleTarget?.addEventListener?.('pagehide',pagehide);visibilityTarget?.addEventListener?.('visibilitychange',visibilitychange);mounted=true;mountSessionStickyTop();hydrateActiveSetDraft(getContext());primeCoachSetDraft(getContext());hydrateFinalFeedbackDraft(getContext());syncLiveAddExerciseControl(getContext());syncFinishControl(getContext());syncManualSyncControl(getContext());syncQuickRpeControl();syncRecoveryReviewControl(getContext());scheduleCoachRestAutoAdvance(getContext());ensureSessionClockTicker(getContext());},destroy(){if(!mounted)return;root.removeEventListener('click',captureSessionEntryIntent,true);root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('keydown',keydown);root.removeEventListener('m26:shell-rendered',onShellRendered);lifecycleTarget?.removeEventListener?.('pagehide',pagehide);visibilityTarget?.removeEventListener?.('visibilitychange',visibilitychange);clearPendingSessionEntry(root);mounted=false;unmountSessionStickyTop();stopSessionClockTicker();cancelCoachRestAutoAdvance();clearTimeout(autosaveTimer);clearTimeout(executionDraftTimer);clearTimeout(pendingExecutionSyncTimer);pendingExecutionSyncTimer=null;const context=getContext();void telemetry.stop(context?.execution,{reason:'controller-destroy'});persistLifecycleContext(context);},flushAutosave,start});
}
