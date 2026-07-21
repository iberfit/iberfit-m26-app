import { freezeExecutionClock,resumeExecutionClock } from './session-timer.js';
function clone(v){return structuredClone(v);}
function now(){return new Date().toISOString();}
function uid(){return globalThis.crypto?.randomUUID?.()||`00000000-0000-4000-8000-${Date.now().toString(16).padStart(12,'0').slice(-12)}`;}
function remoteSnapshot(execution){const out=clone(execution);delete out.syncStatus;delete out.pendingOperationIds;delete out.lastSyncError;delete out.recoveredAt;return out;}
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
    if(block.type==='exercise') queue.push({blockId:block.id,exerciseId:block.exerciseId,sets:Number(block.sets||1)});
    else for(const exerciseId of block.exerciseIds||[]) queue.push({blockId:block.id,exerciseId,sets:Number(block.rounds||1)});
  }
  if(!queue.length)throw new Error('M26_EXECUTION_EMPTY_SESSION');
  return {id:executionId,sessionId:session.id,clientId,status:'ready',syncStatus:'clean',pendingOperationIds:[],lastSyncError:null,revision:0,queue,index:0,setIndex:0,startedAt:null,activeSince:null,accumulatedActiveMs:0,completedAt:null,restUntil:null,events:[],results:{},feedback:null};
}
export function currentStep(execution,session){
  const item=execution.queue[execution.index]; if(!item)return null;
  const exercise=findExercise(session,item.exerciseId);
  return {...item,setNumber:execution.setIndex+1,totalSets:item.sets,exercise};
}
function event(execution,type,payload={}){execution.events.push({id:uid(),type,at:now(),payload:clone(payload)});}
export function markExecutionSync(execution,status,{operationId=null,errorCode=null}={}){
  if(!['clean','pending','conflict','rejected'].includes(status))throw new Error('M26_EXECUTION_SYNC_STATUS_INVALID');
  execution.syncStatus=status;execution.lastSyncError=errorCode||null;
  const ids=new Set(execution.pendingOperationIds||[]);if(operationId&&status==='pending')ids.add(operationId);if(operationId&&status==='clean')ids.delete(operationId);execution.pendingOperationIds=[...ids];
  if(status==='clean'&&!operationId)execution.pendingOperationIds=[];
  return execution;
}
export function startExecution(execution){if(execution.status!=='ready')throw new Error('M26_EXECUTION_NOT_READY');execution.status='active';execution.startedAt=now();execution.accumulatedActiveMs=Number(execution.accumulatedActiveMs||0);resumeExecutionClock(execution);event(execution,'SESSION_STARTED');return execution;}
export function pauseExecution(execution){if(execution.status!=='active')throw new Error('M26_EXECUTION_PAUSE_INVALID');freezeExecutionClock(execution);execution.status='paused';execution.restUntil=null;event(execution,'SESSION_PAUSED');return execution;}
export function resumeExecution(execution){if(execution.status!=='paused')throw new Error('M26_EXECUTION_RESUME_INVALID');execution.status='active';resumeExecutionClock(execution);event(execution,'SESSION_RESUMED');return execution;}
export function cancelExecution(execution,reason){if(!['ready','active','paused'].includes(execution.status))throw new Error('M26_EXECUTION_CANCEL_INVALID');if(!String(reason||'').trim())throw new Error('M26_EXECUTION_CANCEL_REASON_REQUIRED');freezeExecutionClock(execution);execution.status='cancelled';execution.cancelledAt=now();execution.cancellationReason=String(reason).trim();execution.restUntil=null;event(execution,'SESSION_CANCELLED',{reason:execution.cancellationReason});return execution;}
export function recordSet(execution,session,input={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  const step=currentStep(execution,session);if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
  const reps=input.reps??null,seconds=input.seconds??null,load=input.load??null,rpe=Number(input.rpe||0),rir=input.rir==null||input.rir===''?null:Number(input.rir);
  if((reps==null||reps==='')&&(seconds==null||seconds===''))throw new Error('M26_EXECUTION_RESULT_REQUIRED');
  if(rpe<1||rpe>10)throw new Error('M26_EXECUTION_RPE_INVALID');
  const key=`${step.exerciseId}:${step.setNumber}`;
  execution.results[key]={exerciseId:step.exerciseId,setNumber:step.setNumber,reps:reps===''?null:reps,seconds:seconds===''?null:seconds,load,rpe,rir,notes:String(input.notes||''),completedAt:now()};
  event(execution,'SET_COMPLETED',execution.results[key]);
  return execution;
}
export function beginRest(execution,seconds){if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');const value=Math.max(0,Number(seconds||0));execution.restUntil=new Date(Date.now()+value*1000).toISOString();event(execution,'REST_STARTED',{seconds:value});return execution;}
export function adjustRest(execution,deltaSeconds){if(!execution.restUntil)throw new Error('M26_EXECUTION_REST_NOT_ACTIVE');const next=Math.max(Date.now(),new Date(execution.restUntil).getTime()+Number(deltaSeconds||0)*1000);execution.restUntil=new Date(next).toISOString();event(execution,'REST_ADJUSTED',{deltaSeconds:Number(deltaSeconds||0)});return execution;}
export function advanceExecution(execution){
  const item=execution.queue[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  const resultKey=`${item.exerciseId}:${execution.setIndex+1}`;if(!execution.results[resultKey])throw new Error('M26_EXECUTION_SET_NOT_RECORDED');
  execution.restUntil=null;
  if(execution.setIndex+1<item.sets)execution.setIndex+=1;else{execution.index+=1;execution.setIndex=0;}
  event(execution,'STEP_ADVANCED',{index:execution.index,setIndex:execution.setIndex});
  if(execution.index>=execution.queue.length){freezeExecutionClock(execution);execution.status='awaiting_feedback';}
  return execution;
}
export function retreatExecution(execution){if(execution.index===0&&execution.setIndex===0)return execution;execution.restUntil=null;if(execution.setIndex>0)execution.setIndex-=1;else{execution.index-=1;execution.setIndex=Math.max(0,execution.queue[execution.index].sets-1);}if(execution.status==='awaiting_feedback'){execution.status='active';resumeExecutionClock(execution);}event(execution,'STEP_REWOUND',{index:execution.index,setIndex:execution.setIndex});return execution;}
export function substituteExercise(execution,session,{fromExerciseId,toExerciseId,catalog,reason}={}){
  if(!reason?.trim())throw new Error('M26_EXECUTION_SUBSTITUTION_REASON_REQUIRED');
  if(!catalog?.has(toExerciseId))throw new Error('M26_EXECUTION_SUBSTITUTE_NOT_IN_CATALOG');
  const item=execution.queue.find((x,i)=>i>=execution.index&&x.exerciseId===fromExerciseId);if(!item)throw new Error('M26_EXECUTION_SUBSTITUTE_TARGET_MISSING');
  item.exerciseId=toExerciseId;event(execution,'EXERCISE_SUBSTITUTED',{fromExerciseId,toExerciseId,reason:reason.trim()});return execution;
}
export function finishExecution(execution,feedback={}){
  if(execution.status!=='awaiting_feedback')throw new Error('M26_EXECUTION_NOT_COMPLETE');
  const sessionRpe=Number(feedback.sessionRpe||0);if(sessionRpe<1||sessionRpe>10)throw new Error('M26_EXECUTION_SESSION_RPE_REQUIRED');
  if(!String(feedback.comment||'').trim())throw new Error('M26_EXECUTION_FEEDBACK_REQUIRED');
  freezeExecutionClock(execution);execution.feedback={sessionRpe,comment:String(feedback.comment).trim(),pain:Boolean(feedback.pain),painNotes:String(feedback.painNotes||'')};execution.status='completed';execution.completedAt=now();event(execution,'SESSION_COMPLETED',execution.feedback);return execution;
}
export function buildExecutionCommand(execution,baseRevision=0){if(execution.status!=='completed')throw new Error('M26_EXECUTION_NOT_COMPLETED');return {type:'EJECUCION_COMPLETAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,payload:{patch:remoteSnapshot(execution)}};}
export function buildStartExecutionCommand(execution,{appointmentId,sessionRevision=0}={}){if(!execution?.sessionId||!execution?.id||!appointmentId)throw new Error('M26_EXECUTION_START_CONTEXT_REQUIRED');return {type:'SESION_INICIAR',entityType:'session',entityId:execution.sessionId,clientId:execution.clientId,baseRevision:sessionRevision,payload:{executionId:execution.id,appointmentId,patch:{activeExecutionId:execution.id}}};}
export function buildProgressExecutionCommand(execution,baseRevision=execution?.revision||0){if(!['active','awaiting_feedback'].includes(execution.status))throw new Error('M26_EXECUTION_PROGRESS_INVALID');return {type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,conflictSensitive:false,payload:{progressSnapshot:remoteSnapshot(execution)}};}
export function buildPauseExecutionCommand(execution,baseRevision=execution?.revision||0){if(execution.status!=='active')throw new Error('M26_EXECUTION_PAUSE_INVALID');return {type:'EJECUCION_PAUSAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,payload:{patch:remoteSnapshot(execution)}};}
export function buildResumeExecutionCommand(execution,baseRevision=execution?.revision||0){if(execution.status!=='paused')throw new Error('M26_EXECUTION_RESUME_INVALID');return {type:'EJECUCION_REANUDAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,payload:{patch:remoteSnapshot(execution)}};}
export function buildCancelExecutionCommand(execution,reason,baseRevision=execution?.revision||0){if(!String(reason||'').trim())throw new Error('M26_EXECUTION_CANCEL_REASON_REQUIRED');return {type:'EJECUCION_CANCELAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,reason:String(reason).trim(),payload:{patch:remoteSnapshot(execution)}};}
