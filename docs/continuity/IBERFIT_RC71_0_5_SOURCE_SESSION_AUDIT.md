# IBERFIT M26 - RC71.0.5 Source + Session audit

Generated: 2026-08-23 01:03:49
Branch: feature/exercise-intelligence-memory
HEAD before preservation: a9c400ddbf687d36408a2249f5c1ce39cdb699d5

## Untracked audit

Untracked total before: 1330
Authoritative source candidates: 0
Generated/build: 1198
Archives: 4
Root historical RC artifacts: 8
Sensitive path candidates: 0
Other: 120

### Preserved authoritative source


### Historical root artifacts intentionally left local

- IBERFIT_RC45_BATCH02_APPLY.mjs
- RC45_EXERCISES_BATCH01.csv
- RC45_EXERCISES_BATCH02.csv
- RC45_EXERCISES_BATCH03.csv
- RC45_EXERCISES_BATCH04.csv
- RC45_EXERCISES_BATCH05.csv
- RC46_COACH_COCKPIT_SOURCE.txt
- RC46_COACH_SCOPE_SOURCE.txt

## Session Live structural map

### src/m26/workflows/session-ui.js
EXISTS=YES
BYTES=34073
SHA256=e9c212fb22d3135f13687e721fb890a126d86156cdcd5c184e71023eae054323
FUNCTIONS=24
EXPORTED_BINDINGS=0
DATA_ATTRIBUTES=24
FUNCTION_NAMES:
- alternativeOptions
- blockField
- bpmText
- draftMetrics
- e
- exerciseEditor
- exerciseMemoryChange
- exerciseMemoryDate
- exerciseMemorySetText
- groupEditor
- groupExerciseEditor
- groupName
- liveTelemetryStrip
- nextExecutionCopy
- plural
- previewMarkup
- qualityText
- renderExerciseMemoryInline
- renderExerciseMemorySession
- renderGuidedExecution
- renderSessionBuilder
- syncBanner
- telemetrySparkline
- timerStrip
EXPORTED_BINDINGS:
DATA_ATTRIBUTES:
- data-block-id
- data-exercise-id
- data-exercise-memory
- data-from-exercise-id
- data-group-type
- data-m26-area
- data-rest-seconds
- data-session-action
- data-session-block-field
- data-session-cancel-reason
- data-session-draft-field
- data-session-elapsed
- data-session-feedback-comment
- data-session-feedback-pain
- data-session-feedback-pain-notes
- data-session-feedback-rpe
- data-session-rest
- data-session-search
- data-session-substitute
- data-session-substitute-reason
- data-session-template-name
- data-session-template-select
- data-session-template-tools
- data-set-field
SEMANTIC_LINES:
- L1: import { currentStep } from './session-execution.js';
- L2: import { executionElapsedMs,formatDuration,restRemainingSeconds } from './session-timer.js';
- L4: import {deriveLiveSessionIntelligence} from '../intelligence/live-session-intelligence.js';
- L8: function syncBanner(execution){
- L9: const status=execution?.syncStatus||'clean';if(status==='clean')return '';
- L10: if(status==='pending')return '<div class="m26-sync-banner is-pending" role="status">Guardado en este dispositivo · pendiente de sincronización.</div>';
- L11: if(status==='conflict')return '<div class="m26-sync-banner is-conflict" role="alert">Existe una versión más reciente. Tu progreso local está protegido y requiere revisión.</div>';
- L12: return '<div class="m26-sync-banner is-rejected" role="alert">No fue posible confirmar el último cambio. El progreso local se conserva.</div>';
- L14: function timerStrip(execution){const elapsed=formatDuration(executionElapsedMs(execution));const rest=restRemainingSeconds(execution);return `<div class="m26-session-timers" aria-live="polite"><span><small>Tiempo activo</small><strong data- ...
- L27: function telemetrySparkline(points=[]){
- L45: function liveTelemetryStrip(execution,catalog){
- L46: const live=execution?.liveTelemetry;
- L48: const intelligence=deriveLiveSessionIntelligence(execution);
- L57: paused:'En pausa',
- L71: const recovery=intelligence.latestRecovery;
- L72: const recoveryName=recovery?.exerciseId
- L73: ?catalog?.get?.(recovery.exerciseId)?.name_es||'Ejercicio'
- L75: let recoveryMarkup='<article class="m26-live-context-card"><span>Recuperación en descanso</span><strong>Pendiente de cobertura</strong><p>Necesita al menos dos lecturas durante el mismo descanso.</p></article>';
- L76: if(recovery?.available){
- L77: const change=Number(recovery.dropBpm);
- L81: recoveryMarkup=`<article class="m26-live-context-card"><span>Recuperación en descanso</span><strong>${e(headline)}</strong><p>${e(recoveryName)} · ${e(recovery.elapsedSeconds)} s observados · sin clasificación clínica</p></article>`;
- L89: ?`<article class="m26-live-context-card"><span>FC + esfuerzo percibido</span><strong>${e(correlationName)} · serie ${e(correlation.setNumber)}</strong><p>RPE ${e(correlation.rpe??'—')} · RIR ${e(correlation.rir??'—')} · FC media ${e(bpmText ...
- L90: :'<article class="m26-live-context-card"><span>FC + esfuerzo percibido</span><strong>Sin serie registrada todavía</strong><p>La correlación aparece después de registrar RPE/RIR.</p></article>';
- L92: return `<section class="m26-panel m26-panel-soft m26-live-telemetry m26-live-intelligence" aria-live="polite"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Inteligencia de sesión en vivo</p><h3>FC actual · ${e(bpmText(intellige ...
- L93: }function alternativeOptions(catalog,currentExerciseId,pattern='',selectedId=null){return `<option value=""${selectedId?'':' selected'}>Sin alternativa fijada</option>${catalog.search('',pattern?{pattern}:{}).filter((item)=>item.id!==curren ...
- L94: function blockField({blockId,exerciseId='',field,label,value,type='text',min='',max='',step='',maxLength=''}){const guidance=field==='targetRpe'?renderGuidanceTrigger('training-load',{label:'Ayuda sobre carga, RPE y RIR'}):'';return `<label ...
- L111: function nextExecutionCopy(execution,catalog){
- L112: const item=execution?.queue?.[execution.index];
- L114: if(execution.setIndex+1<item.sets){
- L116: return {label:`Continuar · serie ${execution.setIndex+2}`,detail:ex?.name_es||'Mismo ejercicio'};
- L118: const next=execution.queue[execution.index+1];
- L126: if(set?.load?.raw){
- L127: parts.push(set.load.raw);
- L130: if(Number.isFinite(set?.reps)){
- L131: parts.push(`${set.reps} rep${set.reps===1?'':'s'}`);
- L134: if(Number.isFinite(set?.seconds)){
- L135: parts.push(`${set.seconds} s`);
- L138: if(Number.isFinite(set?.rpe)){
- L139: parts.push(`RPE ${set.rpe}`);
- L142: if(Number.isFinite(set?.rir)){
- L143: parts.push(`RIR ${set.rir}`);
- L150: const value=memory?.latest?.completedAt;
- L173: const delta=memory?.comparison?.lastLoad;
- L199: const load=
- L200: latest.lastLoad?.raw||
- L202: Number.isFinite(latest.totalSeconds)
- L203: ?`${latest.totalSeconds} s acumulados`
- L218: <strong>${e(load)}</strong>
- L228: function renderExerciseMemorySession(memory){
- L235: const load=
- L236: latest.lastLoad?.raw||
- L245: Number.isFinite(latest.averageRpe)
- L246: ?`RPE medio ${latest.averageRpe}`
- L248: Number.isFinite(latest.averageRir)
- L249: ?`RIR medio ${latest.averageRir}`
- L255: data-exercise-memory="session"
- L269: <strong>${e(load)}</strong>
- L293: function exerciseEditor(block,catalog,index,mediaMap,role,exerciseMemoryFor){const exercise=catalog.get(block.exerciseId)||{id:block.exerciseId,name_es:block.name||block.exerciseId,pattern:''};const visual=renderExerciseMedia({manifest:medi ...
- L294: function groupExerciseEditor(group,exerciseId,catalog,mediaMap,role,exerciseMemoryFor){const exercise=catalog.get(exerciseId)||{id:exerciseId,name_es:exerciseId,pattern:''};const p=group.prescriptions?.[exerciseId]||{};const visual=renderEx ...
- L295: function groupEditor(group,catalog,index,mediaMap,role,exerciseMemoryFor){const exercises=(group.exerciseIds||[]).map((id)=>groupExerciseEditor(group,id,catalog,mediaMap,role,exerciseMemoryFor)).join('')||'<p class="m26-empty-copy">Seleccio ...
- L296: function previewMarkup(draft,catalog,mediaMap,role){const blocks=draft.blocks.map((block,index)=>{if(block.type==='exercise'){const ex=catalog.get(block.exerciseId)||{id:block.exerciseId,name_es:block.name||block.exerciseId};const visual=re ...
- L297: export function renderSessionBuilder({draft,catalog,query='',filters={},templates=[],actionState,mediaMap,role='coach',exerciseMemoryFor=null}={}){
- L301: const cards=results.map((item)=>`<button type="button" class="m26-exercise-result" data-session-action="add-exercise" data-exercise-id="${e(item.id)}">${renderExerciseMedia({manifest:mediaMap,exercise:item,role,compact:true,fallback:true})} ...
- L302: const primary=draft.previewAccepted?'':`<button type="button" class="m26-primary-action" data-session-action="preview">Revisar sesión</button><button type="button" data-session-action="publish" disabled aria-disabled="true" title="Revisa la ...
- L304: const templateControls=['coach','admin'].includes(String(role||''))?`<section class="m26-panel m26-panel-soft" data-session-template-tools><div class="m26-panel-heading"><div><p class="m26-eyebrow">Reutilización</p><h3>Plantillas versionada ...
- L305: return `<section class="m26-session-builder"><header><div><p class="m26-eyebrow">Constructor</p><h2>${e(draft.title)}</h2></div><div class="m26-inline-actions"><button type="button" data-session-action="save-draft">Guardar borrador</button> ...
- L307: export function renderGuidedExecution({execution,session,catalog,actionState,mediaMap,role='client',exerciseMemoryFor=null}={}){
- L308: const state=actionState&&actionState.status!=='idle'?`<div class="m26-action-state is-${e(actionState.status)}" role="${actionState.status==='error'||actionState.status==='retry'?'alert':'status'}" aria-live="polite">${e(actionState.message ...
- L309: const sync=syncBanner(execution);
- L310: if(execution.status==='ready')return `<section class="m26-guided">${state}${sync}<div class="m26-panel m26-empty"><h2>${e(session.title||'Sesión IBERFIT')}</h2><p>Todo listo para comenzar.</p><div class="m26-inline-actions"><button type="bu ...
- L311: if(execution.status==='awaiting_feedback')return `<section class="m26-guided">${state}${sync}${timerStrip(execution)}${liveTelemetryStrip(execution,catalog)}<div class="m26-panel"><p class="m26-eyebrow">Cierre de sesión</p><h2>Cuéntanos cóm ...
- L312: if(execution.status==='paused')return `<section class="m26-guided">${state}${sync}${timerStrip(execution)}${liveTelemetryStrip(execution,catalog)}<div class="m26-panel m26-empty"><p class="m26-eyebrow">Sesión en pausa</p><h2>${e(session.tit ...
- L313: if(execution.status==='cancelled')return `<section class="m26-guided">${state}${sync}<div class="m26-panel m26-empty"><h2>Sesión cancelada</h2><p>${e(execution.cancellationReason||'La sesión fue cancelada.')}</p><p>${execution.syncStatus=== ...
- L314: if(execution.status==='completed'){
- L315: const confirmed=execution.syncStatus==='clean';
- L316: const feedback=execution.feedback||{};
- L317: const sessionRpe=Number(feedback.sessionRpe);
- L318: const feedbackSummary=Number.isFinite(sessionRpe)
- L319: ?`<p><strong>RPE de sesión ${e(sessionRpe)}/10</strong> · ${feedback.pain?'Molestia registrada para seguimiento.':'Sin dolor o molestia registrada.'}</p>`
- L321: const completedActions=confirmed

### src/m26/workflows/session-controller.js
EXISTS=YES
BYTES=15718
SHA256=1d758c3490e56c2d2871e3939727209d2d8e913cca8195e1f75c6cc9c8d7a58d
FUNCTIONS=15
EXPORTED_BINDINGS=0
DATA_ATTRIBUTES=19
FUNCTION_NAMES:
- click
- createSessionController
- dispatchSessionAction
- enqueueAndApply
- executeAndApply
- executionRevision
- fieldValues
- flushAutosave
- input
- isOnline
- markFailure
- persistContext
- queueAutosave
- remoteRevision
- requireAck
EXPORTED_BINDINGS:
DATA_ATTRIBUTES:
- data-block-id
- data-exercise-id
- data-from-exercise-id
- data-group-type
- data-rest-seconds
- data-session-action
- data-session-block-field
- data-session-cancel-reason
- data-session-draft-field
- data-session-feedback-comment
- data-session-feedback-pain
- data-session-feedback-pain-notes
- data-session-feedback-rpe
- data-session-search
- data-session-substitute
- data-session-substitute-reason
- data-session-template-name
- data-session-template-select
- data-set-field
SEMANTIC_LINES:
- L1: import { addCatalogExercise, addTrainingGroup, closeTrainingGroup,duplicateSessionBlock,removeSessionBlock,moveSessionBlock,updateSessionDraft,updateSessionBlock,acceptSessionPreview,invalidateSessionPreview, buildPublishSessionCommand } fr ...
- L3: startExecution,pauseExecution,resumeExecution,cancelExecution,recordSet,advanceExecution,retreatExecution,
- L4: adjustRest,beginRest,substituteExercise,finishExecution,buildExecutionCommand,buildStartExecutionCommand,
- L5: buildProgressExecutionCommand,buildPauseExecutionCommand,buildResumeExecutionCommand,buildCancelExecutionCommand,
- L6: markExecutionSync
- L7: } from './session-execution.js';
- L9: import { createLiveTelemetryController } from '../wearables/live-telemetry.js';
- L12: function remoteRevision(result,fallback){return Number(result?.response?.remoteRevision??result?.response?.revision??result?.response?.executionRevision??fallback??0);}
- L13: function executionRevision(result,fallback){return Number(result?.response?.executionRevision??result?.response?.remoteRevision??result?.response?.revision??fallback??0);}
- L14: function requireAck(result){if(!result?.ok)throw Object.assign(new Error(`M26_COMMAND_${String(result?.kind||'REJECTED').toUpperCase()}`),{result,status:result?.kind==='conflict'?409:422});return result;}
- L15: function markFailure(execution,error){
- L16: if(!execution)return;
- L20: if(kind==='conflict')markExecutionSync(execution,'conflict',{operationId,errorCode});
- L21: else if(kind==='pending')markExecutionSync(execution,'pending',{operationId,errorCode});
- L22: else markExecutionSync(execution,'rejected',{operationId,errorCode});
- L24: function executeAndApply(commandBus,command,apply,execution){
- L25: return Promise.resolve(commandBus.execute(command)).then(requireAck).then((result)=>{apply?.(result);if(execution)markExecutionSync(execution,'clean',{operationId:result?.command?.operationId});return result;}).catch((error)=>{markFailure(e ...
- L27: function enqueueAndApply(commandBus,command,apply,execution){
- L28: if(!commandBus?.enqueue)throw new Error('M26_OFFLINE_QUEUE_UNAVAILABLE');
- L29: return Promise.resolve(commandBus.enqueue(command)).then((result)=>{apply?.(result);markExecutionSync(execution,'pending',{operationId:result?.command?.operationId});return {...result,queued:true};});
- L33: export function dispatchSessionAction({action,draft,execution,session,catalog,payload={},commandBus,appointmentId,sessionRevision=0,online=true,offlinePermit={}}={}){
- L35: case 'add-exercise': addCatalogExercise(draft,payload.exerciseId,catalog,payload.prescription); return {kind:'draft',value:draft};
- L36: case 'remove-block': removeSessionBlock(draft,payload.blockId); return {kind:'draft',value:draft};
- L37: case 'duplicate-block': duplicateSessionBlock(draft,payload.blockId); return {kind:'draft',value:draft};
- L38: case 'move-up': moveSessionBlock(draft,payload.blockId,'up'); return {kind:'draft',value:draft};
- L39: case 'move-down': moveSessionBlock(draft,payload.blockId,'down'); return {kind:'draft',value:draft};
- L40: case 'preview': acceptSessionPreview(draft,catalog); return {kind:'draft',value:draft};
- L41: case 'edit-preview': invalidateSessionPreview(draft); return {kind:'draft',value:draft};
- L42: case 'update-draft': updateSessionDraft(draft,payload.field,payload.value); return {kind:'draft',value:draft};
- L43: case 'update-block': updateSessionBlock(draft,{...payload,catalog}); return {kind:'draft',value:draft};
- L44: case 'add-group': addTrainingGroup(draft,payload.groupType,[]); return {kind:'draft',value:draft};
- L48: if(!isOnline(online))throw new Error('M26_OFFLINE_PUBLICATION_NOT_ALLOWED');
- L49: const command=buildPublishSessionCommand(draft,catalog,draft.revision||0);
- L53: const command=buildStartExecutionCommand(execution,{appointmentId:payload.appointmentId||appointmentId,sessionRevision:payload.sessionRevision??sessionRevision});
- L54: if(!commandBus){startExecution(execution);return {kind:'execution',value:execution};}
- L56: if(offlinePermit?.canStart!==true)throw new Error('M26_OFFLINE_START_NOT_ALLOWED');
- L57: return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>startExecution(execution),execution)};
- L59: return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{startExecution(execution);execution.revision=executionRevision(result,1);},execution)};
- L61: case 'complete-set': {
- L62: recordSet(execution,session,payload);beginRest(execution,payload.restSeconds??60);
- L63: if(!commandBus)return {kind:'execution',value:execution};
- L64: const command=buildProgressExecutionCommand(execution,execution.revision||0);
- L65: if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,null,execution)};
- L66: return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{execution.revision=remoteRevision(result,execution.revision);},execution)};
- L68: case 'previous': retreatExecution(execution); return {kind:'execution',value:execution};
- L69: case 'next': advanceExecution(execution); return {kind:'execution',value:execution};
- L70: case 'rest-minus': adjustRest(execution,-15); return {kind:'execution',value:execution};
- L71: case 'rest-plus': adjustRest(execution,15); return {kind:'execution',value:execution};
- L72: case 'substitute': substituteExercise(execution,session,{fromExerciseId:payload.fromExerciseId,toExerciseId:payload.toExerciseId,catalog,reason:payload.reason}); return {kind:'execution',value:execution};
- L73: case 'pause': {
- L74: const target=structuredClone(execution);pauseExecution(target);
- L75: if(!commandBus){Object.assign(execution,target);return {kind:'execution',value:execution};}
- L76: const command=buildPauseExecutionCommand(target,execution.revision||0);
- L77: if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,target),execution)};
- L78: return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,target,{revision:remoteRevision(result,target.revision)});},execution)};
- L80: case 'resume': {
- L81: const target=structuredClone(execution);resumeExecution(target);
- L82: if(!commandBus){Object.assign(execution,target);return {kind:'execution',value:execution};}
- L83: const command=buildResumeExecutionCommand(target,execution.revision||0);
- L84: if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,target),execution)};
- L85: return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,target,{revision:remoteRevision(result,target.revision)});},execution)};
- L87: case 'cancel': {
- L88: const reason=String(payload.reason||'').trim();const target=structuredClone(execution);cancelExecution(target,reason);
- L89: if(!commandBus){Object.assign(execution,target);return {kind:'execution',value:execution};}
- L90: const command=buildCancelExecutionCommand(target,reason,execution.revision||0);
- L91: if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,target),execution)};
- L92: return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,target,{revision:remoteRevision(result,target.revision)});},execution)};
- L94: case 'finish': {
- L95: const completed=structuredClone(execution);finishExecution(completed,payload);const command=buildExecutionCommand(completed,payload.baseRevision??execution.revision??0);
- L96: if(!commandBus){Object.assign(execution,completed);return {kind:'command',value:command};}
- L97: if(!isOnline(online))return {kind:'queued',value:enqueueAndApply(commandBus,command,()=>Object.assign(execution,completed),execution)};
- L98: return {kind:'command',value:executeAndApply(commandBus,command,(result)=>{Object.assign(execution,completed,{revision:remoteRevision(result,completed.revision)});},execution)};
- L100: default: throw new Error(`M26_SESSION_ACTION_UNKNOWN:${action}`);
- L104: export function createSessionController({root,getContext,render,onError=()=>{},autosaveDelayMs=180,liveTelemetryController=null,telemetryOutbox=null,telemetryRemoteSync=null}){if(!root?.addEventListener)throw new Error('M26_SESSION_ROOT_REQ ...
- L105: if(telemetryRemoteSync!==null&&typeof telemetryRemoteSync?.notifyStaged!=='function')throw new Error('M26_TELEMETRY_REMOTE_SYNC_INVALID');
- L106: let mounted=false,autosaveTimer=null,scheduledContext=null,autosaveChain=Promise.resolve();
- L107: const telemetry=liveTelemetryController||createLiveTelemetryController({scope:globalThis,onUpdate:()=>render?.(),onDiagnostic:()=>{},telemetryOutbox,onOutboxStaged:()=>telemetryRemoteSync?.notifyStaged?.()});
- L111: scheduledContext=context;clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>{autosaveTimer=null;const target=scheduledContext;scheduledContext=null;autosaveChain=autosaveChain.then(()=>target?.autosaveDraft?.()).catch(onError);},safeD ...
- L113: async function flushAutosave(context=scheduledContext,{force=false}={}){
- L114: let pendingSaved=false;

### src/m26/workflows/session-execution.js
EXISTS=YES
BYTES=12889
SHA256=df31844beeea61a6247caaa6b0843dc47d3738c56816f11de5c808e8b7a609c2
FUNCTIONS=26
EXPORTED_BINDINGS=0
DATA_ATTRIBUTES=0
FUNCTION_NAMES:
- adjustRest
- advanceExecution
- beginRest
- buildCancelExecutionCommand
- buildExecutionCommand
- buildPauseExecutionCommand
- buildProgressExecutionCommand
- buildResumeExecutionCommand
- buildStartExecutionCommand
- cancelExecution
- clone
- createExecution
- currentStep
- event
- findExercise
- finishExecution
- markExecutionSync
- now
- pauseExecution
- recordSet
- remoteSnapshot
- resumeExecution
- retreatExecution
- startExecution
- substituteExercise
- uid
EXPORTED_BINDINGS:
DATA_ATTRIBUTES:
SEMANTIC_LINES:
- L1: import { freezeExecutionClock,resumeExecutionClock } from './session-timer.js';
- L6: function remoteSnapshot(execution){const out=clone(execution);delete out.syncStatus;delete out.pendingOperationIds;delete out.lastSyncError;delete out.recoveredAt;delete out.liveTelemetry;return out;}
- L7: function findExercise(session, exerciseId){
- L8: for(const block of session.blocks||[]){
- L14: export function createExecution({session,clientId,executionId=uid()}={}){
- L15: if(!session?.id||!clientId)throw new Error('M26_EXECUTION_SESSION_CLIENT_REQUIRED');
- L17: for(const block of session.blocks||[]){
- L18: if(block.type==='exercise'){const sets=Number(block.sets||1),restSeconds=Number(block.restSeconds||60),targetRpe=Number(block.targetRpe||7),targetRir=Number(block.targetRir??3);if(!block.exerciseId||!Number.isInteger(sets)||sets<1||sets>100 ...
- L19: else {const sets=Number(block.rounds||1);if(!Number.isInteger(sets)||sets<1||sets>100)throw new Error('M26_EXECUTION_GROUP_INVALID');for(const exerciseId of block.exerciseIds||[]){if(!exerciseId)throw new Error('M26_EXECUTION_GROUP_INVALID' ...
- L21: if(!queue.length)throw new Error('M26_EXECUTION_EMPTY_SESSION');
- L22: return {id:executionId,sessionId:session.id,clientId,status:'ready',syncStatus:'clean',pendingOperationIds:[],lastSyncError:null,revision:0,queue,index:0,setIndex:0,startedAt:null,activeSince:null,accumulatedActiveMs:0,completedAt:null,rest ...
- L24: export function currentStep(execution,session){
- L25: const item=execution.queue[execution.index]; if(!item)return null;
- L26: const exercise=findExercise(session,item.exerciseId);
- L27: return {...item,setNumber:execution.setIndex+1,totalSets:item.sets,exercise,prescription:clone(item.prescription||{})};
- L29: function event(execution,type,payload={}){execution.events.push({id:uid(),type,at:now(),payload:clone(payload)});}
- L30: export function markExecutionSync(execution,status,{operationId=null,errorCode=null}={}){
- L31: if(!['clean','pending','conflict','rejected'].includes(status))throw new Error('M26_EXECUTION_SYNC_STATUS_INVALID');
- L32: execution.syncStatus=status;execution.lastSyncError=errorCode||null;
- L33: const ids=new Set(execution.pendingOperationIds||[]);if(operationId&&status==='pending')ids.add(operationId);if(operationId&&status!=='pending')ids.delete(operationId);execution.pendingOperationIds=[...ids];
- L34: if(status==='clean'&&!operationId)execution.pendingOperationIds=[];
- L35: return execution;
- L37: export function startExecution(execution){if(execution.status!=='ready')throw new Error('M26_EXECUTION_NOT_READY');execution.status='active';execution.startedAt=now();execution.accumulatedActiveMs=Number(execution.accumulatedActiveMs||0);re ...
- L38: export function pauseExecution(execution){if(execution.status!=='active')throw new Error('M26_EXECUTION_PAUSE_INVALID');freezeExecutionClock(execution);execution.status='paused';execution.restUntil=null;event(execution,'SESSION_PAUSED');ret ...
- L39: export function resumeExecution(execution){if(execution.status!=='paused')throw new Error('M26_EXECUTION_RESUME_INVALID');execution.status='active';resumeExecutionClock(execution);event(execution,'SESSION_RESUMED');return execution;}
- L40: export function cancelExecution(execution,reason){if(!['ready','active','paused'].includes(execution.status))throw new Error('M26_EXECUTION_CANCEL_INVALID');if(!String(reason||'').trim())throw new Error('M26_EXECUTION_CANCEL_REASON_REQUIRED ...
- L41: export function recordSet(execution,session,input={}){
- L42: if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
- L43: const step=currentStep(execution,session);if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
- L44: const rawReps=input.reps??null,rawSeconds=input.seconds??null,load=input.load==null?null:String(input.load).trim().slice(0,80),rpe=Number(input.rpe),rir=input.rir==null||input.rir===''?null:Number(input.rir);
- L45: if((rawReps==null||rawReps==='')&&(rawSeconds==null||rawSeconds===''))throw new Error('M26_EXECUTION_RESULT_REQUIRED');
- L46: const reps=rawReps==null||rawReps===''?null:Number(rawReps),seconds=rawSeconds==null||rawSeconds===''?null:Number(rawSeconds);
- L47: if(reps!==null&&(!Number.isFinite(reps)||reps<0||reps>10000))throw new Error('M26_EXECUTION_REPS_INVALID');
- L48: if(seconds!==null&&(!Number.isFinite(seconds)||seconds<0||seconds>86400))throw new Error('M26_EXECUTION_SECONDS_INVALID');
- L49: if(!Number.isFinite(rpe)||rpe<1||rpe>10)throw new Error('M26_EXECUTION_RPE_INVALID');
- L50: if(rir!==null&&(!Number.isFinite(rir)||rir<0||rir>10))throw new Error('M26_EXECUTION_RIR_INVALID');
- L52: execution.results[key]={exerciseId:step.exerciseId,setNumber:step.setNumber,reps,seconds,load,rpe,rir,notes:String(input.notes||'').trim().slice(0,1000),completedAt:now()};
- L53: event(execution,'SET_COMPLETED',execution.results[key]);
- L54: return execution;
- L56: export function beginRest(execution,seconds){if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');const raw=Number(seconds||0);if(!Number.isFinite(raw))throw new Error('M26_EXECUTION_REST_INVALID');const value=Math.max ...
- L57: export function adjustRest(execution,deltaSeconds){if(!execution.restUntil)throw new Error('M26_EXECUTION_REST_NOT_ACTIVE');const current=new Date(execution.restUntil).getTime(),delta=Number(deltaSeconds||0);if(!Number.isFinite(current)||!N ...
- L58: export function advanceExecution(execution){
- L59: if(execution.status!=='active')throw new Error('M26_EXECUTION_ADVANCE_INVALID');
- L60: const item=execution.queue[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
- L61: const resultKey=`${item.exerciseId}:${execution.setIndex+1}`;if(!execution.results[resultKey])throw new Error('M26_EXECUTION_SET_NOT_RECORDED');
- L62: execution.restUntil=null;
- L63: if(execution.setIndex+1<item.sets)execution.setIndex+=1;else{execution.index+=1;execution.setIndex=0;}
- L64: event(execution,'STEP_ADVANCED',{index:execution.index,setIndex:execution.setIndex});
- L65: if(execution.index>=execution.queue.length){freezeExecutionClock(execution);execution.status='awaiting_feedback';}
- L66: return execution;
- L68: export function retreatExecution(execution){if(!['active','awaiting_feedback'].includes(execution.status))throw new Error('M26_EXECUTION_RETREAT_INVALID');if(execution.index===0&&execution.setIndex===0)return execution;execution.restUntil=n ...
- L69: export function substituteExercise(execution,session,{fromExerciseId,toExerciseId,catalog,reason}={}){
- L70: const safeReason=String(reason||'').trim().slice(0,500);if(!safeReason)throw new Error('M26_EXECUTION_SUBSTITUTION_REASON_REQUIRED');
- L71: if(!catalog?.has(toExerciseId))throw new Error('M26_EXECUTION_SUBSTITUTE_NOT_IN_CATALOG');if(toExerciseId===fromExerciseId)throw new Error('M26_EXECUTION_SUBSTITUTE_SAME');
- L72: const item=execution.queue.find((x,i)=>i>=execution.index&&x.exerciseId===fromExerciseId);if(!item)throw new Error('M26_EXECUTION_SUBSTITUTE_TARGET_MISSING');
- L73: item.exerciseId=toExerciseId;event(execution,'EXERCISE_SUBSTITUTED',{fromExerciseId,toExerciseId,reason:safeReason});return execution;
- L75: export function finishExecution(execution,feedback={}){
- L76: if(execution.status!=='awaiting_feedback')throw new Error('M26_EXECUTION_NOT_COMPLETE');
- L77: const sessionRpe=Number(feedback.sessionRpe||0);if(sessionRpe<1||sessionRpe>10)throw new Error('M26_EXECUTION_SESSION_RPE_REQUIRED');
- L78: if(!String(feedback.comment||'').trim())throw new Error('M26_EXECUTION_FEEDBACK_REQUIRED');
- L79: const pain=Boolean(feedback.pain),painNotes=String(feedback.painNotes||'').trim().slice(0,1000);if(pain&&!painNotes)throw new Error('M26_EXECUTION_PAIN_NOTES_REQUIRED');
- L80: freezeExecutionClock(execution);execution.feedback={sessionRpe,comment:String(feedback.comment).trim().slice(0,2000),pain,painNotes};execution.status='completed';execution.completedAt=now();event(execution,'SESSION_COMPLETED',execution.feed ...
- L82: export function buildExecutionCommand(execution,baseRevision=0){if(execution.status!=='completed')throw new Error('M26_EXECUTION_NOT_COMPLETED');return {type:'EJECUCION_COMPLETAR',entityType:'session_execution',entityId:execution.id,clientI ...
- L83: export function buildStartExecutionCommand(execution,{appointmentId,sessionRevision=0}={}){if(!execution?.sessionId||!execution?.id||!appointmentId)throw new Error('M26_EXECUTION_START_CONTEXT_REQUIRED');return {type:'SESION_INICIAR',entity ...
- L84: export function buildProgressExecutionCommand(execution,baseRevision=execution?.revision||0){if(!['active','awaiting_feedback'].includes(execution.status))throw new Error('M26_EXECUTION_PROGRESS_INVALID');return {type:'EJECUCION_GUARDAR_PRO ...
- L85: export function buildPauseExecutionCommand(execution,baseRevision=execution?.revision||0){if(execution.status!=='paused')throw new Error('M26_EXECUTION_PAUSE_TARGET_INVALID');return {type:'EJECUCION_PAUSAR',entityType:'session_execution',en ...
- L86: export function buildResumeExecutionCommand(execution,baseRevision=execution?.revision||0){if(execution.status!=='active')throw new Error('M26_EXECUTION_RESUME_TARGET_INVALID');return {type:'EJECUCION_REANUDAR',entityType:'session_execution ...
- L87: export function buildCancelExecutionCommand(execution,reason=execution?.cancellationReason,baseRevision=execution?.revision||0){if(execution.status!=='cancelled')throw new Error('M26_EXECUTION_CANCEL_TARGET_INVALID');if(!String(reason||''). ...

### src/m26/workflows/session-recovery.js
EXISTS=YES
BYTES=11417
SHA256=1d05d34950c5093ba880954cf370936f1be7ff0099168a0cd80e2d2db2d7f3a2
FUNCTIONS=23
EXPORTED_BINDINGS=0
DATA_ATTRIBUTES=0
FUNCTION_NAMES:
- cleanId
- clearOwner
- clone
- containsCredentialKeys
- createExecutionRecoveryCoordinator
- createExecutionRecoveryStore
- createExecutionSnapshot
- createMemoryExecutionRecoveryStore
- credentialKey
- finiteInteger
- finiteNumber
- list
- load
- parseDate
- purgeExpired
- reconcileExecutionSnapshots
- remove
- safeIso
- sanitizeExecution
- save
- validateExecutionSnapshot
- validateQueue
- validOptionalDate
EXPORTED_BINDINGS:
DATA_ATTRIBUTES:
SEMANTIC_LINES:
- L2: import { recoverExecutionTimers } from './session-timer.js';
- L4: const RECOVERABLE=new Set(['ready','active','paused','awaiting_feedback','completed','cancelled']);
- L5: const SETTLED=new Set(['completed','cancelled']);
- L10: function safeIso(value=new Date()){const ms=parseDate(value);if(ms===null)throw new Error('M26_RECOVERY_DATE_INVALID');return new Date(ms).toISOString();}
- L24: if(p.restSeconds!==undefined&&finiteNumber(p.restSeconds,{min:0,max:3600})===null)return false;
- L25: if(p.targetRpe!==undefined&&finiteNumber(p.targetRpe,{min:1,max:10})===null)return false;
- L26: if(p.targetRir!==undefined&&finiteNumber(p.targetRir,{min:0,max:10})===null)return false;
- L27: if(p.reps!==undefined&&p.reps!==null&&String(p.reps).length>80)return false;
- L29: if(p.alternativeId!==undefined&&p.alternativeId!==null&&!cleanId(p.alternativeId))return false;
- L34: function sanitizeExecution(execution){
- L35: const out=clone(execution);for(const key of ['token','accessToken','access_token','refreshToken','refresh_token','password','authorization','auth','apikey','apiKey','secret'])delete out[key];return out;
- L37: export function validateExecutionSnapshot(snapshot){
- L38: const errors=[],execution=snapshot?.execution,session=snapshot?.session;
- L42: if(finiteInteger(snapshot?.sessionRevision,{min:0})===null)errors.push('SESSION_REVISION_INVALID');
- L43: if(!cleanId(execution?.id)||!cleanId(execution?.sessionId)||!cleanId(execution?.clientId))errors.push('EXECUTION_IDENTITY_REQUIRED');
- L44: if(!RECOVERABLE.has(execution?.status))errors.push('EXECUTION_STATUS_INVALID');
- L45: if(!validateQueue(execution?.queue))errors.push('EXECUTION_QUEUE_INVALID');
- L46: const queue=Array.isArray(execution?.queue)?execution.queue:[],index=finiteInteger(execution?.index,{min:0,max:queue.length});
- L47: const mayBeAtEnd=SETTLED.has(execution?.status)||execution?.status==='awaiting_feedback';
- L48: if(index===null||(!mayBeAtEnd&&index>=queue.length))errors.push('EXECUTION_INDEX_INVALID');
- L49: const setIndex=finiteInteger(execution?.setIndex,{min:0,max:99});
- L50: if(setIndex===null||(index===queue.length&&setIndex!==0)||(index<queue.length&&setIndex>=Number(queue[index]?.sets||0)))errors.push('EXECUTION_SET_INDEX_INVALID');
- L51: if(finiteInteger(execution?.revision,{min:0})===null)errors.push('EXECUTION_REVISION_INVALID');
- L52: if(finiteNumber(execution?.accumulatedActiveMs,{min:0,max:365*DAY_MS})===null)errors.push('EXECUTION_TIMER_INVALID');
- L53: for(const field of ['activeSince','restUntil','startedAt','completedAt','cancelledAt','recoveredAt'])if(!validOptionalDate(execution?.[field])){errors.push('EXECUTION_DATE_INVALID');break;}
- L54: if(!cleanId(session?.id)||session.id!==execution?.sessionId)errors.push('SESSION_MISMATCH');
- L55: if(cleanId(session?.clientId||session?.client_id)!==execution?.clientId)errors.push('SESSION_CLIENT_MISMATCH');
- L60: export function createExecutionSnapshot({execution,session,ownerId,appointmentId=null,sessionRevision=0,savedAt=new Date(),dirty=true}={}){
- L61: if(!execution||!session)throw new Error('M26_RECOVERY_CONTEXT_REQUIRED');
- L62: const snapshot={schemaVersion:VERSION,ownerId:String(ownerId||'').trim(),savedAt:safeIso(savedAt),dirty:Boolean(dirty),appointmentId:appointmentId||null,sessionRevision:Number(sessionRevision||0),execution:sanitizeExecution(execution),sessi ...
- L63: const validation=validateExecutionSnapshot(snapshot);if(!validation.ok)throw new Error(`M26_RECOVERY_SNAPSHOT_INVALID:${validation.errors.join(',')}`);return snapshot;
- L65: export function reconcileExecutionSnapshots({local,remote}={}){
- L66: if(!local)return {kind:'remote',snapshot:clone(remote),conflict:null};if(!remote)return {kind:'local',snapshot:clone(local),conflict:null};
- L67: const localValidation=validateExecutionSnapshot(local),remoteValidation=validateExecutionSnapshot(remote);
- L68: if(!localValidation.ok&&!remoteValidation.ok)return {kind:'invalid',snapshot:null,conflict:{code:'BOTH_SNAPSHOTS_INVALID',localErrors:localValidation.errors,remoteErrors:remoteValidation.errors}};
- L69: if(!localValidation.ok)return {kind:'remote',snapshot:clone(remote),conflict:null};if(!remoteValidation.ok)return {kind:'local',snapshot:clone(local),conflict:null};
- L70: if(local.ownerId!==remote.ownerId||local.execution.clientId!==remote.execution.clientId||local.execution.sessionId!==remote.execution.sessionId)return {kind:'conflict',snapshot:clone(local),conflict:{code:'SNAPSHOT_SCOPE_MISMATCH'}};
- L71: const localRevision=Number(local.execution.revision||0),remoteRevision=Number(remote.execution.revision||0);
- L72: if(SETTLED.has(remote.execution.status)&&remoteRevision>=localRevision)return {kind:'remote',snapshot:clone(remote),conflict:null};
- L73: if(remoteRevision>localRevision&&local.dirty)return {kind:'conflict',snapshot:clone(local),conflict:{code:'REMOTE_REVISION_AHEAD',localRevision,remoteRevision,localStatus:local.execution.status,remoteStatus:remote.execution.status}};
- L74: if(remoteRevision>localRevision)return {kind:'remote',snapshot:clone(remote),conflict:null};
- L75: return {kind:'local',snapshot:clone(local),conflict:null};
- L77: export function createExecutionRecoveryStore({storage=createBrowserKeyValueStore(),ownerId,prefix='m26:execution:',now=()=>new Date(),ttlDays=30}={}){
- L78: const owner=cleanId(ownerId);if(!owner)throw new Error('M26_RECOVERY_OWNER_REQUIRED');
- L80: const ownerPrefix=`${prefix}${owner}:`;const key=(executionId)=>{const id=cleanId(executionId);if(!id)throw new Error('M26_RECOVERY_EXECUTION_ID_INVALID');return `${ownerPrefix}${id}`;};
- L81: const currentMs=()=>{const ms=parseDate(now());if(ms===null)throw new Error('M26_RECOVERY_NOW_INVALID');return ms;};
- L83: async function save(context){const at=currentMs(),snapshot=createExecutionSnapshot({...context,ownerId:owner,savedAt:new Date(at)});await storage.set(key(snapshot.execution.id),snapshot);return clone(snapshot);}
- L84: async function load(executionId){
- L85: const storageKey=key(executionId),snapshot=await storage.get(storageKey);if(!snapshot)return null;
- L86: const validation=validateExecutionSnapshot(snapshot);if(!validation.ok||snapshot.ownerId!==owner||expired(snapshot)){await storage.remove(storageKey);return null;}
- L87: recoverExecutionTimers(snapshot.execution,currentMs());return clone(snapshot);
- L89: async function list({clientId,includeSettled=false}={}){
- L90: const at=currentMs(),scope=clientId==null?null:cleanId(clientId);if(clientId!=null&&!scope)throw new Error('M26_RECOVERY_CLIENT_ID_INVALID');
- L92: const validation=validateExecutionSnapshot(snapshot);
- L94: if(scope&&snapshot.execution.clientId!==scope)continue;
- L95: if(!includeSettled&&SETTLED.has(snapshot.execution.status)&&snapshot.execution.syncStatus==='clean')continue;
- L96: recoverExecutionTimers(snapshot.execution,at);out.push(clone(snapshot));
- L100: async function remove(executionId){await storage.remove(key(executionId));}
- L101: async function purgeExpired(){const at=currentMs();let removed=0;for(const [storageKey,snapshot] of await storage.entries(ownerPrefix)){const validation=validateExecutionSnapshot(snapshot);if(!validation.ok||snapshot.ownerId!==owner||expire ...
- L102: async function clearOwner(){await storage.clear(ownerPrefix);}
- L103: return Object.freeze({ownerId:owner,save,load,list,remove,purgeExpired,clearOwner});
- L105: export function createMemoryExecutionRecoveryStore(options={}){return createExecutionRecoveryStore({...options,storage:createMemoryKeyValueStore()});}
- L106: export function createExecutionRecoveryCoordinator({store,commandBus,isOnline=()=>globalThis.navigator?.onLine!==false}={}){
- L107: if(!store?.save||!store?.load||!store?.list||!store?.remove)throw new Error('M26_RECOVERY_STORE_REQUIRED');
- L109: async persist(context){return store.save({...context,dirty:context?.execution?.syncStatus!=='clean'});},
- L110: async recover(executionId){return store.load(executionId);},
- L111: async list(options={}){return store.list(options);},
- L112: async latest(options={}){return (await store.list(options))[0]||null;},
- L113: async purgeExpired(){return store.purgeExpired?.()||0;},
- L114: async settle(execution){if(SETTLED.has(execution?.status)&&execution?.syncStatus==='clean')await store.remove(execution.id);},
- L115: async synchronize(){if(!isOnline())return {online:false,attempted:0,results:[]};if(!commandBus?.flushPending)return {online:true,attempted:0,results:[]};return commandBus.flushPending();},

### src/m26/workflows/session-timer.js
EXISTS=YES
BYTES=2618
SHA256=340d76b29d582479b280d94a1b6a52fc44348464cae0c6c74b9c550253cc63af
FUNCTIONS=10
EXPORTED_BINDINGS=0
DATA_ATTRIBUTES=0
FUNCTION_NAMES:
- accumulated
- asMs
- executionElapsedMs
- finiteAt
- formatDuration
- freezeExecutionClock
- iso
- recoverExecutionTimers
- restRemainingSeconds
- resumeExecutionClock
EXPORTED_BINDINGS:
DATA_ATTRIBUTES:
SEMANTIC_LINES:
- L2: function finiteAt(value=Date.now()){const n=value instanceof Date?value.getTime():Number(value);if(!Number.isFinite(n)||n<0)throw new Error('M26_TIMER_AT_INVALID');return n;}
- L6: export function executionElapsedMs(execution,at=Date.now()){
- L7: const base=accumulated(execution?.accumulatedActiveMs);
- L8: if(execution?.status!=='active'||!execution?.activeSince)return base;
- L9: const start=asMs(execution.activeSince);if(start===null)return base;
- L12: export function freezeExecutionClock(execution,at=Date.now()){
- L13: if(!execution||typeof execution!=='object')throw new Error('M26_EXECUTION_REQUIRED');
- L14: execution.accumulatedActiveMs=executionElapsedMs(execution,at);execution.activeSince=null;return execution;
- L16: export function resumeExecutionClock(execution,at=Date.now()){
- L17: if(!execution||typeof execution!=='object')throw new Error('M26_EXECUTION_REQUIRED');
- L18: execution.accumulatedActiveMs=accumulated(execution.accumulatedActiveMs);
- L19: if(asMs(execution.activeSince)===null)execution.activeSince=iso(at);
- L20: return execution;
- L22: export function restRemainingSeconds(execution,at=Date.now()){
- L23: const until=asMs(execution?.restUntil);if(until===null)return 0;
- L26: export function recoverExecutionTimers(execution,at=Date.now()){
- L27: if(!execution||typeof execution!=='object')throw new Error('M26_EXECUTION_REQUIRED');
- L28: const current=finiteAt(at);execution.accumulatedActiveMs=accumulated(execution.accumulatedActiveMs);
- L29: const rest=asMs(execution.restUntil);if(rest===null||rest<=current)execution.restUntil=null;else execution.restUntil=iso(rest);
- L30: if(execution.status==='active'){
- L31: if(asMs(execution.activeSince)===null)execution.activeSince=iso(current);
- L32: else execution.activeSince=iso(asMs(execution.activeSince));
- L33: }else execution.activeSince=null;
- L34: execution.recoveredAt=iso(current);return execution;
- L36: export function formatDuration(ms){const total=Math.max(0,Math.floor(accumulated(ms)/1000));const minutes=Math.floor(total/60);const seconds=total%60;return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;}

### src/m26/app/application.js
EXISTS=YES
BYTES=47790
SHA256=8bc0e1f2b9768917a6a6af14ae6d1e4908c090c6ef61dd4b51a4c9d4116d708a
FUNCTIONS=54
EXPORTED_BINDINGS=1
DATA_ATTRIBUTES=5
FUNCTION_NAMES:
- authMessage
- clearSessionDraft
- confirmedAppointmentForSession
- consumePendingIriExternalReportIntent
- createM26Application
- currentToken
- destroy
- destroyControllers
- diagnosticCode
- draftOnline
- escapeText
- exitSessionWorkspace
- fetchCatalog
- friendlyError
- guardSessionNavigation
- hydrate
- invalidRecoverySession
- loadCurrentSessionTemplate
- loadSessionDraft
- login
- mount
- nextExpiry
- normalizePublishedSession
- onAuthClick
- onInspectOperation
- onLogout
- onOpenBuilder
- onOpenBuilderEvent
- onStartSession
- onStartSessionEvent
- onSubmit
- onSwitchRole
- publishedSessionForClient
- qaStage
- recoveryNetworkError
- recoveryPasswordError
- recoveryRedirectForRuntime
- recoveryRequestConfirmation
- refreshSessionIfNeeded
- render
- renderRoute
- replaceAppLocation
- reportDiagnostic
- requestRecovery
- restoreExecution
- resume
- safeAppPath
- safeTime
- sanitizePendingIriExternalReportIntent
- saveCurrentSessionTemplate
- saveSessionDraft
- setupAuthenticated
- surfaceWorkspaceError
- updateRecoveredPassword
EXPORTED_BINDINGS:
- __applicationInternals
DATA_ATTRIBUTES:
- data-auth-action
- data-auth-form
- data-m26-area
- data-m26-role
- data-workflow-status
SEMANTIC_LINES:
- L10: import {actorCanExecuteSession,sessionRequiresConfirmedAppointment} from '../rc39/session-policy.js';
- L15: import {validatedRuntimeRegistry,M26_COMMAND_REGISTRY} from '../command-catalog.js';
- L16: import {createKeyValueOperationRepository} from '../platform/offline-command-repository.js';
- L17: import {createTelemetryDurableOutbox} from '../telemetry/durable-outbox.js';
- L18: import {createTelemetryRemoteSync} from '../telemetry/remote-sync.js';
- L22: import {createWearableController} from '../wearables/controller.js';
- L23: import {createVerificationController,refreshVerificationState} from '../engagement/conflict-center.js';
- L32: import {createSessionVault,sessionExpiresSoon} from './session-vault.js';
- L34: import {inspectPasswordRecoveryHash,recoveryUrlWithoutFragment} from './password-recovery.js';
- L35: import {loadExerciseCatalog} from '../exercises/catalog.js';
- L36: import {createSessionDraft} from '../workflows/session-builder.js';
- L37: import {createReusableSessionDraft,createSessionTemplateRepository,createDraftFromSessionTemplate} from '../productivity/session-reuse.js';
- L38: import {createExecution} from '../workflows/session-execution.js';
- L39: import {renderSessionBuilder,renderGuidedExecution} from '../workflows/session-ui.js';
- L41: import {createSessionController} from '../workflows/session-controller.js';
- L43: import {createExecutionRecoveryStore,createExecutionRecoveryCoordinator} from '../workflows/session-recovery.js';
- L44: import {registerM26ServiceWorker,createConnectivitySync} from '../platform/pwa.js';
- L45: import {loadExerciseMediaMap} from '../library/exercise-media.js';
- L55: const SESSION_DRAFT_SCOPE='session-builder';
- L65: function normalizePublishedSession(record){
- L70: function nextExpiry(session){return sessionExpiresSoon(session);}
- L72: const PUBLISHED_SESSION_STATES=new Set(['published','publicado','active','activo','enabled','habilitado']);
- L76: function publishedSessionForClient(records=[],clientId){return records.map(normalizePublishedSession).filter((item)=>item.id&&item.clientId===clientId&&item.blocks.length&&PUBLISHED_SESSION_STATES.has(String(item.status||'').trim().toLowerC ...
- L77: function confirmedAppointmentForSession(records=[],session,now=Date.now(),{earlyWindowMs=APPOINTMENT_EARLY_WINDOW_MS,lateWindowMs=APPOINTMENT_LATE_WINDOW_MS}={}){
- L78: const at=Number(now);if(!Number.isFinite(at)||!session?.id||!session?.clientId)return null;
- L81: const matching=records.filter((item)=>(item.clientId||item.client_id)===session.clientId&&CONFIRMED_APPOINTMENT_STATES.has(String(item.status||item.estado||'').trim().toLowerCase())&&inWindow(item));
- L82: const linked=matching.filter((item)=>String(item.sessionId||item.session_id||'')===String(session.id));
- L83: const candidates=linked.length?linked:matching.filter((item)=>!String(item.sessionId||item.session_id||''));
- L88: if(/AUTH|SESSION_EXPIRED|401|403/.test(code))return 'La sesión perdió autorización. Vuelve a entrar.';
- L132: const RECOVERY_REQUEST_CONFIRMATION='Si el correo corresponde a una cuenta QA autorizada, recibirás un enlace para crear una contraseña nueva.';
- L133: const RECOVERY_REQUEST_CONFIRMATION_PUBLIC='Si el correo corresponde a una cuenta IBERFIT, recibirás un enlace para crear una contraseña nueva.';
- L134: const RECOVERY_LINK_INVALID='El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.';
- L135: function recoveryRequestConfirmation(runtime){
- L137: ?RECOVERY_REQUEST_CONFIRMATION
- L138: :RECOVERY_REQUEST_CONFIRMATION_PUBLIC;
- L140: function recoveryRedirectForRuntime(runtime,locationLike=globalThis.location){
- L145: if(host&&host!=='m26-canary.iberfit.cl')throw new Error('M26_RECOVERY_REDIRECT_INVALID');
- L155: if(!['http:','https:'].includes(protocol))throw new Error('M26_RECOVERY_REDIRECT_INVALID');
- L157: if(rawPort&&!/^\d{1,5}$/u.test(rawPort))throw new Error('M26_RECOVERY_REDIRECT_INVALID');
- L163: throw new Error('M26_RECOVERY_REDIRECT_INVALID');
- L165: function recoveryNetworkError(error){
- L170: function recoveryPasswordError(error){
- L174: return RECOVERY_LINK_INVALID;
- L176: function invalidRecoverySession(error){
- L178: return error?.status===401||error?.status===403||/RECOVERY_(?:TOKEN|SESSION|USER|UPDATE|IDENTITY)|QA_ACCOUNT_REQUIRED|JWT|expired/i.test(code);
- L181: export async function createM26Application({root=document.querySelector('#app'),runtimeConfig=globalThis.__IBERFIT_M26_RUNTIME__||{},locationLike=globalThis.location,historyLike=globalThis.history}={}){
- L183: const runtime=resolveM26Runtime(runtimeConfig,locationLike);const vault=createSessionVault();
- L188: let transport=null,session=null,store=createCanonicalStore(),catalog=null,mediaMap=null,shell=null,productivity=null,motion=null,guidance=null,onboarding=null,mediaExperience=null,workflow=null,engagement=null,wearables=null,verification=nu ...
- L189: let pendingIriExternalReportIntent=parseIriExternalReportIntent(locationLike);
- L201: function currentToken(){return session?.token||null;}
- L202: async function refreshSessionIfNeeded(){
- L203: if(!session||!nextExpiry(session))return session;
- L205: if(!session.refreshToken)throw new Error('M26_SESSION_EXPIRED');
- L206: const currentUserId=session.user.id;refreshInFlight=transport.refresh(session.refreshToken).then((next)=>{if(next.user.id!==currentUserId)throw new Error('M26_REFRESH_IDENTITY_MISMATCH');session=next;vault.save(session);return session;}).fi ...
- L209: async function fetchCatalog(){
- L211: if(!catalog)catalog=await loadExerciseCatalog('/baseline_m25_2/exercise-catalog-m25.json');
- L214: try{mediaMap=await loadExerciseMediaMap();}
- L221: async function hydrate({reason='bootstrap'}={}){
- L223: await refreshSessionIfNeeded();
- L224: store.setHydration('loading');
- L226: const [snapshot,installed,extensions,contextExtension,backendV43,wearableV44]=await Promise.all([
- L232: transport.wearableBootstrap(currentToken()),
- L235: const runtimeRegistry=validatedRuntimeRegistry(installed);
- L236: if(!runtimeRegistry.base.ok)throw new Error(`M26_REMOTE_BASE_REGISTRY_INVALID:${runtimeRegistry.base.missing.join(',')}`);
- L251: const enriched={...scopedSnapshot,user:{...(scopedSnapshot.user||{}),role:activeRole,authorizedRoles,roleChoiceConfirmed:Boolean(activeApplicationRole)},data:{...(scopedSnapshot.data||{}),appointments,wearableConnections:wearableV44.connect ...
- L256: return {snapshot:enriched,installed,runtimeRegistry};
- L264: sessionUi?.draft?.clientId||
- L265: sessionUi?.execution?.clientId||
- L266: sessionUi?.session?.clientId||
- L294: if(sessionUi?.draft)return renderSessionBuilder({
- L295: draft:sessionUi.draft,
- L297: query:sessionUi.query,
- L298: templates:sessionUi.templates||[],
- L299: actionState:sessionUi.actionState,
- L305: if(sessionUi?.execution)return renderGuidedExecution({
- L306: execution:sessionUi.execution,
- L307: session:sessionUi.session,
- L309: actionState:sessionUi.actionState,
- L323: function saveCurrentSessionTemplate(name){if(!sessionUi?.draft||!sessionTemplateRepository)throw new Error('M26_SESSION_TEMPLATE_REPOSITORY_REQUIRED');const saved=sessionTemplateRepository.save(name,sessionUi.draft);sessionUi.templates=sess ...
- L324: function loadCurrentSessionTemplate(templateId){if(!sessionUi?.draft||!sessionTemplateRepository)throw new Error('M26_SESSION_TEMPLATE_REPOSITORY_REQUIRED');const template=sessionTemplateRepository.get(templateId);if(!template)throw new Err ...

### src/m26/app/workflow-controller.js
EXISTS=YES
BYTES=65137
SHA256=b8cd847ba19a3ceef68e1a37ead92da41f6fd66d2be067871fbeed7df961c880
FUNCTIONS=87
EXPORTED_BINDINGS=0
DATA_ATTRIBUTES=33
FUNCTION_NAMES:
- approveReport
- assertIriRawRanges
- clearAllStatuses
- clearControlValidation
- clearStatus
- clientEmail
- clientFilterState
- clientName
- clientRecordId
- completeIri
- computed
- confirmAppointment
- context
- controlIriTimer
- createAppointment
- createClient
- createWorkflowController
- currentIriRecord
- emit
- ensureValidForm
- escape
- executeWorkflowAction
- filterLibraryItems
- findPublicationRecord
- focusInvalidControl
- focusIriValidationError
- foldSearch
- friendlyError
- generateIntelligence
- generateIriReport
- initializeIriForm
- initializeOnboardingForm
- invalidFormControls
- invalidNumericFields
- iriDraft
- iriRaw
- iriReportStatusScope
- jumpIri
- libraryCards
- libraryFilterState
- managePublication
- moveIri
- normalizedStatus
- onboardingRaw
- onChange
- onClick
- onInput
- onPageHide
- onSubmit
- openBuilder
- paintIriTimer
- paintStatus
- populateForm
- publicationMessage
- publicationScope
- queueIriSave
- queueOnboardingSave
- queueScan
- recordBody
- recordClientId
- recordId
- refreshAndFind
- reportContext
- requireCoach
- requireVisibleClient
- restoreStatuses
- reuseSession
- saveIriDraft
- saveOnboardingDraft
- scanRouteForms
- setIriStep
- showStepValidation
- signalIriTimer
- startSession
- status
- statusStore
- stopIriTimer
- syncAppointmentFormState
- syncIriConditionalFields
- syncIriSkippedGroup
- syncOnboardingFormState
- updateClientList
- updateLibrary
- validatePlan
- values
- wait
- withTimeout
EXPORTED_BINDINGS:
DATA_ATTRIBUTES:
- data-client-clear
- data-client-filter
- data-client-grid
- data-client-iri
- data-client-modality
- data-client-search
- data-client-search-status
- data-client-sort
- data-client-stage
- data-client-text
- data-intelligence-preview
- data-iri-comparability
- data-iri-computed
- data-iri-norm
- data-iri-progress
- data-iri-protocol
- data-iri-register-target
- data-iri-step
- data-iri-step-jump
- data-iri-step-validation
- data-iri-timer
- data-iri-timer-action
- data-library-clear
- data-library-filter
- data-library-grid
- data-library-search
- data-library-status
- data-publication-card
- data-publication-preview
- data-publication-reason
- data-workflow-action
- data-workflow-form
- data-workflow-status
SEMANTIC_LINES:
- L5: import {generateSessionProposal} from '../intelligence/session-engine.js';
- L15: legacyClientDraftPayload,createdClientResultId,clientDraftEmail,
- L18: IRI_FIRST_SESSION_STEPS,
- L19: buildIriCommandDraftFromFirstSession,
- L20: confirmedFirstSessionDraft,
- L21: firstSessionCompletion,
- L22: flattenFirstSessionDraft,
- L23: normalizeFirstSessionDraft,
- L24: validateFirstSessionDraft,
- L25: validateFirstSessionStep,
- L26: } from '../workflows/iri-first-session.js';
- L28: openIriReportPrint,
- L29: prepareIriReportPrintTarget,
- L37: const IRI_DRAFT_SCOPE='iri-first-session';
- L38: const PUBLISHED_SESSION_STATES=new Set(['published','publicado','active','activo','enabled','habilitado']);
- L40: assessmentDate:'fecha de evaluación',birthDate:'fecha de nacimiento',sexForNorms:'sexo para baremos',email:'correo electrónico',phone:'teléfono',modality:'modalidad',trainingAddress:'dirección de entrenamiento',primaryObjective:'objetivo pr ...
- L43: bodyCompositionMeasurement:'weightKg',ankleTrials:'ankleLeft1',posteriorTrials:'posteriorLeft1',hipRotationResult:'hipRotationResult',squatDepth:'squatDepth',chairStand30s:'chairStand30s',pushTest:'pushVariant',trxRow:'trxRowRepetitions',fr ...
- L46: name:'nombre completo',email:'correo electrónico',phone:'teléfono',birthDate:'fecha de nacimiento',sexForNorms:'sexo para baremos',modality:'modalidad',weeklyFrequency:'frecuencia semanal',sessionDurationMinutes:'duración habitual',primaryO ...
- L60: function paintStatus(root,scope,entry){const node=root?.querySelector?.(`[data-workflow-status="${scope}"]`);if(!node||!entry)return false;const message=String(entry.message||'');const kind=String(entry.kind||'info');if(node.textContent!==m ...
- L61: function status(root,scope,message,kind='info'){const entry={message:String(message||''),kind:String(kind||'info')};statusStore(root).set(scope,entry);paintStatus(root,scope,entry);}
- L64: function restoreStatuses(root){for(const [scope,entry] of statusStore(root))paintStatus(root,scope,entry);}
- L66: async function withTimeout(promise,ms=20_000,code='M26_WORKFLOW_TIMEOUT'){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(code)),ms);})]);}finally{clearTimeout(timer);}}
- L85: if(/CLIENT_ONBOARDING_BACKEND_REQUIRED/.test(code))return 'La actualización segura del alta todavía no está instalada en el backend. El borrador permanece guardado y no se ha creado ningún expediente.';
- L86: if(/CLIENT_ONBOARDING_BACKEND_NOT_READY/.test(code))return 'El backend de altas no superó su comprobación de seguridad. El borrador permanece guardado y no se enviaron datos.';
- L87: if(/V12_CLIENT_EMAIL_AMBIGUOUS/.test(code))return 'Existen varios registros remotos con ese correo. No se creó otro expediente; el borrador queda guardado para resolver la duplicidad.';
- L89: if(/V12_CLIENT_ROW_NOT_CREATED/.test(code))return 'El servicio histórico no creó una fila de cliente. El borrador queda guardado y no se mostrará un éxito falso.';
- L90: if(/V12_CLIENT_ASSIGNMENT_NOT_CREATED|V12_CLIENT_NOT_VISIBLE_AFTER_ASSIGNMENT/.test(code))return 'El expediente no quedó asignado y visible para este entrenador. La operación se revirtió y el borrador permanece guardado.';
- L93: if(/CLIENT_CREATE_NOT_PERSISTED/.test(code))return 'El servidor no hizo visible el expediente después de verificar la creación. El borrador queda guardado; no pulses crear otra vez hasta revisar la evidencia técnica.';
- L98: if(/IRI_REPORT_REQUIRES_CONFIRMATION/.test(code))return 'Confirma primero la evaluación IRI. Los informes solo se generan desde datos ya guardados en el expediente.';
- L100: if(/PLAN_CONFIRM_NOT_PERSISTED/.test(code))return 'El ciclo no apareció guardado en Planificación. El borrador local se conserva.';
- L102: if(/IRI_FIRST_SESSION_INVALID|FORM_INVALID/.test(code))return 'La primera sesión contiene datos pendientes o incoherentes. Revisa la etapa marcada.';
- L104: if(/SESSION_INPUT_REQUIRED/.test(code))return 'Faltan datos de la propuesta. Revisa objetivo, duración, experiencia y modalidad.';
- L105: if(/SESSION_NOT_ENOUGH_SAFE_EXERCISES/.test(code))return 'No hay suficientes ejercicios compatibles con el material y las restricciones actuales.';
- L112: export function syncIriSkippedGroup(form,{toggleName,fieldNames=[],reasonName}={}){
- L117: if(field.dataset&&field.dataset.iriRequiredBeforeSkip===undefined)field.dataset.iriRequiredBeforeSkip=field.required?'true':'false';
- L121: else if(field.dataset?.iriRequiredBeforeSkip==='true'){field.required=true;field.setAttribute?.('required','');}
- L133: export function syncAppointmentFormState(form,root=form?.ownerDocument||null){
- L157: ?trainingAddress?'Se ha propuesto la dirección habitual del expediente. Revísala antes de guardar.':'La ubicación es obligatoria para citas presenciales. Registra también la dirección habitual en el expediente.'
- L165: getRegistry=()=>[],onRender=()=>{},refreshState=async()=>{},getIriExternalReport=async()=>null,isOnline=()=>globalThis.navigator?.onLine!==false,
- L168: let mounted=false,observer=null,scanQueued=false,iriSaveTimer=null,onboardingSaveTimer=null,iriTimer=null;
- L198: function currentIriRecord(form=null){
- L205: async function refreshAndFind(collection,id,clientId,{attempts=3}={}){
- L223: function assertIriRawRanges(form){const invalid=invalidNumericFields(form);if(invalid.length){const first=form.elements?.namedItem?.(invalid[0]);first?.focus?.();throw new Error(`M26_IRI_RANGE_INVALID:${invalid.join(',')}`);}}
- L224: function iriRaw(form){
- L235: function iriDraft(form){const {clientId}=context();requireVisibleClient(clientId);return normalizeFirstSessionDraft(iriRaw(form),currentIriRecord(form),clientId);}
- L244: syncIriConditionalFields(form);
- L245: const raw=iriRaw(form);const weight=Number(raw.weightKg),height=Number(raw.heightCm);const bmi=Number.isFinite(weight)&&Number.isFinite(height)&&height>0?weight/((height/100)**2):null;
- L251: const completion=normalized?firstSessionCompletion(normalized):{percent:0,steps:[]};
- L254: const normSpecs=[['chairStand30s','chair_stand_30s','chair_stand_30s_standard'],['pushUps','push_up_standard','standard_max_valid_reps']];
- L257: if(comparability&&normalized){const previous=recordBody(currentIriRecord(form))?.protocolRecords||[];const warnings=protocolComparabilityWarnings(previous,normalized.protocolRecords||[]);comparability.textContent=warnings.length?warnings.jo ...
- L259: stepButtons.forEach((button,index)=>button.classList?.toggle?.('is-complete',Boolean(completion.steps?.[index]?.complete)));
- L261: function syncIriConditionalFields(form){
- L263: const bodySkipped=syncIriSkippedGroup(form,{toggleName:'bodyCompositionSkipped',fieldNames:['weightKg','heightCm','bodyFatPercent','leanMassKg','muscleMassKg','bodyWaterPercent','waistCm','visceralFatLevel','bodyCompositionMethod','bodyComp ...
- L264: const mobilitySkipped=syncIriSkippedGroup(form,{toggleName:'mobilitySkipped',fieldNames:['ankleLeft1','ankleLeft2','ankleLeft3','ankleRight1','ankleRight2','ankleRight3','posteriorLeft1','posteriorLeft2','posteriorLeft3','posteriorRight1',' ...
- L265: const strengthSkipped=syncIriSkippedGroup(form,{toggleName:'strengthSkipped',fieldNames:['chairStand30s','chairHeightCm','chairStandValid','chairStandNotes','pushVariant','pushUps','pushSupportHeightCm','pushValid','pushNotes','trxRowRepeti ...
- L266: const cardioSkipped=syncIriSkippedGroup(form,{toggleName:'cardioSkipped',fieldNames:['cardioProtocol','stepHeightCm','cadenceBpm','cardioDurationSeconds','restingHr','stepFinalHr','stepOneMinuteHr','twoMinuteHr','cardioRpe','cardioValid','c ...
- L267: for(const button of form.querySelectorAll?.('[data-iri-timer-action]')||[]){button.disabled=cardioSkipped;button.setAttribute?.('aria-disabled',cardioSkipped?'true':'false');}
- L268: if(cardioSkipped&&iriTimer?.form===form)stopIriTimer();
- L279: function stopIriTimer(){if(iriTimer?.interval)clearInterval(iriTimer.interval);iriTimer=null;}
- L280: function paintIriTimer(form,remaining){const node=form?.querySelector?.('[data-iri-timer="cardio"] strong');if(!node)return;const safe=Math.max(0,Math.round(Number(remaining)||0));node.textContent=`${String(Math.floor(safe/60)).padStart(2,' ...
- L281: function signalIriTimer(frequency=880,durationMs=160){
- L286: if(audio.state==='suspended'&&typeof audio.resume==='function')Promise.resolve(audio.resume()).then(play).catch(()=>audio.close?.());else play();
- L290: function controlIriTimer(form,action){
- L292: if(action==='reset'){stopIriTimer();const duration=Math.min(180,Math.max(30,Number(form.elements?.namedItem?.('cardioDurationSeconds')?.value)||180));paintIriTimer(form,duration);status(root,'iri','Temporizador reiniciado.','info');return;}
- L293: if(action==='pause'){if(iriTimer?.form===form&&iriTimer.interval){clearInterval(iriTimer.interval);iriTimer.interval=null;status(root,'iri','Temporizador en pausa.','pending');}return;}
- L295: if(iriTimer?.form===form&&iriTimer.interval)return;
- L296: const initial=iriTimer?.form===form?iriTimer.remaining:Math.min(180,Math.max(30,Number(form.elements?.namedItem?.('cardioDurationSeconds')?.value)||180));
- L297: stopIriTimer();iriTimer={form,remaining:initial,interval:null};paintIriTimer(form,initial);const audioReady=signalIriTimer(520,140);status(root,'iri',audioReady?'Prueba en curso. Sonido de inicio activado; habrá avisos a 3, 2, 1 y final.':' ...
- L298: iriTimer.interval=setInterval(()=>{if(!form.isConnected){stopIriTimer();return;}iriTimer.remaining=Math.max(0,iriTimer.remaining-1);paintIriTimer(form,iriTimer.remaining);if([3,2,1].includes(iriTimer.remaining))signalIriTimer(660,110);if(ir ...
- L302: const bounded=Math.max(0,Math.min(IRI_FIRST_SESSION_STEPS.length-1,Number(index)||0));form.dataset.iriStepIndex=String(bounded);
- L305: const progress=form.querySelector?.('[data-iri-progress]');if(progress)progress.style.width=`${Math.round(((bounded+1)/IRI_FIRST_SESSION_STEPS.length)*1000)/10}%`;
- L307: const next=form.querySelector?.('[data-workflow-action="iri-next"]');if(next)next.hidden=bounded===IRI_FIRST_SESSION_STEPS.length-1;
- L308: const complete=form.querySelector?.('[data-workflow-action="complete-iri"]');if(complete)complete.hidden=bounded!==IRI_FIRST_SESSION_STEPS.length-1;
- L319: async function saveIriDraft({silent=false}={}){
- L320: requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');assertIriRawRanges(form);const draft=iriDraft(form);const {clientId}=context();
- L321: await draftRepository?.save?.(clientId,IRI_DRAFT_SCOPE,draft);computed(form,draft);if(!silent)status(root,'iri','Borrador guardado en este dispositivo.','success');return draft;
- L323: function queueIriSave(){clearTimeout(iriSaveTimer);iriSaveTimer=setTimeout(()=>{void saveIriDraft({silent:true}).catch(()=>{});},650);}
- L325: async function saveOnboardingDraft(form,{silent=true}={}){
- L327: if(!silent)status(root,'client-onboarding','Borrador del expediente guardado en este dispositivo.','success');return raw;
- L329: function queueOnboardingSave(form){clearTimeout(onboardingSaveTimer);onboardingSaveTimer=setTimeout(()=>{void saveOnboardingDraft(form).catch(()=>{});},350);}

### src/m26/shell/route-guard.js
EXISTS=YES
BYTES=1848
SHA256=7902a8d3da1c817c0def492059669b9264e72dd1b39d5608a476b6c78518ca03
FUNCTIONS=4
EXPORTED_BINDINGS=0
DATA_ATTRIBUTES=0
FUNCTION_NAMES:
- canAccessArea
- guardClientSelection
- resolveM26Route
- result
EXPORTED_BINDINGS:
DATA_ATTRIBUTES:
SEMANTIC_LINES:
- L10: return result('acceso', false, 'M26_SESSION_REQUIRED');
- L47: export function guardClientSelection(state, clientId) {

### src/m26/shell/shell-controller.js
EXISTS=YES
BYTES=7588
SHA256=346b6e42c2c0cba14c558a270c82bf4b2c63931534ab833062bb6c661b3999fa
FUNCTIONS=10
EXPORTED_BINDINGS=0
DATA_ATTRIBUTES=8
FUNCTION_NAMES:
- createShellController
- destroy
- focusMain
- mount
- onChange
- onClick
- renderNow
- resolveAdaptiveLayout
- scheduleRender
- syncAdaptiveLayout
EXPORTED_BINDINGS:
DATA_ATTRIBUTES:
- data-m26-action
- data-m26-area
- data-m26-client-select
- data-m26-expediente
- data-m26-expediente-tab
- data-m26-language
- data-m26-select-client
- data-m26-switch-role
SEMANTIC_LINES:
- L1: import { guardClientSelection, resolveM26Route } from './route-guard.js';
- L34: if (!store?.getState || !store?.subscribe || !store?.navigate || !store?.selectClient) {
- L45: function syncAdaptiveLayout(){
- L90: syncAdaptiveLayout();
- L116: ['resumen','contexto','perfil','plan'].includes(view)
- L149: const clientId = guardClientSelection(store.getState(), clientButton.getAttribute('data-m26-select-client'));
- L151: store.navigate('expediente');
- L163: store.navigate(decision.area);
- L212: if(typeof globalThis.location?.reload==='function'){
- L213: globalThis.location.reload();
- L227: const clientId = guardClientSelection(store.getState(), selector.value);
- L254: syncAdaptiveLayout,
- L260: syncAdaptiveLayout,
- L266: syncAdaptiveLayout();
- L280: syncAdaptiveLayout
- L285: syncAdaptiveLayout

### src/m26/intelligence/live-session-intelligence.js
EXISTS=YES
BYTES=11716
SHA256=f4e280f3dd44f137eb1946a097492d7a7f89b50e46671f9928815212e1a07613
FUNCTIONS=16
EXPORTED_BINDINGS=4
DATA_ATTRIBUTES=0
FUNCTION_NAMES:
- boundedPoints
- deepFreeze
- deriveLiveSessionIntelligence
- eventHeartRate
- finite
- groupedWorkResponses
- isCanonicalHeartRateEvent
- isInterpretableEvent
- qualitySummary
- recoverySummaries
- restSegments
- round1
- safeTime
- setCorrelations
- sortedEvents
- stats
EXPORTED_BINDINGS:
- __liveSessionIntelligenceInternals
- LIVE_SESSION_INTELLIGENCE_SCHEMA_VERSION
- LIVE_SESSION_RECOVERY_WINDOW_MS
- LIVE_SESSION_TIMELINE_MAX_POINTS
DATA_ATTRIBUTES:
SEMANTIC_LINES:
- L1: export const LIVE_SESSION_INTELLIGENCE_SCHEMA_VERSION=
- L2: 'iberfit.live-session-intelligence.v1';
- L4: export const LIVE_SESSION_RECOVERY_WINDOW_MS=60*1000;
- L5: export const LIVE_SESSION_TIMELINE_MAX_POINTS=72;
- L7: const CANONICAL_SCHEMA='iberfit.telemetry.v1';
- L34: function eventHeartRate(event){
- L35: return finite(event?.raw?.heartRateBpm);
- L37: function isCanonicalHeartRateEvent(event){
- L41: event.eventType==='heart_rate_sample'&&
- L42: eventHeartRate(event)!==null&&
- L47: if(!isCanonicalHeartRateEvent(event))return false;
- L51: function sortedEvents(execution){
- L52: const events=Array.isArray(execution?.liveTelemetry?.timeline?.events)
- L53: ?execution.liveTelemetry.timeline.events
- L56: .filter(isCanonicalHeartRateEvent)
- L64: .map(eventHeartRate)
- L97: :LIVE_SESSION_TIMELINE_MAX_POINTS
- L117: bpm:round1(eventHeartRate(event)),
- L154: function restSegments(events,recoveryWindowMs){
- L155: const rest=events.filter((event)=>event?.context?.phase==='rest');
- L158: for(const event of rest){
- L173: gap>recoveryWindowMs+30000
- L190: function recoverySummaries(events,recoveryWindowMs){
- L191: return restSegments(events,recoveryWindowMs)
- L197: return at!==null&&startAt!==null&&at<=startAt+recoveryWindowMs;
- L201: const startBpm=eventHeartRate(first);
- L202: const latestBpm=eventHeartRate(latest);
- L203: const elapsedSeconds=
- L207: const available=within.length>=2&&elapsedSeconds>0;
- L223: elapsedSeconds,
- L233: method:'first_rest_sample_minus_latest_within_60s',
- L240: function setCorrelations(execution,events){
- L241: const results=Object.values(execution?.results||{})
- L244: (safeTime(a.completedAt)||0)-(safeTime(b.completedAt)||0)
- L255: completedAt:result.completedAt||null,
- L256: rpe:finite(result.rpe),
- L257: rir:result.rir===null||result.rir===undefined
- L259: :finite(result.rir),
- L260: heartRate:stats(matching),
- L284: export function deriveLiveSessionIntelligence(
- L285: execution,
- L287: maxTimelinePoints=LIVE_SESSION_TIMELINE_MAX_POINTS,
- L288: recoveryWindowMs=LIVE_SESSION_RECOVERY_WINDOW_MS,
- L291: const rawEvents=sortedEvents(execution);
- L295: const recoveries=recoverySummaries(
- L301: Number(recoveryWindowMs)||LIVE_SESSION_RECOVERY_WINDOW_MS
- L305: const correlations=setCorrelations(execution,interpretable);
- L307: const live=execution?.liveTelemetry||{};
- L310: schemaVersion:LIVE_SESSION_INTELLIGENCE_SCHEMA_VERSION,
- L311: available:Boolean(rawEvents.length||live.heartRateBpm!==null),
- L314: currentHeartRateBpm:
- L316: round1(live.heartRateBpm),
- L317: averageHeartRateBpm:
- L319: round1(live.averageHeartRateBpm),
- L320: maxHeartRateBpm:
- L322: round1(live.maxHeartRateBpm),
- L323: minHeartRateBpm:
- L325: round1(live.minHeartRateBpm),
- L347: recoveryDuringRest:recoveries,
- L348: latestRecovery:recoveries.at(-1)||null,
- L352: heartRate:
- L356: recovery:
- L358: rpeRirCorrelation:
- L370: export const __liveSessionIntelligenceInternals=deepFreeze({
- L371: isCanonicalHeartRateEvent,
- L376: recoverySummaries,

## Policy

- Active source/configuration is canonical and may be preserved.
- Root RCxx snapshots, CSV diagnostics and SOURCE.txt exports are historical artifacts, not canonical source.
- Android .gradle and build outputs are reproducible and ignored.
- Sensitive-looking paths are never auto-staged.
- Session Live product logic is unchanged in this checkpoint.
- Next wave may mutate Session Live only after reading this map.
