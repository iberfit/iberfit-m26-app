import { freezeExecutionClock,resumeExecutionClock } from './session-timer.js';
import { createM26Id } from '../platform/id.js';
import {EXERCISE_METRIC_KEYS,exerciseMeasurementProfile} from '../exercises/measurement-profiles.js';
function clone(v){return structuredClone(v);}
function now(){return new Date().toISOString();}
function uid(){return createM26Id();}
function remoteSnapshot(execution){const out=clone(execution);delete out.syncStatus;delete out.pendingOperationIds;delete out.lastSyncError;delete out.recoveredAt;delete out.liveTelemetry;delete out.activeSetDraft;delete out.finalFeedbackDraft;delete out.reviewingHistory;return out;}
function groupedExerciseFromBlock(block,exerciseId){
  if(!block||!exerciseId)return null;
  if(Array.isArray(block.exercises)){
    const nested=block.exercises.find((candidate)=>candidate?.exerciseId===exerciseId);
    if(nested)return nested;
  }
  const exerciseIds=Array.isArray(block.exerciseIds)?block.exerciseIds:[];
  const groupOrder=exerciseIds.indexOf(exerciseId);
  if(groupOrder<0)return null;
  const planned=block?.prescriptions?.[exerciseId];
  return {
    ...(planned&&typeof planned==='object'?clone(planned):{}),
    exerciseId,
    blockId:block.id||null,
    groupType:block.type||null,
    groupOrder,
  };
}
function findExercise(session,exerciseId){
  for(const block of session?.blocks||[]){
    if(block.type==='exercise'&&block.exerciseId===exerciseId)return block;
    const grouped=groupedExerciseFromBlock(block,exerciseId);
    if(grouped)return grouped;
  }
  return null;
}
function planSnapshotForExecution(execution){
  const snapshot=execution?.planSnapshot||execution?.plan_snapshot||null;
  if(!snapshot)return null;
  const executionSessionId=String(execution?.sessionId??execution?.session_id??'').trim();
  const snapshotSessionId=String(snapshot?.sessionId??snapshot?.session_id??'').trim();
  if(!executionSessionId||!snapshotSessionId||executionSessionId!==snapshotSessionId)return null;
  return snapshot;
}
function findExecutionExercise(execution,session,item){
  const snapshot=planSnapshotForExecution(execution);
  if(snapshot){
    const blocks=snapshot.blocks||[];
    const block=item?.blockId?blocks.find((candidate)=>candidate?.id===item.blockId):null;
    if(block?.type==='exercise'&&block.exerciseId===item?.exerciseId)return block;
    const grouped=groupedExerciseFromBlock(block,item?.exerciseId);
    if(grouped)return grouped;
  }
  return findExercise(session,item?.exerciseId);
}
function isGroupedQueueItem(item){return Boolean(item?.groupType&&item?.blockId);}
function sameExecutionGroup(a,b){return isGroupedQueueItem(a)&&isGroupedQueueItem(b)&&a.blockId===b.blockId&&a.groupType===b.groupType;}
function plannedExecutionPositions(execution){
  const queue=execution?.queue||[];
  const positions=[];
  for(let index=0;index<queue.length;){
    const item=queue[index];
    if(isGroupedQueueItem(item)){
      let end=index+1;
      while(end<queue.length&&sameExecutionGroup(item,queue[end]))end+=1;
      const groupItems=queue.slice(index,end);
      const maxSets=Math.max(0,...groupItems.map((candidate)=>Number(candidate?.sets||0)));
      for(let setIndex=0;setIndex<maxSets;setIndex+=1){
        for(let groupIndex=index;groupIndex<end;groupIndex+=1){
          if(setIndex<Number(queue[groupIndex]?.sets||0))positions.push({index:groupIndex,setIndex});
        }
      }
      index=end;
      continue;
    }
    for(let setIndex=0;setIndex<Number(item?.sets||0);setIndex+=1)positions.push({index,setIndex});
    index+=1;
  }
  return positions;
}
function samePosition(a,b){return Boolean(a&&b)&&Number(a.index)===Number(b.index)&&Number(a.setIndex)===Number(b.setIndex);}
function positionResolved(execution,position){
  const item=execution?.queue?.[position?.index];
  if(!item)return true;
  const setNumber=Number(position.setIndex)+1;
  const step={...item,setNumber,totalSets:item.sets};
  return Boolean(executionResultForStep(execution,step,setNumber)||skippedSetForStep(execution,step,setNumber));
}
function nextUnresolvedPosition(execution){
  const positions=plannedExecutionPositions(execution);
  if(!positions.length)return null;
  const current={index:execution?.index,setIndex:execution?.setIndex};
  const currentOffset=positions.findIndex((position)=>samePosition(position,current));
  const after=currentOffset>=0?positions.slice(currentOffset+1):positions;
  const before=currentOffset>0?positions.slice(0,currentOffset):[];
  return [...after,...before].find((position)=>!positionResolved(execution,position))||null;
}
function nextPlannedPosition(execution){
  const positions=plannedExecutionPositions(execution);
  if(!positions.length)return null;
  const current={index:execution?.index,setIndex:execution?.setIndex};
  const currentOffset=positions.findIndex((position)=>samePosition(position,current));
  if(currentOffset<0)return null;
  return positions[currentOffset+1]||null;
}
function nextExecutionPosition(execution,{reviewHistory=false}={}){
  if(reviewHistory&&execution?.reviewingHistory){
    return nextPlannedPosition(execution)||nextUnresolvedPosition(execution);
  }
  return nextUnresolvedPosition(execution);
}
function previousPlannedPosition(execution){
  const positions=plannedExecutionPositions(execution);
  if(!positions.length)return null;
  const current={index:execution?.index,setIndex:execution?.setIndex};
  const currentOffset=positions.findIndex((position)=>samePosition(position,current));
  if(currentOffset<0){
    if(Number(execution?.index)>=Number(execution?.queue?.length||0))return positions.at(-1)||null;
    return null;
  }
  return currentOffset>0?positions[currentOffset-1]:null;
}
function serializedSportTargets(source={}){
  return Object.fromEntries(EXERCISE_METRIC_KEYS.map((key)=>[key,
    source[key]===undefined||source[key]===null?null:String(source[key]).trim().slice(0,24)
  ]));
}
function exerciseResultProfile(step){
  return exerciseMeasurementProfile({id:step?.exerciseId,name_es:step?.exercise?.name_es||step?.exercise?.name});
}
function createPlanSnapshot(session,queue){
  const rawRevision=Number(session?.revision??session?.version??0);
  const sessionRevision=Number.isInteger(rawRevision)&&rawRevision>=0?rawRevision:0;
  return {
    schemaVersion:1,
    sessionId:String(session.id),
    sessionRevision,
    title:String(session.title||session.name||'').trim().slice(0,120)||null,
    blocks:clone(session.blocks||[]),
    queue:clone(queue),
  };
}

export function createExecution({session,clientId,executionId=uid()}={}){
  if(!session?.id||!clientId)throw new Error('M26_EXECUTION_SESSION_CLIENT_REQUIRED');
  const queue=[];
  for(const block of session.blocks||[]){
    if(block.type==='exercise'){const sets=Number(block.sets||1),restSeconds=Number(block.restSeconds??60),targetRpe=Number(block.targetRpe||7),targetRir=Number(block.targetRir??3);if(!block.exerciseId||!Number.isInteger(sets)||sets<1||sets>100||!Number.isFinite(restSeconds)||restSeconds<0||restSeconds>3600||!Number.isFinite(targetRpe)||targetRpe<1||targetRpe>10||!Number.isFinite(targetRir)||targetRir<0||targetRir>10)throw new Error('M26_EXECUTION_BLOCK_INVALID');queue.push({blockId:block.id,exerciseId:block.exerciseId,sets,prescription:{...serializedSportTargets(block),reps:String(block.reps||'').trim().slice(0,40)||null,plannedLoad:String(block.plannedLoad||'').trim().slice(0,80)||null,restSeconds,tempo:String(block.tempo||'').trim().slice(0,40)||null,targetRpe,targetRir,prescriptionNotes:String(block.prescriptionNotes||'').trim().slice(0,1000)||null,progression:String(block.progression||'').trim().slice(0,500)||null,alternativeId:block.alternativeId||null}});}
    else {const sets=Number(block.rounds||1),exerciseIds=block.exerciseIds||[];if(!Number.isInteger(sets)||sets<1||sets>100||!exerciseIds.length)throw new Error('M26_EXECUTION_GROUP_INVALID');for(const [groupOrder,exerciseId] of exerciseIds.entries()){if(!exerciseId)throw new Error('M26_EXECUTION_GROUP_INVALID');const planned=block.prescriptions?.[exerciseId]||{},restSeconds=Number(planned.restSeconds??60),targetRpe=Number(planned.targetRpe||7),targetRir=Number(planned.targetRir??3);if(!Number.isFinite(restSeconds)||restSeconds<0||restSeconds>3600||!Number.isFinite(targetRpe)||targetRpe<1||targetRpe>10||!Number.isFinite(targetRir)||targetRir<0||targetRir>10)throw new Error('M26_EXECUTION_GROUP_INVALID');queue.push({blockId:block.id,exerciseId,sets,groupType:block.type,groupOrder,groupSize:exerciseIds.length,prescription:{...serializedSportTargets(planned),reps:String(planned.reps||'').trim().slice(0,40)||null,plannedLoad:String(planned.plannedLoad||'').trim().slice(0,80)||null,restSeconds,tempo:String(planned.tempo||'').trim().slice(0,40)||null,targetRpe,targetRir,prescriptionNotes:String(planned.prescriptionNotes||'').trim().slice(0,1000)||null,progression:String(planned.progression||'').trim().slice(0,500)||null,alternativeId:planned.alternativeId||null}});}}
  }
  if(!queue.length)throw new Error('M26_EXECUTION_EMPTY_SESSION');
  return {id:executionId,sessionId:session.id,clientId,status:'ready',syncStatus:'clean',pendingOperationIds:[],lastSyncError:null,revision:0,planSnapshot:createPlanSnapshot(session,queue),queue,index:0,setIndex:0,startedAt:null,activeSince:null,accumulatedActiveMs:0,completedAt:null,restUntil:null,events:[],results:{},feedback:null};
}
function executionStepAtPosition(execution,session,position){
  const item=execution?.queue?.[position?.index];
  if(!item)return null;
  const setIndex=Number(position?.setIndex);
  const totalSets=Number(item.sets||0);
  if(!Number.isInteger(setIndex)||setIndex<0||setIndex>=totalSets)return null;
  const exercise=findExecutionExercise(execution,session,item);
  return {
    ...item,
    setIndex,
    setNumber:setIndex+1,
    totalSets,
    roundNumber:isGroupedQueueItem(item)?setIndex+1:null,
    totalRounds:isGroupedQueueItem(item)?totalSets:null,
    exercise,
    prescription:clone(item.prescription||{}),
  };
}
export function currentStep(execution,session){
  return executionStepAtPosition(
    execution,
    session,
    {index:execution?.index,setIndex:execution?.setIndex},
  );
}
export function nextExecutionStep(execution,session){
  const position=nextExecutionPosition(
    execution,
    {reviewHistory:true},
  );
  return position?executionStepAtPosition(execution,session,position):null;
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
function resultKey(exerciseId,setNumber,blockId=null){
  const legacy=`${exerciseId}:${setNumber}`;
  return blockId?`${blockId}:${legacy}`:legacy;
}
function canUseLegacyEntry(execution,step,setNumber){
  if(!step?.blockId)return true;
  const occurrenceIndex=(execution?.queue||[]).findIndex((item)=>item?.blockId===step.blockId&&item?.exerciseId===step.exerciseId);
  const firstCompatibleIndex=(execution?.queue||[]).findIndex((item)=>item?.exerciseId===step.exerciseId&&Number(item?.sets||0)>=Number(setNumber));
  return occurrenceIndex>=0&&occurrenceIndex===firstCompatibleIndex;
}
function requiresScopedEntry(execution,step,setNumber=step?.setNumber){
  if(!step?.blockId||!step?.exerciseId)return false;
  const targetSet=Number(setNumber);
  if(!Number.isInteger(targetSet)||targetSet<1)return false;
  const compatible=(execution?.queue||[]).filter((item)=>item?.exerciseId===step.exerciseId&&Number(item?.sets||0)>=targetSet);
  return compatible.length>1;
}
function storageKeyForStep(execution,step,setNumber=step?.setNumber){
  return resultKey(step.exerciseId,setNumber,requiresScopedEntry(execution,step,setNumber)?step.blockId||null:null);
}
function storedEntry(store,execution,step,setNumber=step?.setNumber){
  if(!store||!step?.exerciseId||!Number.isInteger(Number(setNumber))||Number(setNumber)<1)return null;
  const scopedKey=resultKey(step.exerciseId,setNumber,step.blockId||null);
  if(Object.hasOwn(store,scopedKey))return {key:scopedKey,value:store[scopedKey],legacy:false};
  const legacyKey=resultKey(step.exerciseId,setNumber);
  if(scopedKey!==legacyKey&&canUseLegacyEntry(execution,step,setNumber)&&Object.hasOwn(store,legacyKey)){
    return {key:legacyKey,value:store[legacyKey],legacy:true};
  }
  return null;
}
export function executionResultForStep(execution,step,setNumber=step?.setNumber){
  return storedEntry(execution?.results,execution,step,setNumber)?.value||null;
}
export function skippedSetForStep(execution,step,setNumber=step?.setNumber){
  return storedEntry(execution?.skippedSets,execution,step,setNumber)?.value||null;
}
export function previousSetDraftValues(execution){
  const item=execution?.queue?.[execution.index];
  if(!item||Number(execution.setIndex)<1)return null;
  const previousSetNumber=Number(execution.setIndex);
  const previous=executionResultForStep(execution,{...item,setNumber:previousSetNumber,totalSets:item.sets},previousSetNumber);
  if(!previous)return null;
  return {
    reps:previous.reps==null?'':String(previous.reps),
    seconds:previous.seconds==null?'':String(previous.seconds),
    load:previous.load==null?'':String(previous.load),
    rpe:previous.rpe==null?'':String(previous.rpe),
    rir:previous.rir==null?'':String(previous.rir),
  };
}

function exactPlannedWorkValue(value){
  const raw=String(value??'').trim();
  if(!raw)return {reps:'',seconds:''};
  const normalized=raw.replace(',','.').toLowerCase();
  const reps=normalized.match(/^(\d+(?:\.\d+)?)$/u);
  if(reps)return {reps:reps[1],seconds:''};
  const seconds=normalized.match(/^(\d+(?:\.\d+)?)\s*(?:s|seg|segs|segundo|segundos)$/u);
  if(seconds)return {reps:'',seconds:seconds[1]};
  return {reps:'',seconds:''};
}
export function plannedSetDraftValues(execution,session){
  const step=currentStep(execution,session);
  if(!step)return null;
  const planned=step.prescription||{};
  const work=exactPlannedWorkValue(planned.reps);
  const loadRaw=String(planned.plannedLoad??'').trim();
  const load=/^(?:-|—|seg[uú]n indicaci[oó]n)$/iu.test(loadRaw)?'':loadRaw;
  const values={
    reps:work.reps,
    seconds:work.seconds,
    load:load.slice(0,80),
    // RPE/RIR are observed effort, never inferred from the planned target.
    rpe:'',
    rir:'',
  };
  return Object.values(values).some((value)=>String(value).trim())?values:null;
}
export function previousSetReviewDraftValues(execution){
  const previous=previousSetDraftValues(execution);
  if(!previous)return null;
  return {
    reps:previous.reps,
    seconds:previous.seconds,
    load:previous.load,
    // Previous effort is context, not a new observation.
    rpe:'',
    rir:'',
  };
}
export function suggestedSetDraftValues(execution,session){
  const previous=previousSetReviewDraftValues(execution);
  if(previous)return {source:'previous',values:previous};
  const planned=plannedSetDraftValues(execution,session);
  return planned?{source:'planned',values:planned}:null;
}
export function hasNextExecutionStep(execution){return Boolean(nextUnresolvedPosition(execution));}
export function repeatPreviousSet(execution,session,{restSeconds=null,rpe=null,rir=null,actor=null}={}){
  requireCoachActor(actor);
  if(execution?.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  const values=previousSetDraftValues(execution);
  if(!values)throw new Error('M26_EXECUTION_PREVIOUS_SET_UNAVAILABLE');
  const step=currentStep(execution,session);
  if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
  const rest=restSeconds==null?Number(step?.prescription?.restSeconds??60):Number(restSeconds);
  if(!Number.isFinite(rest)||rest<0||rest>3600)throw new Error('M26_EXECUTION_REST_INVALID');
  const sourceSetNumber=Number(execution.setIndex);
  const targetSetNumber=Number(step.setNumber);
  // A prior observed RPE/RIR cannot be asserted for a new set by copying it.
  const observedRpe=String(rpe??'').trim();
  if(!observedRpe||!Number.isFinite(Number(observedRpe))||Number(observedRpe)<1||Number(observedRpe)>10)
    throw new Error('M26_EXECUTION_RPE_OBSERVED_REQUIRED');
  recordSet(execution,session,{reps:values.reps,seconds:values.seconds,load:values.load,rpe:observedRpe,rir,actor});
  if(hasNextExecutionStep(execution))beginRest(execution,rest,{actor});
  event(execution,'SET_REPEATED_FROM_PREVIOUS',{sourceSetNumber,targetSetNumber,restSeconds:rest},actor);
  return execution;
}
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
  if(executionResultForStep(execution,identity)){if(sameActiveSet(execution?.activeSetDraft,identity))delete execution.activeSetDraft;return null;}
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
  const previous=execution?.finalFeedbackDraft?.executionId===execution.id?execution.finalFeedbackDraft:null;
  execution.finalFeedbackDraft={
    executionId:execution.id,
    values:{
      sessionRpe:draftValue(input.sessionRpe,32),
      comment:draftValue(input.comment,2000),
      pain:Boolean(input.pain),
      painNotes:draftValue(input.painNotes,1000),
    },
    ...(previous?.needsReview?{
      needsReview:true,
      reviewReasons:Array.isArray(previous.reviewReasons)?[...previous.reviewReasons]:[],
      reviewRequiredAt:previous.reviewRequiredAt||now(),
    }:{}),
    updatedAt:now(),
  };
  return clone(execution.finalFeedbackDraft);
}
export function clearFinalFeedbackDraft(execution){if(execution)delete execution.finalFeedbackDraft;return execution;}
function markFinalFeedbackDraftNeedsReview(execution,reason){
  const draft=execution?.finalFeedbackDraft;
  if(!draft||draft.executionId!==execution.id)return null;
  const reasons=new Set(Array.isArray(draft.reviewReasons)?draft.reviewReasons:[]);
  const safeReason=String(reason||'').trim();
  if(safeReason)reasons.add(safeReason);
  execution.finalFeedbackDraft={
    ...draft,
    needsReview:true,
    reviewReasons:[...reasons],
    reviewRequiredAt:now(),
  };
  return execution.finalFeedbackDraft;
}
function ensureDeviationStores(execution){
  if(!execution.skippedSets||typeof execution.skippedSets!=='object')execution.skippedSets={};
  if(!Array.isArray(execution.skippedExercises))execution.skippedExercises=[];
}
function skippedExerciseDeviationCoversStep(execution,deviation,step,setNumber=step?.setNumber){
  const target=Number(setNumber);
  if(!deviation||deviation.exerciseId!==step?.exerciseId||!Number.isInteger(target)||target<1)return false;
  const from=Number(deviation.fromSetNumber??deviation.setNumber);
  const to=Number(deviation.toSetNumber??deviation.setNumber??from);
  if(!Number.isInteger(from)||!Number.isInteger(to)||target<from||target>to)return false;
  if(deviation.blockId)return deviation.blockId===(step.blockId||null);
  if(step?.blockId&&requiresScopedEntry(execution,step,target))return canUseLegacyEntry(execution,step,target);
  return true;
}
function reconcileSkippedExerciseDeviations(execution,step,setNumber=step?.setNumber){
  const target=Number(setNumber);
  const next=[];
  for(const deviation of execution.skippedExercises||[]){
    if(!skippedExerciseDeviationCoversStep(execution,deviation,step,target)){
      next.push(deviation);
      continue;
    }
    const from=Number(deviation.fromSetNumber??deviation.setNumber);
    const to=Number(deviation.toSetNumber??deviation.setNumber??from);
    if(from<target)next.push({...deviation,fromSetNumber:from,toSetNumber:target-1});
    if(target<to)next.push({...deviation,fromSetNumber:target+1,toSetNumber:to});
  }
  execution.skippedExercises=next;
}
function replaceSkippedStepWithCompletion(execution,step,actor=null){
  ensureDeviationStores(execution);
  const previous=storedEntry(execution.skippedSets,execution,step);
  if(!previous)return null;
  delete execution.skippedSets[previous.key];
  reconcileSkippedExerciseDeviations(execution,step);
  event(execution,'SET_SKIP_REPLACED_BY_COMPLETION',{
    blockId:step.blockId||null,
    exerciseId:step.exerciseId,
    setNumber:Number(step.setNumber),
    reason:previous.value?.reason||null,
    source:previous.value?.source||'set_skip',
    skippedAt:previous.value?.at||null,
  },actor);
  return previous.value;
}
function measuredNumber(value,min,max,code,integer=false){
 if(value===undefined||value===null||String(value).trim()==='')return null;
 const n=Number(String(value).trim().replace(',','.'));
 if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw new Error(code);
 return n;
}
function validatedSetResult(step,input={},previous=null){
  const rawReps=input.reps??null,rawSeconds=input.seconds??null,load=input.load==null?null:String(input.load).trim().slice(0,80),rpe=Number(input.rpe),rir=input.rir==null||input.rir===''?null:Number(input.rir);
  const profile=exerciseResultProfile(step);
  const minutes=measuredNumber(input.durationMinutes,0,1440,'M26_EXECUTION_DURATION_INVALID');
  const distanceKm=measuredNumber(input.distanceKm,0,1000,'M26_EXECUTION_DISTANCE_INVALID');
  const reps=rawReps==null||rawReps===''?null:Number(rawReps),explicitSeconds=rawSeconds==null||rawSeconds===''?null:Number(rawSeconds);
  if(minutes!==null&&explicitSeconds!==null&&Math.abs(explicitSeconds-minutes*60)>0.01)throw new Error('M26_EXECUTION_DURATION_AMBIGUOUS');
  const seconds=explicitSeconds??(minutes===null?null:Math.round(minutes*60));
  if(reps===null&&seconds===null&&!((profile.cardio||profile.kind==='carry')&&distanceKm>0))throw new Error('M26_EXECUTION_RESULT_REQUIRED');
  if(reps!==null&&(!Number.isFinite(reps)||reps<0||reps>10000))throw new Error('M26_EXECUTION_REPS_INVALID');
  if(seconds!==null&&(!Number.isFinite(seconds)||seconds<0||seconds>86400))throw new Error('M26_EXECUTION_SECONDS_INVALID');
  if(!Number.isFinite(rpe)||rpe<1||rpe>10)throw new Error('M26_EXECUTION_RPE_INVALID');
  if(rir!==null&&(!Number.isFinite(rir)||rir<0||rir>10))throw new Error('M26_EXECUTION_RIR_INVALID');
  const avgHeartRateBpm=measuredNumber(input.avgHeartRateBpm,30,250,'M26_EXECUTION_HEART_RATE_INVALID',true);
  const cadenceRpm=measuredNumber(input.cadenceRpm,0,250,'M26_EXECUTION_CADENCE_INVALID');
  const powerWatts=measuredNumber(input.powerWatts,0,2500,'M26_EXECUTION_POWER_INVALID');
  const elevationGainM=measuredNumber(input.elevationGainM,0,15000,'M26_EXECUTION_ELEVATION_INVALID');
  const intervalsCompleted=measuredNumber(input.intervalsCompleted,1,1000,'M26_EXECUTION_INTERVALS_INVALID',true);
  const paceMinPerKm=String(input.paceMinPerKm??'').trim();
  if(paceMinPerKm&&!/^[0-9]{1,2}:[0-5][0-9]$/.test(paceMinPerKm))throw new Error('M26_EXECUTION_PACE_INVALID');
  const provenance=actorSnapshot(input.actor);
  return {
    exerciseId:step.exerciseId,
    setNumber:step.setNumber,
    reps,seconds,load,rpe,rir,
    ...((profile.cardio||profile.kind==='carry')?{distanceKm,avgHeartRateBpm,paceMinPerKm:paceMinPerKm||null,cadenceRpm,powerWatts,elevationGainM,intervalsCompleted}:{}),
    notes:String(input.notes||'').trim().slice(0,1000),
    completedAt:previous?.completedAt||now(),
    ...(previous?{correctedAt:now()}:{ }),
    ...(provenance?{recordedBy:provenance}:{ }),
  };
}
function activeSetDraftMatchesPosition(execution,draft,index,setIndex){
  const item=execution?.queue?.[index];
  if(!draft||!item)return false;
  return draft.executionId===execution.id&&draft.blockId===(item.blockId||null)&&draft.exerciseId===item.exerciseId&&Number(draft.setNumber)===Number(setIndex)+1;
}
function moveForward(execution,actor=null,{reviewHistory=false}={}){
  const item=execution.queue[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  const pendingDraft=execution.activeSetDraft;
  const draftBelongsToSource=activeSetDraftMatchesPosition(execution,pendingDraft,execution.index,execution.setIndex);
  execution.restUntil=null;
  const reviewingHistory=Boolean(reviewHistory&&execution.reviewingHistory);
  const plannedNext=reviewingHistory?nextPlannedPosition(execution):null;
  const next=nextExecutionPosition(execution,{reviewHistory});
  if(reviewingHistory){
    if(!plannedNext||!positionResolved(execution,plannedNext)){
      delete execution.reviewingHistory;
    }
  }else{
    delete execution.reviewingHistory;
  }
  if(next){execution.index=next.index;execution.setIndex=next.setIndex;}
  else{execution.index=execution.queue.length;execution.setIndex=0;}
  if(draftBelongsToSource)clearActiveSetDraft(execution);
  event(execution,'STEP_ADVANCED',{index:execution.index,setIndex:execution.setIndex},actor);
  if(!next){delete execution.reviewingHistory;freezeExecutionClock(execution);execution.status='awaiting_feedback';}
  return execution;
}
export function markExecutionSync(execution,status,{operationId=null,errorCode=null}={}){
  if(!['clean','pending','conflict','rejected'].includes(status))throw new Error('M26_EXECUTION_SYNC_STATUS_INVALID');
  const ids=new Set(execution.pendingOperationIds||[]);
  if(operationId&&status==='pending')ids.add(operationId);
  if(operationId&&status!=='pending')ids.delete(operationId);
  if(status==='clean'&&!operationId)ids.clear();
  execution.pendingOperationIds=[...ids];
  execution.syncStatus=status==='clean'&&ids.size?'pending':status;
  execution.lastSyncError=execution.syncStatus==='pending'&&status==='clean'?null:(errorCode||null);
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
  clearActiveSetDraft(execution);clearFinalFeedbackDraft(execution);delete execution.reviewingHistory;freezeExecutionClock(execution);execution.status='cancelled';execution.cancelledAt=now();execution.cancellationReason=safeReason;execution.restUntil=null;
  event(execution,'SESSION_CANCELLED',{reason:safeReason},actor);return execution;
}
export function recordSet(execution,session,input={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  const step=currentStep(execution,session);if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
  const key=storageKeyForStep(execution,step);
  if(executionResultForStep(execution,step))throw new Error('M26_EXECUTION_SET_ALREADY_RECORDED');
  const result=validatedSetResult(step,input);
  replaceSkippedStepWithCompletion(execution,step,input.actor);
  markFinalFeedbackDraftNeedsReview(execution,'set_recorded_after_closeout');
  execution.results[key]=result;clearActiveSetDraft(execution);
  event(execution,'SET_COMPLETED',result,input.actor);
  return execution;
}
export function correctSet(execution,session,input={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  const step=currentStep(execution,session);if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
  const previousEntry=storedEntry(execution.results,execution,step);
  if(!previousEntry)throw new Error('M26_EXECUTION_SET_CORRECTION_TARGET_MISSING');
  const key=storageKeyForStep(execution,step);
  const previous=previousEntry.value;
  const next=validatedSetResult(step,input,previous);
  markFinalFeedbackDraftNeedsReview(execution,'set_corrected_after_closeout');
  if(previousEntry.key!==key)delete execution.results[previousEntry.key];
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
  const step={...item,setNumber:execution.setIndex+1,totalSets:item.sets};
  ensureDeviationStores(execution);
  if(!executionResultForStep(execution,step)&&!skippedSetForStep(execution,step))throw new Error('M26_EXECUTION_SET_NOT_RECORDED');
  return moveForward(execution,actor,{reviewHistory:true});
}
export function advanceExpiredRest(execution,session,{actor=null,nowMs=Date.now()}={}){
  requireCoachActor(actor);
  if(execution?.status!=='active')throw new Error('M26_EXECUTION_REST_AUTO_ADVANCE_INVALID');
  const item=execution.queue?.[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  const step=currentStep(execution,session);if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
  if(!executionResultForStep(execution,step))throw new Error('M26_EXECUTION_SET_NOT_RECORDED');
  const deadline=new Date(execution.restUntil||'').getTime();
  const clock=Number(nowMs);
  if(!Number.isFinite(deadline)||!execution.restUntil)throw new Error('M26_EXECUTION_REST_NOT_ACTIVE');
  if(!Number.isFinite(clock)||clock<deadline)throw new Error('M26_EXECUTION_REST_NOT_EXPIRED');
  if(!hasNextExecutionStep(execution))throw new Error('M26_EXECUTION_REST_AUTO_ADVANCE_FINAL_STEP');
  const from={index:execution.index,setIndex:execution.setIndex,blockId:step.blockId||null,exerciseId:step.exerciseId,setNumber:step.setNumber};
  moveForward(execution,actor);
  event(execution,'REST_COMPLETED_AUTO_ADVANCE',{...from,toIndex:execution.index,toSetIndex:execution.setIndex},actor);
  return execution;
}
export function retreatExecution(execution,{actor=null}={}){
  if(!['active','awaiting_feedback'].includes(execution.status))throw new Error('M26_EXECUTION_RETREAT_INVALID');
  const previous=previousPlannedPosition(execution);
  if(!previous)return execution;
  execution.restUntil=null;
  execution.reviewingHistory=true;
  execution.index=previous.index;execution.setIndex=previous.setIndex;
  if(execution.status==='awaiting_feedback'){execution.status='active';resumeExecutionClock(execution);}
  event(execution,'STEP_REWOUND',{index:execution.index,setIndex:execution.setIndex},actor);return execution;
}
function resolvedSetPrefix(execution,item){
  if(!item)return 0;
  let prefix=0;
  for(let setNumber=1;setNumber<=Number(item.sets||0);setNumber+=1){
    const step={...item,setNumber,totalSets:item.sets};
    if(executionResultForStep(execution,step,setNumber)||skippedSetForStep(execution,step,setNumber))prefix=setNumber;
    else break;
  }
  return prefix;
}
function occurrenceHasResolvedSet(execution,item){return resolvedSetPrefix(execution,item)>0;}
export function currentExerciseSubstitutionScope(execution){
  const item=execution?.queue?.[execution.index];
  if(!item||execution?.reviewingHistory)return 'locked';
  const resolved=resolvedSetPrefix(execution,item);
  if(!resolved)return 'all';
  if(isGroupedQueueItem(item)||resolved>=Number(item.sets||0))return 'locked';
  return 'remaining';
}
export function canSubstituteCurrentExercise(execution){
  const item=execution?.queue?.[execution.index];
  return Boolean(item)&&!occurrenceHasResolvedSet(execution,item);
}
export function substituteExercise(execution,session,{fromExerciseId,toExerciseId,catalog,reason,actor=null}={}){
  const safeReason=requireReason(reason,'M26_EXECUTION_SUBSTITUTION_REASON_REQUIRED');
  if(!catalog?.has(toExerciseId))throw new Error('M26_EXECUTION_SUBSTITUTE_NOT_IN_CATALOG');
  if(toExerciseId===fromExerciseId)throw new Error('M26_EXECUTION_SUBSTITUTE_SAME');
  const itemIndex=execution.queue.findIndex((x,i)=>i>=execution.index&&x.exerciseId===fromExerciseId);
  if(itemIndex<0)throw new Error('M26_EXECUTION_SUBSTITUTE_TARGET_MISSING');
  const item=execution.queue[itemIndex];
  if(itemIndex===execution.index){
    const scope=currentExerciseSubstitutionScope(execution);
    if(scope==='locked')throw new Error('M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED');
    const resolved=resolvedSetPrefix(execution,item);
    clearActiveSetDraft(execution);
    if(resolved>0){
      if(isGroupedQueueItem(item))throw new Error('M26_EXECUTION_SUBSTITUTION_GROUP_PROGRESS_REQUIRES_ORDER');
      const totalSets=Number(item.sets||0);
      const remainingSets=totalSets-resolved;
      if(remainingSets<1)throw new Error('M26_EXECUTION_SUBSTITUTION_NO_REMAINING_SETS');
      const replacement={
        ...clone(item),
        exerciseId:toExerciseId,
        sets:remainingSets,
        substitutedFromExerciseId:fromExerciseId,
      };
      item.sets=resolved;
      execution.queue.splice(itemIndex+1,0,replacement);
      const currentSetNumber=Number(execution.setIndex)+1;
      const currentResolved=currentSetNumber<=resolved;
      if(!currentResolved){
        execution.index=itemIndex+1;
        execution.setIndex=0;
        execution.restUntil=null;
      }
      markFinalFeedbackDraftNeedsReview(execution,'exercise_substituted_after_closeout');
      event(execution,'EXERCISE_SUBSTITUTED',{
        fromExerciseId,toExerciseId,reason:safeReason,
        partial:true,preservedSets:resolved,remainingSets,
      },actor);
      return execution;
    }
  }
  item.exerciseId=toExerciseId;
  markFinalFeedbackDraftNeedsReview(execution,'exercise_substituted_after_closeout');
  event(execution,'EXERCISE_SUBSTITUTED',{fromExerciseId,toExerciseId,reason:safeReason,partial:false},actor);
  return execution;
}
export function addExecutionSet(execution,{actor=null}={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  requireCoachActor(actor);
  const item=execution.queue[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  if(item.sets>=100)throw new Error('M26_EXECUTION_SET_LIMIT');
  item.sets+=1;
  markFinalFeedbackDraftNeedsReview(execution,'set_added_after_closeout');
  event(execution,'SET_ADDED',{exerciseId:item.exerciseId,totalSets:item.sets},actor);
  return execution;
}
export function addExecutionGroupRound(execution,{actor=null}={}){
  if(execution?.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  requireCoachActor(actor);
  const current=execution.queue?.[execution.index];if(!current)throw new Error('M26_EXECUTION_STEP_MISSING');
  if(!isGroupedQueueItem(current))throw new Error('M26_EXECUTION_GROUP_ROUND_NOT_GROUPED');
  const items=execution.queue.filter((item)=>sameExecutionGroup(current,item));
  if(items.length<2)throw new Error('M26_EXECUTION_GROUP_ROUND_INVALID');
  const roundCounts=[...new Set(items.map((item)=>Number(item.sets||0)))];
  if(roundCounts.length!==1)throw new Error('M26_EXECUTION_GROUP_ROUND_ASYMMETRIC');
  if(items.some((item)=>Number(item.sets||0)>=100))throw new Error('M26_EXECUTION_SET_LIMIT');
  for(const item of items)item.sets=Number(item.sets||0)+1;
  const totalRounds=Number(items[0].sets||0);
  markFinalFeedbackDraftNeedsReview(execution,'group_round_added_after_closeout');
  event(execution,'GROUP_ROUND_ADDED',{blockId:current.blockId,groupType:current.groupType,totalRounds},actor);
  return execution;
}
export function addExtraGroupRoundAndAdvance(execution,session,{actor=null}={}){
  if(execution?.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  requireCoachActor(actor);
  const current=execution.queue?.[execution.index];if(!current)throw new Error('M26_EXECUTION_STEP_MISSING');
  if(!isGroupedQueueItem(current))throw new Error('M26_EXECUTION_EXTRA_GROUP_ROUND_NOT_GROUPED');
  const step=currentStep(execution,session);if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
  ensureDeviationStores(execution);
  if(!executionResultForStep(execution,step)&&!skippedSetForStep(execution,step))throw new Error('M26_EXECUTION_SET_NOT_RECORDED');
  const indexes=[];for(let i=0;i<execution.queue.length;i+=1)if(sameExecutionGroup(current,execution.queue[i]))indexes.push(i);
  if(indexes.length<2||execution.index!==indexes[indexes.length-1])throw new Error('M26_EXECUTION_EXTRA_GROUP_ROUND_ORDER_REQUIRED');
  const totalRounds=Number(current.sets||0);
  if(Number(execution.setIndex)+1!==totalRounds)throw new Error('M26_EXECUTION_EXTRA_GROUP_ROUND_LAST_ROUND_REQUIRED');
  addExecutionGroupRound(execution,{actor});
  execution.restUntil=null;
  delete execution.reviewingHistory;
  clearActiveSetDraft(execution);
  execution.index=indexes[0];
  execution.setIndex=totalRounds;
  event(execution,'STEP_ADVANCED',{index:execution.index,setIndex:execution.setIndex},actor);
  event(execution,'EXTRA_GROUP_ROUND_STARTED',{blockId:current.blockId,groupType:current.groupType,previousTotalRounds:totalRounds,totalRounds:totalRounds+1,roundNumber:totalRounds+1},actor);
  return execution;
}
export function executionStructureUndoState(execution){
  if(execution?.status!=='active')return null;
  const events=Array.isArray(execution?.events)?execution.events:[];
  const last=events[events.length-1]||null;
  const current=execution?.queue?.[execution.index]||null;
  if(!last||!current)return null;
  if(last.type==='EXERCISE_ADDED'){
    const queueIndex=Number(last.payload?.queueIndex);
    if(!Number.isInteger(queueIndex)||queueIndex<=Number(execution.index)||queueIndex<0||queueIndex>=execution.queue.length)return null;
    const added=execution.queue[queueIndex];
    if(!added?.liveAdded||added.exerciseId!==last.payload?.exerciseId)return null;
    for(let setNumber=1;setNumber<=Number(added.sets||0);setNumber+=1){
      const step={...added,setNumber,totalSets:added.sets};
      if(executionResultForStep(execution,step,setNumber)||skippedSetForStep(execution,step,setNumber))return null;
    }
    return Object.freeze({kind:'exercise',label:'Deshacer ejercicio añadido'});
  }
  if(last.type==='SET_ADDED'){
    const totalSets=Number(last.payload?.totalSets||0);
    if(last.payload?.exerciseId!==current.exerciseId||totalSets!==Number(current.sets||0)||totalSets<=1)return null;
    const step={...current,setNumber:totalSets,totalSets};
    if(executionResultForStep(execution,step,totalSets)||skippedSetForStep(execution,step,totalSets))return null;
    return Object.freeze({kind:'set',label:'Deshacer serie añadida'});
  }
  if(last.type==='GROUP_ROUND_ADDED'){
    const totalRounds=Number(last.payload?.totalRounds||0);
    if(!isGroupedQueueItem(current)||last.payload?.blockId!==current.blockId||totalRounds<=1)return null;
    const items=execution.queue.filter((item)=>sameExecutionGroup(current,item));
    if(items.length<2||items.some((item)=>Number(item.sets||0)!==totalRounds))return null;
    for(const item of items){
      const step={...item,setNumber:totalRounds,totalSets:totalRounds};
      if(executionResultForStep(execution,step,totalRounds)||skippedSetForStep(execution,step,totalRounds))return null;
    }
    return Object.freeze({kind:'round',label:'Deshacer ronda añadida'});
  }
  return null;
}
export function undoLastExecutionStructureChange(execution,{actor=null}={}){
  if(execution?.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  requireCoachActor(actor);
  const state=executionStructureUndoState(execution);
  if(!state)throw new Error('M26_EXECUTION_STRUCTURE_UNDO_UNAVAILABLE');
  const current=execution.queue[execution.index];
  if(state.kind==='exercise'){
    const last=execution.events[execution.events.length-1];
    const queueIndex=Number(last?.payload?.queueIndex);
    const added=execution.queue[queueIndex];
    if(!added?.liveAdded||added.exerciseId!==last?.payload?.exerciseId)throw new Error('M26_EXECUTION_STRUCTURE_UNDO_UNAVAILABLE');
    execution.queue.splice(queueIndex,1);
    markFinalFeedbackDraftNeedsReview(execution,'exercise_add_undone_after_closeout');
    event(execution,'EXERCISE_ADD_UNDONE',{exerciseId:added.exerciseId,queueIndex},actor);
    return execution;
  }
  if(state.kind==='set'){
    current.sets=Number(current.sets||0)-1;
    markFinalFeedbackDraftNeedsReview(execution,'set_add_undone_after_closeout');
    event(execution,'SET_ADD_UNDONE',{exerciseId:current.exerciseId,totalSets:current.sets},actor);
    return execution;
  }
  const items=execution.queue.filter((item)=>sameExecutionGroup(current,item));
  for(const item of items)item.sets=Number(item.sets||0)-1;
  const totalRounds=Number(items[0]?.sets||0);
  markFinalFeedbackDraftNeedsReview(execution,'group_round_add_undone_after_closeout');
  event(execution,'GROUP_ROUND_ADD_UNDONE',{blockId:current.blockId,groupType:current.groupType,totalRounds},actor);
  return execution;
}
export function addExtraSetAndAdvance(execution,session,{actor=null}={}){
  if(execution?.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  requireCoachActor(actor);
  const item=execution.queue?.[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  if(isGroupedQueueItem(item))throw new Error('M26_EXECUTION_EXTRA_SET_GROUP_ORDER_REQUIRED');
  const step=currentStep(execution,session);if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
  ensureDeviationStores(execution);
  if(!executionResultForStep(execution,step)&&!skippedSetForStep(execution,step))throw new Error('M26_EXECUTION_SET_NOT_RECORDED');
  if(execution.setIndex+1!==Number(item.sets||0))throw new Error('M26_EXECUTION_EXTRA_SET_LAST_SET_REQUIRED');
  if(Number(item.sets||0)>=100)throw new Error('M26_EXECUTION_SET_LIMIT');
  const previousTotalSets=Number(item.sets||0);
  addExecutionSet(execution,{actor});
  execution.restUntil=null;
  delete execution.reviewingHistory;
  clearActiveSetDraft(execution);
  execution.setIndex=previousTotalSets;
  event(execution,'STEP_ADVANCED',{index:execution.index,setIndex:execution.setIndex},actor);
  event(execution,'EXTRA_SET_STARTED',{exerciseId:item.exerciseId,previousTotalSets,totalSets:Number(item.sets||0),setNumber:Number(execution.setIndex)+1},actor);
  return execution;
}
export function skipExecutionSet(execution,session,{reason,actor=null}={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  const step=currentStep(execution,session);if(!step)throw new Error('M26_EXECUTION_STEP_MISSING');
  const safeReason=requireReason(reason,'M26_EXECUTION_SKIP_SET_REASON_REQUIRED');
  const scoped=requiresScopedEntry(execution,step);
  const key=storageKeyForStep(execution,step);
  if(executionResultForStep(execution,step))throw new Error('M26_EXECUTION_SKIP_RECORDED_SET_FORBIDDEN');
  ensureDeviationStores(execution);
  const entry={...(scoped?{blockId:step.blockId||null}:{}),exerciseId:step.exerciseId,setNumber:step.setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor)};
  execution.skippedSets[key]=entry;
  markFinalFeedbackDraftNeedsReview(execution,'set_skipped_after_closeout');
  event(execution,'SET_SKIPPED',entry,actor);
  return moveForward(execution,actor);
}
export function skipExecutionExercise(execution,session,{reason,actor=null}={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  const item=execution.queue[execution.index];if(!item)throw new Error('M26_EXECUTION_STEP_MISSING');
  const safeReason=requireReason(reason,'M26_EXECUTION_SKIP_EXERCISE_REASON_REQUIRED');
  ensureDeviationStores(execution);
  const currentStepSnapshot={...item,setNumber:execution.setIndex+1,totalSets:item.sets};
  const firstIndex=executionResultForStep(execution,currentStepSnapshot)?execution.setIndex+1:execution.setIndex;
  if(firstIndex>=item.sets)throw new Error('M26_EXECUTION_SKIP_EXERCISE_NOTHING_REMAINING');
  let scopedOccurrence=false;
  for(let i=firstIndex;i<item.sets;i+=1){
    const setNumber=i+1;
    const step={...item,setNumber,totalSets:item.sets};
    const scoped=requiresScopedEntry(execution,step,setNumber);
    const key=storageKeyForStep(execution,step,setNumber);
    scopedOccurrence=scopedOccurrence||scoped;
    execution.skippedSets[key]={...(scoped?{blockId:item.blockId||null}:{}),exerciseId:item.exerciseId,setNumber,reason:safeReason,at:now(),actor:actorSnapshot(actor),source:'exercise_skip'};
  }
  const deviation={...(scopedOccurrence?{blockId:item.blockId||null}:{}),exerciseId:item.exerciseId,fromSetNumber:firstIndex+1,toSetNumber:item.sets,reason:safeReason,at:now(),actor:actorSnapshot(actor)};
  execution.skippedExercises.push(deviation);
  markFinalFeedbackDraftNeedsReview(execution,'exercise_skipped_after_closeout');
  event(execution,'EXERCISE_SKIPPED',deviation,actor);
  clearActiveSetDraft(execution);
  return moveForward(execution,actor);
}
export function addExecutionExercise(execution,{exerciseId,catalog,sets,reps,restSeconds,tempo,targetRpe,targetRir,position='next',actor=null}={}){
  if(execution.status!=='active')throw new Error('M26_EXECUTION_NOT_ACTIVE');
  requireCoachActor(actor);
  if(!catalog?.has(exerciseId))throw new Error('M26_EXECUTION_ADD_EXERCISE_NOT_IN_CATALOG');
  const safeSets=Number(sets),safeRest=Number(restSeconds),safeRpe=Number(targetRpe),safeRir=Number(targetRir);
  if(!Number.isInteger(safeSets)||safeSets<1||safeSets>100)throw new Error('M26_EXECUTION_ADD_EXERCISE_SETS_INVALID');
  if(!Number.isFinite(safeRest)||safeRest<0||safeRest>3600)throw new Error('M26_EXECUTION_ADD_EXERCISE_REST_INVALID');
  if(!Number.isFinite(safeRpe)||safeRpe<1||safeRpe>10)throw new Error('M26_EXECUTION_ADD_EXERCISE_RPE_INVALID');
  if(!Number.isFinite(safeRir)||safeRir<0||safeRir>10)throw new Error('M26_EXECUTION_ADD_EXERCISE_RIR_INVALID');
  const item={blockId:`live:${uid()}`,exerciseId,sets:safeSets,prescription:{reps:String(reps||'').trim().slice(0,40)||null,restSeconds:safeRest,tempo:String(tempo||'').trim().slice(0,40)||null,targetRpe:safeRpe,targetRir:safeRir,alternativeId:null},liveAdded:true};
  let insertAt=execution.queue.length;
  if(position!=='end'){
    insertAt=Math.min(execution.queue.length,execution.index+1);
    const current=execution.queue[execution.index];
    if(isGroupedQueueItem(current)){
      while(insertAt<execution.queue.length&&sameExecutionGroup(current,execution.queue[insertAt]))insertAt+=1;
    }
  }
  execution.queue.splice(insertAt,0,item);
  markFinalFeedbackDraftNeedsReview(execution,'exercise_added_after_closeout');
  event(execution,'EXERCISE_ADDED',{exerciseId,sets:safeSets,prescription:item.prescription,position:position==='end'?'end':'next',queueIndex:insertAt},actor);
  return execution;
}
export function finishExecution(execution,feedback={}, {actor=null}={}){
  if(execution.status!=='awaiting_feedback')throw new Error('M26_EXECUTION_NOT_COMPLETE');
  const sessionRpe=Number(feedback.sessionRpe||0);if(sessionRpe<1||sessionRpe>10)throw new Error('M26_EXECUTION_SESSION_RPE_REQUIRED');
  if(!String(feedback.comment||'').trim())throw new Error('M26_EXECUTION_FEEDBACK_REQUIRED');
  const pain=Boolean(feedback.pain),painNotes=pain?String(feedback.painNotes||'').trim().slice(0,1000):'';if(pain&&!painNotes)throw new Error('M26_EXECUTION_PAIN_NOTES_REQUIRED');
  clearActiveSetDraft(execution);clearFinalFeedbackDraft(execution);delete execution.reviewingHistory;freezeExecutionClock(execution);execution.feedback={sessionRpe,comment:String(feedback.comment).trim().slice(0,2000),pain,painNotes};execution.status='completed';execution.completedAt=now();
  event(execution,'SESSION_COMPLETED',execution.feedback,actor);return execution;
}
export function buildExecutionCommand(execution,baseRevision=0){if(execution.status!=='completed')throw new Error('M26_EXECUTION_NOT_COMPLETED');return {operationId:execution.id,type:'EJECUCION_COMPLETAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,payload:{patch:remoteSnapshot(execution)}};}
export function buildStartExecutionCommand(execution,{appointmentId,sessionRevision=0}={}){if(!execution?.sessionId||!execution?.id||!appointmentId)throw new Error('M26_EXECUTION_START_CONTEXT_REQUIRED');return {type:'SESION_INICIAR',entityType:'session',entityId:execution.sessionId,clientId:execution.clientId,baseRevision:sessionRevision,payload:{executionId:execution.id,appointmentId,patch:{activeExecutionId:execution.id}}};}
export function buildProgressExecutionCommand(execution,baseRevision=execution?.revision||0){if(!['active','awaiting_feedback'].includes(execution.status))throw new Error('M26_EXECUTION_PROGRESS_INVALID');return {type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,conflictSensitive:true,payload:{progressSnapshot:remoteSnapshot(execution)}};}
export function buildPauseExecutionCommand(execution,baseRevision=execution?.revision||0){if(execution.status!=='paused')throw new Error('M26_EXECUTION_PAUSE_TARGET_INVALID');return {type:'EJECUCION_PAUSAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,payload:{patch:remoteSnapshot(execution)}};}
export function buildResumeExecutionCommand(execution,baseRevision=execution?.revision||0){if(execution.status!=='active')throw new Error('M26_EXECUTION_RESUME_TARGET_INVALID');return {type:'EJECUCION_REANUDAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,payload:{patch:remoteSnapshot(execution)}};}
export function buildCancelExecutionCommand(execution,reason=execution?.cancellationReason,baseRevision=execution?.revision||0){if(execution.status!=='cancelled')throw new Error('M26_EXECUTION_CANCEL_TARGET_INVALID');if(!String(reason||'').trim())throw new Error('M26_EXECUTION_CANCEL_REASON_REQUIRED');return {type:'EJECUCION_CANCELAR',entityType:'session_execution',entityId:execution.id,clientId:execution.clientId,baseRevision,reason:String(reason).trim().slice(0,500),payload:{patch:remoteSnapshot(execution)}};}
