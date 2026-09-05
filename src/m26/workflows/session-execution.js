import { freezeExecutionClock,resumeExecutionClock } from './session-timer.js';
import { createM26Id } from '../platform/id.js';
function clone(v){return structuredClone(v);}
function now(){return new Date().toISOString();}
function uid(){return createM26Id();}
function remoteSnapshot(execution){const out=clone(execution);delete out.syncStatus;delete out.pendingOperationIds;delete out.lastSyncError;delete out.recoveredAt;delete out.liveTelemetry;delete out.activeSetDraft;delete out.finalFeedbackDraft;return out;}
function findExercise(session, exerciseId){
  for(const block of session.blocks||[]){
    if(block.type==='exercise'&&block.exerciseId===exerciseId)return block;
    if(Array.isArray(block.exercises)){const x=block.exercises.find(e=>e.exerciseId===exerciseId);if(x)return x;}
  }
  return null;
}
export function createExecution({session,clientId,executionId=uid()}={}){
  if(!session?.id||!clientId)throw new Error('M26_EXECUTION_SESSION_CLIENT_REQUIRED');
  const queue=[];
  for(const block of session.blocks||[]){
    if(block.type==='exercise'){const sets=Number(block.sets||1),restSeconds=Number(block.restSeconds||60),targetRpe=Number(block.targetRpe||7),targetRir=Number(block.targetRir??3);if(!block.exerciseId||!Number.isInteger(sets)||sets<1||sets>100||!Number.isFinite(restSeconds)||restSeconds<1||restSeconds>3600||!Number.isFinite(targetRpe)||targetRpe<1||targetRpe>10||!Number.isFinite(targetRir)||targetRir<0||targetRir>10)throw new Error('M26_EXECUTION_BLOCK_INVALID');queue.push({blockId:block.id,exerciseId:block.exerciseId,sets,prescription:{reps:String(block.reps||'').trim().slice(0,40)||null,restSeconds,tempo:String(block.tempo||'').trim().slice(0,40)||null,targetRpe,targetRir,alternativeId:block.alternativeId||null}});}
    else {const sets=Number(block.rounds||1);if(!Number.isInteger(sets)||sets<1||sets>100)throw new Error('M26_EXECUTION_GROUP_INVALID');for(const exerciseId of block.exerciseIds||[]){if(!exerciseId)throw new Error('M26_EXECUTION_GROUP_INVALID');const planned=block.prescriptions?.[exerciseId]||{},restSeconds=Number(planned.restSeconds||60),targetRpe=Number(planned.targetRpe||7),targetRir=Number(planned.targetRir??3);if(!Number.isFinite(restSeconds)||restSeconds<1||restSeconds>3600||!Number.isFinite(targetRpe)||targetRpe<1||targetRpe>10||!Number.isFinite(targetRir)||targetRir<0||targetRir>10)throw new Error('M26_EXECUTION_GROUP_INVALID');queue.push({blockId:block.id,exerciseId,sets,prescription:{reps:String(planned.reps||'').trim().slice(0,40)||null,restSeconds,tempo:String(planned.tempo||'').trim().slice(0,40)||null,targetRpe,targetRir,alternativeId:planned.alternativeId||null}});}}
  }
  if(!queue.length)throw new Error('M26_EXECUTION_EMPTY_SESSION');
  return {id:executionId,sessionId:session.id,clientId,status:'ready',syncStatus:'clean',pendingOperationIds:[],lastSyncError:null,revision:0,queue,index:0,setIndex:0,startedAt:null,activeSince:null,accumulatedActiveMs:0,completedAt:null,restUntil:null,events:[],results:{},feedback:null};
}
export function currentStep(execution,session){
  const item=execution.queue[execution.index]; if(!item)return null;
  const exercise=findExercise(session,item.exerciseId);
  return {...item,setNumber:execution.setIndex+1,totalSets:item.sets,exercise,prescription:clone(item.prescription||{})};
}
function actorSnapshot(actor){
  const role=String(actor?.role||'').trim().toLowerCase()||null;
  const userId=String(actor?.userId||actor?.id||'').trim()||null;
  const clientId=String(actor?.clientId||'').trim()||null;
  return role||userId||clientId?{role,userId,clientId}:null;
}
function event(execution,type,payload={},actor=null){
  const provenance=actorSnapshot(actor);
  execution.events.push({id:uid(),type,at:now(),payload:clone(payload),...(provenance?{actor:provenance}:{})});
}
function requireReason(reason,code){
  const value=String(reason||'').trim().slice(0,500);
  if(!value)throw new Error(code);
  return value;
}
function requireCoachActor(actor){
  const role=String(actor?.role||'').trim().toLowerCase();
  if(!['coach','entrenador'].includes(role))throw new Error('M26_EXECUTION_COACH_ACTION_REQUIRED');
  return actor;
}
function resultKey(exerciseId,setNumber){return `${exerciseId}:${setNumber}`;}
function activeSetIdentity(execution,session){
  const step=currentStep(execution,session);if(!step)return null;
  return {executionId:execution.id,blockId:step.blockId||null,exerciseId:step.exerciseId,setNumber:step.setNumber};
}
function sameActiveSet(draft,identity){return Boolean(draft&&identity&&draft.executionId===identity.executionId&&draft.blockId===identity.blockId&&draft.exerciseId===identity.exerciseId&&Number(draft.setNumber)===Number(identity.setNumber));}
function draftValue(value,maxLength){return String(value??'').slice(0,maxLength);}
export function getActiveSetDraft(execution,session){
  const identity=activeSetIdentity(execution,session);
  if(!sameActiveSet(execution?.activeSetDraft,identity))return null;
  return clone(execution.activeSetDraft);
}
export function updateActiveSetDraft(execution,session,input={}){
  if(execution?.status!=='active')return null;
  const identity=activeSetIdentity(execution,session);if(!identity)return null;
  if(execution.results?.[resultKey(identity.exerciseId,identity.setNumber)]){delete execution.activeSetDraft;return null;}
  execution.activeSetDraft={...identity,values:{reps:draftValue(input.reps,32),seconds:draftValue(input.seconds,32),load:draftValue(input.load,80),rpe:draftValue(input.rpe,32),rir:draftValue(input.rir,32),notes:draftValue(input.notes,1000)},updatedAt:now()};
  return clone(execution.activeSetDraft);
}
export function clearActiveSetDraft(execution){if(execution)delete execution.activeSetDraft;return execution;}
export function getFinalFeedbackDraft(execution){
  const draft=execution?.finalFeedbackDraft;
  if(execution?.status!=='awaiting_feedback'||!draft||draft.executionId!==execution.id)return null;
  return clone(draft);
}
export function updateFinalFeedbackDraft(execution,input={}){
  if(execution?.status!=='awaiting_feedback')return null;
  execution.finalFeedbackDraft={
    executionId:execution.id,
    values:{
      sessionRpe:draftValue(input.sessionRpe,32),
      comment:draftValue(input.comment,2000),
      pain:Boolean(input.pain),
      painNotes:draftValue(input.painNotes,1000),
    },
    updatedAt:now(),
  };
  return clone(execution.finalFeedbackDraft);
}
export function clearFinalFeedbackDraft(execution){if(execution)delete execution.finalFeedbackDraft;return execution;}
function ensureDeviationStores(execution){
  if(!execution.skippedSets||typeof execution.skippedSets!=='object')execution.skippedSets={};
  if(!Array.isArray(execution.skippedExercises))execution.skippedExercises=[];
}
function validatedSetResult(step,input={},previous=null){
  const rawReps=input.reps??null,rawSeconds=input.seconds??null,load=input.load==null?null:String(input.load).trim().slice(0,80),rpe=Number(input.rpe),rir=input.rir==null||input.rir===''?null:Number(input.rir);
  if((rawReps==null||rawReps==='')&&(rawSeconds==null||rawSeconds===''))throw new Error('M26_EXECUTION_RESULT_REQUIRED');
  const reps=rawReps==null||rawReps===''?null:Number(rawReps),seconds=rawSeconds==null||rawSeconds===''?null:Number(rawSeconds);
  if(reps!==null&&(!Number.isFinite(reps)||reps<0||reps>10000))throw new Error('M26_EXECUTION_REPS_INVALID');
  if(seconds!==null&&(!Number.isFinite(seconds)||seconds<0||seconds>86400))throw new Error('M26_EXECUTION_SECONDS_INVALID');
  if(!Number.isFinite(rpe)||rpe<1||rpe>10)throw new Error('M26_EXECUTION_RPE_INVALID');
  if(rir!==null&&(!Number.isFinite(rir)||rir<0||rir>10))throw new Error('M26_EXECUTION_RIR_INVALID');
  const provenance=actorSnapshot(input.actor);
  return {
    exerciseId:step.exerciseId,
    setNumber:step.setNumber,
    reps,seconds,load,rpe,rir,
    notes:String(input.notes||'').trim().slice(0,1000),
    completedAt:previous?.completedAt||now(),
    ...(previous?{correctedAt:now()}:{ }),
    ...(provenance?{recordedBy:provenance}:{ }),
  };
}
function moveForward(execution,actor=null){
  const item=execution.queue[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  clearActiveSetDraft(execution);execution.restUntil=null;
  if(execution.setIndex+1<item.sets)execution.setIndex+=1;
  else{execution.index+=1;execution.setIndex=0;}
  event(execution,'STEP_ADVANCED',{index:execution.index,setIndex:execution.setIndex},actor);
  if(execution.index>=execution.queue.length){freezeExecutionClock(execution);execution.status='awaiting_feedback';}
  return execution;
}
export function markExecutionSync(execution,status,{operationId=null,errorCode=null}={}){
  if(!['clean','pending','conflict','rejected'].includes(status))throw new Error('M26_EXECUTION_SYNC_STATUS_INVALID');
  execution.syncStatus=status;execution.lastSyncError=errorCode||null;
  const ids=new Set(execution.pendingOperationIds||[]);if(operationId&&status==='pending')ids.add(operationId);if(operationId&&status!=='pending')ids.delete(operationId);execution.pendingOperationIds=[...ids];
  if(status==='clean'&&!operationId)execution.pendingOperationIds=[];
  return execution;
}
export function startExecution(execution,{actor=null}={}){
  if(execution.status!=='ready')throw new Error('M26_EXECUTION_NOT_READY');
  execution.status='active';execution.startedAt=now();execution.accumulatedActiveMs=Number(execution.accumulatedActiveMs||0);resumeExecutionClock(execution);
  event(execution,'SESSION_STARTED',{},actor);return execution;
}
export function pauseExecution(execution,{actor=null}={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_PAUSE_INVALID');
  freezeExecutionClock(execution);execution.status='paused';execution.restUntil=null;event(execution,'SESSION_PAUSED',{},actor);return execution;
}
export function resumeExecution(execution,{actor=null}={}){
  if(execution.status!=='paused')throw new Error('M26_EXECUTION_RESUME_INVALID');
  execution.status='active';resumeExecutionClock(execution);event(execution,'SESSION_RESUMED',{},actor);return execution;
}
export function cancelExecution(execution,reason,{actor=null}={}){
  if(!['ready','active','paused'].includes(execution.status))throw new Error('M26_EXECUTION_CANCEL_INVALID');
  const safeReason=requireReason(reason,'M26_EXECUTION_CANCEL_REASON_REQUIRED');
  clearActiveSetDraft(execution);clearFinalFeedbackDraft(execution);freezeExecutionClock(execution);execution.status='cancelled';execution.cancelledAt=now();execution.cancellationReason=safeReason;execution.restUntil=null;
  event(execution,'SESSION_CANCELLED',{reason:safeReason},actor);return execution;
}
export function recordSet(execution,session,input={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  const step=currentStep(execution,session);if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
  const key=resultKey(step.exerciseId,step.setNumber);
  if(execution.results[key])throw new Error('M26_EXECUTION_SET_ALREADY_RECORDED');
  const result=validatedSetResult(step,input);
  execution.results[key]=result;clearActiveSetDraft(execution);
  event(execution,'SET_COMPLETED',result,input.actor);
  return execution;
}
export function correctSet(execution,session,input={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  const step=currentStep(execution,session);if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
  const key=resultKey(step.exerciseId,step.setNumber);
  const previous=execution.results[key];
  if(!previous)throw new Error('M26_EXECUTION_SET_CORRECTION_TARGET_MISSING');
  const next=validatedSetResult(step,input,previous);
  execution.results[key]=next;
  event(execution,'SET_CORRECTED',{before:previous,after:next},input.actor);
  return execution;
}
export function beginRest(execution,seconds,{actor=null}={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  const raw=Number(seconds||0);if(!Number.isFinite(raw))throw new Error('M26_EXECUTION_REST_INVALID');
  const value=Math.max(0,Math.min(raw,3600));execution.restUntil=new Date(Date.now()+value*1000).toISOString();
  event(execution,'REST_STARTED',{seconds:value},actor);return execution;
}
export function adjustRest(execution,deltaSeconds,{actor=null}={}){
  if(!execution.restUntil)throw new Error('M26_EXECUTION_REST_NOT_ACTIVE');
  const current=new Date(execution.restUntil).getTime(),delta=Number(deltaSeconds||0);
  if(!Number.isFinite(current)||!Number.isFinite(delta))throw new Error('M26_EXECUTION_REST_INVALID');
  const next=Math.max(Date.now(),Math.min(Date.now()+3600000,current+delta*1000));execution.restUntil=new Date(next).toISOString();
  event(execution,'REST_ADJUSTED',{deltaSeconds:Number(deltaSeconds||0)},actor);return execution;
}
export function advanceExecution(execution,{actor=null}={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_ADVANCE_INVALID');
  const item=execution.queue[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  const key=resultKey(item.exerciseId,execution.setIndex+1);
  ensureDeviationStores(execution);
  if(!execution.results[key]&&!execution.skippedSets[key])throw new Error('M26_EXECUTION_SET_NOT_RECORDED');
  return moveForward(execution,actor);
}
export function retreatExecution(execution,{actor=null}={}){
  if(!['active','awaiting_feedback'].includes(execution.status))throw new Error('M26_EXECUTION_RETREAT_INVALID');
  if(execution.index===0&&execution.setIndex===0)return execution;
  clearActiveSetDraft(execution);execution.restUntil=null;
  if(execution.setIndex>0)execution.setIndex-=1;
  else{execution.index-=1;execution.setIndex=Math.max(0,execution.queue[execution.index].sets-1);}
  if(execution.status==='awaiting_feedback'){execution.status='active';resumeExecutionClock(execution);}
  event(execution,'STEP_REWOUND',{index:execution.index,setIndex:execution.setIndex},actor);return execution;
}
export function substituteExercise(execution,session,{fromExerciseId,toExerciseId,catalog,reason,actor=null}={}){
  const safeReason=requireReason(reason,'M26_EXECUTION_SUBSTITUTION_REASON_REQUIRED');
  if(!catalog?.has(toExerciseId))throw new Error('M26_EXECUTION_SUBSTITUTE_NOT_IN_CATALOG');
  if(toExerciseId===fromExerciseId)throw new Error('M26_EXECUTION_SUBSTITUTE_SAME');
  const itemIndex=execution.queue.findIndex((x,i)=>i>=execution.index&&x.exerciseId===fromExerciseId);
  if(itemIndex<0)throw new Error('M26_EXECUTION_SUBSTITUTE_TARGET_MISSING');
  const item=execution.queue[itemIndex];
  if(itemIndex===execution.index){
    const key=resultKey(item.exerciseId,execution.setIndex+1);
    if(execution.results[key])throw new Error('M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED');
    clearActiveSetDraft(execution);
  }
  item.exerciseId=toExerciseId;
  event(execution,'EXERCISE_SUBSTITUTED',{fromExerciseId,toExerciseId,reason:safeReason},actor);
  return execution;
}
export function addExecutionSet(execution,{actor=null}={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  requireCoachActor(actor);
  const item=execution.queue[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  if(item.sets>=100)throw new Error('M26_EXECUTION_SET_LIMIT');
  item.sets+=1;
  event(execution,'SET_ADDED',{exerciseId:item.exerciseId,totalSets:item.sets},actor);
  return execution;
}
export function skipExecutionSet(execution,session,{reason,actor=null}={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  const step=currentStep(execution,session);if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
  const safeReason=requireReason(reason,'M26_EXECUTION_SKIP_SET_REASON_REQUIRED');
  const key=resultKey(step.exerciseId,step.setNumber);
  if(execution.results[key])throw new Error('M26_EXECUTION_SKIP_RECORDED_SET_FORBIDDEN');
  ensureDeviationStores(execution);
  const entry={exerciseId:step.exerciseId,setNumber:step.setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor)};
  execution.skippedSets[key]=entry;
  event(execution,'SET_SKIPPED',entry,actor);
  return moveForward(execution,actor);
}
export function skipExecutionExercise(execution,session,{reason,actor=null}={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  const item=execution.queue[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  const safeReason=requireReason(reason,'M26_EXECUTION_SKIP_EXERCISE_REASON_REQUIRED');
  ensureDeviationStores(execution);
  const currentKey=resultKey(item.exerciseId,execution.setIndex+1);
  const firstIndex=execution.results[currentKey]?execution.setIndex+1:execution.setIndex;
  if(firstIndex>=item.sets)throw new Error('M26_EXECUTION_SKIP_EXERCISE_NOTHING_REMAINING');
  for(let i=firstIndex;i<item.sets;i+=1){
    const setNumber=i+1;
    const key=resultKey(item.exerciseId,setNumber);
    execution.skippedSets[key]={exerciseId:item.exerciseId,setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor),source:'exercise_skip'};
  }
  const deviation={exerciseId:item.exerciseId,fromSetNumber:firstIndex+1,toSetNumber:item.sets,reason:safeReason,at:now(),actor:actorSnapshot(actor)};
  execution.skippedExercises.push(deviation);
  event(execution,'EXERCISE_SKIPPED',deviation,actor);
  clearActiveSetDraft(execution);execution.restUntil=null;execution.index+=1;execution.setIndex=0;
  event(execution,'STEP_ADVANCED',{index:execution.index,setIndex:0},actor);
  if(execution.index>=execution.queue.length){freezeExecutionClock(execution);execution.status='awaiting_feedback';}
  return execution;
}
export function addExecutionExercise(execution,{exerciseId,catalog,sets,reps,restSeconds,tempo,targetRpe,targetRir,position='next',actor=null}={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  requireCoachActor(actor);
  if(!catalog?.has(exerciseId))throw new Error('M26_EXECUTION_ADD_EXERCISE_NOT_IN_CATALOG');
  const safeSets=Number(sets),safeRest=Number(restSeconds),safeRpe=Number(targetRpe),safeRir=Number(targetRir);
  if(!Number.isInteger(safeSets)||safeSets<1||safeSets>100)throw new Error('M26_EXECUTION_ADD_EXERCISE_SETS_INVALID');
  if(!Number.isFinite(safeRest)||safeRest<1||safeRest>3600)throw new Error('M26_EXECUTION_ADD_EXERCISE_REST_INVALID');
  if(!Number.isFinite(safeRpe)||safeRpe<1||safeRpe>10)throw new Error('M26_EXECUTION_ADD_EXERCISE_RPE_INVALID');
  if(!Number.isFinite(safeRir)||safeRir<0||safeRir>10)throw new Error('M26_EXECUTION_ADD_EXERCISE_RIR_INVALID');
  const item={blockId:`live:${uid()}`,exerciseId,sets:safeSets,prescription:{reps:String(reps||'').trim().slice(0,40)||null,restSeconds:safeRest,tempo:String(tempo||'').trim().slice(0,40)||null,targetRpe:safeRpe,targetRir:safeRir,alternativeId:null},liveAdded:true};
  const insertAt=position==='end'?execution.queue.length:Math.min(execution.queue.length,execution.index+1);
  execution.queue.splice(insertAt,0,item);
  event(execution,'EXERCISE_ADDED',{exerciseId,sets:safeSets,prescription:item.prescription,position:position==='end'?'end':'next',queueIndex:insertAt},actor);
  return execution;
}
export function finishExecution(execution,feedback={}, {actor=null}={}){
  if(execution.status!=='awaiting_feedback')throw new Error('M26_EXECUTION_NOT_COMPLETE');
  const sessionRpe=Number(feedback.sessionRpe||0);if(sessionRpe<1||sessionRpe>10)throw new Error('M26_EXECUTION_SESSION_RPE_REQUIRED');
  if(!String(feedback.comment||'').trim())throw new Error('M26_EXECUTION_FEEDBACK_REQUIRED');
  const pain=Boolean(feedback.pain),painNotes=String(feedback.painNotes||'').trim().slice(0,1000);if(pain&&!painNotes)throw new Error('M26_EXECUTION_PAIN_NOTES_REQUIRED');
  clearActiveSetDraft(execution);clearFinalFeedbackDraft(execution);freezeExecutionClock(execution);execution.feedback={sessionRpe,comment:String(feedback.comment).trim().slice(0,2000),pain,painNotes};execution.status='completed';execution.completedAt=now();
  event(execution,'SESSION_COMPLETED',execution.feedback,actor);return execution;
}
export function buildExecutionCommand(execution,baseRevision=0){if(execution.status!=='completed')throw new Error('M26_EXECUTION_NOT_COMPLETED');return {operationId:execution.id,type:'EJECUCION_COMPLETAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,payload:{patch:remoteSnapshot(execution)}};}
export function buildStartExecutionCommand(execution,{appointmentId,sessionRevision=0}={}){if(!execution?.sessionId||!execution?.id||!appointmentId)throw new Error('M26_EXECUTION_START_CONTEXT_REQUIRED');return {type:'SESION_INICIAR',entityType:'session',entityId:execution.sessionId,clientId:execution.clientId,baseRevision:sessionRevision,payload:{executionId:execution.id,appointmentId,patch:{activeExecutionId:execution.id}}};}
export function buildProgressExecutionCommand(execution,baseRevision=execution?.revision||0){if(!['active','awaiting_feedback'].includes(execution.status))throw new Error('M26_EXECUTION_PROGRESS_INVALID');return {type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,conflictSensitive:true,payload:{progressSnapshot:remoteSnapshot(execution)}};}
export function buildPauseExecutionCommand(execution,baseRevision=execution?.revision||0){if(execution.status!=='paused')throw new Error('M26_EXECUTION_PAUSE_TARGET_INVALID');return {type:'EJECUCION_PAUSAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,payload:{patch:remoteSnapshot(execution)}};}
export function buildResumeExecutionCommand(execution,baseRevision=execution?.revision||0){if(execution.status!=='active')throw new Error('M26_EXECUTION_RESUME_TARGET_INVALID');return {type:'EJECUCION_REANUDAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,payload:{patch:remoteSnapshot(execution)}};}
export function buildCancelExecutionCommand(execution,reason=execution?.cancellationReason,baseRevision=execution?.revision||0){if(execution.status!=='cancelled')throw new Error('M26_EXECUTION_CANCEL_TARGET_INVALID');if(!String(reason||'').trim())throw new Error('M26_EXECUTION_CANCEL_REASON_REQUIRED');return {type:'EJECUCION_CANCELAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,reason:String(reason).trim().slice(0,500),payload:{patch:remoteSnapshot(execution)}};}