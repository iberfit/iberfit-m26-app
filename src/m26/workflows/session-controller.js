import { addCatalogExercise, addTrainingGroup, closeTrainingGroup,duplicateSessionBlock,removeSessionBlock,moveSessionBlock,updateSessionDraft,updateSessionBlock,acceptSessionPreview,invalidateSessionPreview, buildPublishSessionCommand } from './session-builder.js';
import {
  startExecution,pauseExecution,resumeExecution,cancelExecution,recordSet,advanceExecution,retreatExecution,
  adjustRest,beginRest,substituteExercise,finishExecution,buildExecutionCommand,buildStartExecutionCommand,
  buildProgressExecutionCommand,buildPauseExecutionCommand,buildResumeExecutionCommand,buildCancelExecutionCommand,
  markExecutionSync
} from './session-execution.js';
import { runAction } from '../ui/action-state.js';

function fieldValues(root){const out={};for(const node of root.querySelectorAll?.('[data-set-field]')||[])out[node.getAttribute('data-set-field')]=node.value;return out;}
function remoteRevision(result,fallback){return Number(result?.response?.remoteRevision??result?.response?.revision??result?.response?.executionRevision??fallback??0);}
function executionRevision(result,fallback){return Number(result?.response?.executionRevision??result?.response?.remoteRevision??result?.response?.revision??fallback??0);}
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
function executeAndApply(commandBus,command,apply,execution){
  return Promise.resolve(commandBus.execute(command)).then(requireAck).then((result)=>{apply?.(result);if(execution)markExecutionSync(execution,'clean',{operationId:result?.command?.operationId});return result;}).catch((error)=>{markFailure(execution,error);throw error;});
}
function enqueueAndApply(commandBus,command,apply,execution){
  if(!commandBus?.enqueue)throw new Error('M26_OFFLINE_QUEUE_UNAVAILABLE');
  return Promise.resolve(commandBus.enqueue(command)).then((result)=>{apply?.(result);markExecutionSync(execution,'pending',{operationId:result?.command?.operationId});return {...result,queued:true};});
}
function isOnline(value){return value!==false;}

export function dispatchSessionAction({action,draft,execution,session,catalog,payload={},commandBus,appointmentId,sessionRevision=0,online=true,offlinePermit={}}={}){
  switch(action){
    case 'add-exercise': addCatalogExercise(draft,payload.exerciseId,catalog,payload.prescription); return {kind:'draft',value:draft};
    case 'remove-block': removeSessionBlock(draft,payload.blockId); return {kind:'draft',value:draft};
    case 'duplicate-block': duplicateSessionBlock(draft,payload.blockId); return {kind:'draft',value:draft};
    case 'move-up': moveSessionBlock(draft,payload.blockId,'up'); return {kind:'draft',value:draft};
    case 'move-down': moveSessionBlock(draft,payload.blockId,'down'); return {kind:'draft',value:draft};
    case 'preview': acceptSessionPreview(draft,catalog); return {kind:'draft',value:draft};
    case 'edit-preview': invalidateSessionPreview(draft); return {kind:'draft',value:draft};
    case 'update-draft': updateSessionDraft(draft,payload.field,payload.value); return {kind:'draft',value:draft};
    case 'update-block': updateSessionBlock(draft,{...payload,catalog}); return {kind:'draft',value:draft};
    case 'add-group': addTrainingGroup(draft,payload.groupType,[]); return {kind:'draft',value:draft};
    case 'close-group': closeTrainingGroup(draft); return {kind:'draft',value:draft};
    case 'save-draft': return {kind:'draft',value:draft};
    case 'publish': {
      if(!isOnline(online))throw new Error('M26_OFFLINE_PUBLICATION_NOT_ALLOWED');
      const command=buildPublishSessionCommand(draft,catalog,draft.revision||0);
      return commandBus?{kind:'command',value:executeAndApply(commandBus,command,(result)=>{draft.revision=remoteRevision(result,draft.revision);})}:{kind:'command',value:command};
    }
    case 'start': {
      const command=buildStartExecutionCommand(execution,{appointmentId:payload.appointmentId||appointmentId,sessionRevision:payload.sessionRevision??sessionRevision});
      if(!commandBus){startExecution(execution);return {kind:'execution',value:execution};}
      if(!isOnline(online)){
        if(offlinePermit?.canStart!==true)throw new Error('M26_OFFLINE_START_NOT_ALLOWED');
        return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>startExecution(execution),execution)};
      }
      return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{startExecution(execution);execution.revision=executionRevision(result,1);},execution)};
    }
    case 'complete-set': {
      recordSet(execution,session,payload);beginRest(execution,payload.restSeconds??60);
      if(!commandBus)return {kind:'execution',value:execution};
      const command=buildProgressExecutionCommand(execution,execution.revision||0);
      if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,null,execution)};
      return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{execution.revision=remoteRevision(result,execution.revision);},execution)};
    }
    case 'previous': retreatExecution(execution); return {kind:'execution',value:execution};
    case 'next': advanceExecution(execution); return {kind:'execution',value:execution};
    case 'rest-minus': adjustRest(execution,-15); return {kind:'execution',value:execution};
    case 'rest-plus': adjustRest(execution,15); return {kind:'execution',value:execution};
    case 'substitute': substituteExercise(execution,session,{fromExerciseId:payload.fromExerciseId,toExerciseId:payload.toExerciseId,catalog,reason:payload.reason}); return {kind:'execution',value:execution};
    case 'pause': {
      const target=structuredClone(execution);pauseExecution(target);
      if(!commandBus){Object.assign(execution,target);return {kind:'execution',value:execution};}
      const command=buildPauseExecutionCommand(target,execution.revision||0);
      if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,target),execution)};
      return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,target,{revision:remoteRevision(result,target.revision)});},execution)};
    }
    case 'resume': {
      const target=structuredClone(execution);resumeExecution(target);
      if(!commandBus){Object.assign(execution,target);return {kind:'execution',value:execution};}
      const command=buildResumeExecutionCommand(target,execution.revision||0);
      if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,target),execution)};
      return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,target,{revision:remoteRevision(result,target.revision)});},execution)};
    }
    case 'cancel': {
      const reason=String(payload.reason||'').trim();const target=structuredClone(execution);cancelExecution(target,reason);
      if(!commandBus){Object.assign(execution,target);return {kind:'execution',value:execution};}
      const command=buildCancelExecutionCommand(target,reason,execution.revision||0);
      if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,target),execution)};
      return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,target,{revision:remoteRevision(result,target.revision)});},execution)};
    }
    case 'finish': {
      const completed=structuredClone(execution);finishExecution(completed,payload);const command=buildExecutionCommand(completed,payload.baseRevision??execution.revision??0);
      if(!commandBus){Object.assign(execution,completed);return {kind:'command',value:command};}
      if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,completed),execution)};
      return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,completed,{revision:remoteRevision(result,completed.revision)});},execution)};
    }
    default: throw new Error(`M26_SESSION_ACTION_UNKNOWN:${action}`);
  }
}

export function createSessionController({root,getContext,render,onError=()=>{},autosaveDelayMs=180}){if(!root?.addEventListener)throw new Error('M26_SESSION_ROOT_REQUIRED');
  let mounted=false,autosaveTimer=null,scheduledContext=null,autosaveChain=Promise.resolve();
  const safeDelay=Math.max(50,Math.min(2000,Number(autosaveDelayMs)||180));
  function queueAutosave(context){
    if(!context?.draft||!context?.autosaveDraft)return;
    scheduledContext=context;clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>{autosaveTimer=null;const target=scheduledContext;scheduledContext=null;autosaveChain=autosaveChain.then(()=>target?.autosaveDraft?.()).catch(onError);},safeDelay);
  }
  async function flushAutosave(context=scheduledContext,{force=false}={}){
    let pendingSaved=false;
    if(autosaveTimer){
      clearTimeout(autosaveTimer);autosaveTimer=null;
      const target=context||scheduledContext;scheduledContext=null;pendingSaved=Boolean(target?.draft&&target?.autosaveDraft);
      autosaveChain=autosaveChain.then(()=>target?.draft?target.autosaveDraft?.():undefined).catch((error)=>{onError(error);throw error;});
    }
    await autosaveChain;
    if(force&&context?.draft&&context?.autosaveDraft&&!pendingSaved)await context.autosaveDraft();
  }
  async function persistContext(context){
    if(context?.draft)await flushAutosave(context,{force:true});
    if(!context?.execution||!context?.recoveryCoordinator)return;
    await context.recoveryCoordinator.persist({execution:context.execution,session:context.session,appointmentId:context.appointmentId,sessionRevision:context.sessionRevision});
    await context.recoveryCoordinator.settle(context.execution);
  }
  async function click(event){const button=event.target.closest?.('[data-session-action]');if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')return;event.preventDefault?.();const action=button.getAttribute('data-session-action');const context=getContext();if(action==='exit-session'){const wasDisabled=button.disabled;button.disabled=true;button.setAttribute('aria-busy','true');try{await persistContext(context);context.onExit?.();}catch(error){onError(error);render?.();}finally{button.disabled=wasDisabled;button.removeAttribute('aria-busy');}return;}const actionState=context.actionState;const wasDisabled=button.disabled;button.disabled=true;button.setAttribute('aria-busy','true');
    const task=async()=>{await flushAutosave(context);const payload={exerciseId:button.getAttribute('data-exercise-id'),blockId:button.getAttribute('data-block-id'),groupType:button.getAttribute('data-group-type'),restSeconds:button.getAttribute('data-rest-seconds')||undefined,...fieldValues(root)};if(action==='start'){payload.appointmentId=context.appointmentId;payload.sessionRevision=context.sessionRevision;}if(action==='substitute'){payload.fromExerciseId=button.getAttribute('data-from-exercise-id');payload.toExerciseId=root.querySelector?.('[data-session-substitute]')?.value;payload.reason=root.querySelector?.('[data-session-substitute-reason]')?.value;}if(action==='cancel'){payload.reason=root.querySelector?.('[data-session-cancel-reason]')?.value;}if(action==='finish'){payload.sessionRpe=root.querySelector?.('[data-session-feedback-rpe]')?.value;payload.comment=root.querySelector?.('[data-session-feedback-comment]')?.value;payload.pain=root.querySelector?.('[data-session-feedback-pain]')?.checked;payload.painNotes=root.querySelector?.('[data-session-feedback-pain-notes]')?.value;}const result=dispatchSessionAction({...context,action,payload});return await result.value;};
    try{const outcome=actionState?await runAction(actionState,task):{ok:true,value:await task()};if(!outcome.ok)onError(outcome.error);if(outcome.ok&&action==='publish')await context.onPublished?.(outcome.value);else await persistContext(context);if(outcome.ok&&action==='save-draft'&&actionState){actionState.status='success';actionState.message='Borrador guardado de forma segura.';}render?.();}catch(error){await persistContext(context).catch(()=>{});onError(error);}finally{button.disabled=wasDisabled;button.removeAttribute('aria-busy');}}
  function input(event){const context=getContext();const search=event.target.closest?.('[data-session-search]');if(search){context.setQuery?.(search.value);render?.();}
    const draftField=event.target.closest?.('[data-session-draft-field]');if(draftField&&context.draft){try{dispatchSessionAction({...context,action:'update-draft',payload:{field:draftField.getAttribute('data-session-draft-field'),value:draftField.value}});}catch(error){onError(error);}}
    const blockField=event.target.closest?.('[data-session-block-field]');if(blockField&&context.draft){try{dispatchSessionAction({...context,action:'update-block',payload:{blockId:blockField.getAttribute('data-block-id'),exerciseId:blockField.getAttribute('data-exercise-id')||null,field:blockField.getAttribute('data-session-block-field'),value:blockField.value}});}catch(error){onError(error);}}
    if(draftField||blockField)queueAutosave(context);}
  return Object.freeze({mount(){if(mounted)return;root.addEventListener('click',click);root.addEventListener('input',input);mounted=true;},destroy(){if(!mounted)return;root.removeEventListener('click',click);root.removeEventListener('input',input);mounted=false;void persistContext(getContext()).catch(onError);},flushAutosave});
}
