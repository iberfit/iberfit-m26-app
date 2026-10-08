import { validateSessionProposal } from '../intelligence/session-engine.js';
import {createM26Id} from '../platform/id.js';
import {EXERCISE_METRIC_KEYS,exerciseMeasurementProfile,initialExercisePrescription,metricValueValid,hasCardioPrescription} from '../exercises/measurement-profiles.js';
const GROUP_TYPES=new Set(['biserie','triserie','circuito','amrap','tabata']);
function positiveInt(value,fallback,{min=1,max=100}={}){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;}
function boundedNumber(value,fallback,{min=0,max=10}={}){const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:fallback;}
function text(value,fallback='',max=120){const out=String(value??fallback).trim();return out.slice(0,max)||String(fallback);}
function optionalText(input,fallback='',max=500){
  const candidate=input===undefined||input===null?fallback:input;
  return String(candidate??'').trim().slice(0,max);
}
function normalizePrescription(input={},fallback={},exercise={}){const defaults=initialExercisePrescription(exercise);return {
  ...Object.fromEntries(EXERCISE_METRIC_KEYS.map((key)=>[key,optionalText(input[key],fallback[key]??'',24)])),
  reps:optionalText(input.reps,fallback.reps??defaults.reps,40),
  plannedLoad:optionalText(input.plannedLoad,fallback.plannedLoad||'',80),
  restSeconds:positiveInt(input.restSeconds,fallback.restSeconds??defaults.restSeconds,{min:0,max:3600}),
  tempo:text(input.tempo,fallback.tempo??defaults.tempo??'controlado',40),
  targetRpe:boundedNumber(input.targetRpe,fallback.targetRpe??defaults.targetRpe??7,{min:1,max:10}),
  targetRir:boundedNumber(input.targetRir,fallback.targetRir??defaults.targetRir??3,{min:0,max:10}),
  prescriptionNotes:optionalText(input.prescriptionNotes,fallback.prescriptionNotes||'',1000),
  progression:optionalText(input.progression,fallback.progression||'',500),
  alternativeId:input.alternativeId||fallback.alternativeId||null,
};}
function draftSeedRecord(record){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?{...record,...record.body}
    :record||{};
}
function draftSeedClientId(record){
  const item=draftSeedRecord(record);
  return String(item.clientId??item.client_id??'').trim();
}
export function sessionDraftDefaultsFromState(state,clientId){
  const safeClientId=String(clientId||'').trim();
  if(!safeClientId)throw new Error('M26_SESSION_CLIENT_REQUIRED');
  const collections=state?.collections||{};
  const cycle=(Array.isArray(collections.trainingCycles)?collections.trainingCycles:[])
    .map(draftSeedRecord)
    .find((item)=>draftSeedClientId(item)===safeClientId)||null;
  const profile=(Array.isArray(collections.clientProfiles)?collections.clientProfiles:[])
    .map(draftSeedRecord)
    .find((item)=>draftSeedClientId(item)===safeClientId)||null;
  const cycleDuration=cycle?.sessionDurationMinutes??cycle?.session_duration_minutes;
  const profileDuration=profile?.sessionDurationMinutes??profile?.session_duration_minutes;
  const durationMinutes=positiveInt(
    cycleDuration,
    positiveInt(profileDuration,50,{min:10,max:240}),
    {min:10,max:240},
  );
  return Object.freeze({
    clientId:safeClientId,
    durationMinutes,
    source:cycleDuration!==undefined&&cycleDuration!==null&&cycleDuration!==''
      ?'cycle'
      :profileDuration!==undefined&&profileDuration!==null&&profileDuration!==''
        ?'profile'
        :'default',
  });
}
export function createSessionDraft({clientId,title='Sesión IBERFIT',durationMinutes=50}={}){if(!clientId)throw new Error('M26_SESSION_CLIENT_REQUIRED');return {id:createM26Id(),clientId,title:text(title,'Sesión IBERFIT',120),durationMinutes:positiveInt(durationMinutes,50,{min:10,max:240}),status:'draft',previewAccepted:false,blocks:[],revision:0};}
function hasObservedQuantity(value,{integer=false}={}){
  if(value===undefined||value===null||String(value).trim()==='')return false;
  const quantity=Number(value);
  return Number.isFinite(quantity)&&quantity>=0&&(!integer||Number.isInteger(quantity));
}
export function exerciseMemoryDraftSuggestion(memory){
  const latest=memory?.latest;
  if(!latest)return null;
  const sets=positiveInt(latest.setCount,null,{min:1,max:100});
  const rows=Array.isArray(latest.sets)?latest.sets:[];
  const reference=[...rows].reverse().find((row)=>
    hasObservedQuantity(row?.reps,{integer:true})||
    hasObservedQuantity(row?.seconds)||
    String(row?.load?.raw||'').trim()
  )||null;
  const reps=hasObservedQuantity(reference?.reps,{integer:true})
    ?String(reference.reps)
    :hasObservedQuantity(reference?.seconds)
      ?`${reference.seconds} s`
      :'';
  const plannedLoad=optionalText(latest.lastLoad?.raw??reference?.load?.raw??'', '',80);
  if(!sets&&!reps&&!plannedLoad)return null;
  return Object.freeze({sets,reps,plannedLoad});
}
export function applyExerciseMemorySuggestion(draft,{blockId,exerciseId=null,memory,suggestion:providedSuggestion=null}={}){
  const suggestion=providedSuggestion||exerciseMemoryDraftSuggestion(memory);
  if(!suggestion)throw new Error('M26_SESSION_MEMORY_REFERENCE_UNAVAILABLE');
  const block=draft?.blocks?.find((item)=>item.id===blockId);
  if(!block)throw new Error('M26_SESSION_BLOCK_MISSING');
  if(block.type==='exercise'){
    if(exerciseId&&block.exerciseId!==exerciseId)throw new Error('M26_SESSION_MEMORY_REFERENCE_MISMATCH');
    if(suggestion.sets)block.sets=suggestion.sets;
    if(suggestion.reps)block.reps=suggestion.reps;
    if(suggestion.plannedLoad)block.plannedLoad=suggestion.plannedLoad;
  }else{
    if(!exerciseId||!block.exerciseIds?.includes(exerciseId))throw new Error('M26_SESSION_GROUP_EXERCISE_MISSING');
    block.prescriptions=block.prescriptions||{};
    const current=block.prescriptions[exerciseId]||normalizePrescription({});
    block.prescriptions[exerciseId]=normalizePrescription({
      ...(suggestion.reps?{reps:suggestion.reps}:{}),
      ...(suggestion.plannedLoad?{plannedLoad:suggestion.plannedLoad}:{}),
    },current);
  }
  return invalidateSessionPreview(draft);
}
export function invalidateSessionPreview(draft){draft.previewAccepted=false;return draft;}
export function addCatalogExercise(draft,exerciseId,catalog,prescription={}){
  const ex=catalog.get(exerciseId);
  if(!ex)throw new Error('M26_SESSION_EXERCISE_NOT_IN_CATALOG');
  if(draft.activeGroupId){
    const group=draft.blocks.find((b)=>b.id===draft.activeGroupId);
    if(!group)throw new Error('M26_SESSION_ACTIVE_GROUP_MISSING');
    if(!GROUP_TYPES.has(group.type)||!Array.isArray(group.exerciseIds))throw new Error('M26_SESSION_GROUP_INVALID');
    const limit=group.type==='biserie'?2:group.type==='triserie'?3:12;
    if(!group.exerciseIds.includes(exerciseId)){
      if(group.exerciseIds.length>=limit)throw new Error('M26_SESSION_GROUP_LIMIT_REACHED');
      group.prescriptions=group.prescriptions||{};
      group.exerciseIds.push(exerciseId);
      group.prescriptions[exerciseId]=normalizePrescription(prescription,{},ex);
    }
    if(group.exerciseIds.length>=limit)delete draft.activeGroupId;
    return invalidateSessionPreview(draft);
  }
  draft.blocks.push({id:createM26Id(),type:'exercise',exerciseId,name:ex.name_es,sets:positiveInt(prescription.sets,initialExercisePrescription(ex).sets),...normalizePrescription(prescription,{},ex)});
  return invalidateSessionPreview(draft);
}
export function addTrainingGroup(draft,type,exerciseIds=[]){
  if(!GROUP_TYPES.has(type))throw new Error('M26_SESSION_GROUP_INVALID');
  // Never orphan an unfinished group by overwriting its active identifier.
  if(draft.activeGroupId)throw new Error('M26_SESSION_ACTIVE_GROUP_OPEN');
  if(!Array.isArray(exerciseIds))throw new Error('M26_SESSION_GROUP_EXERCISES_INVALID');
  const unique=[...new Set(exerciseIds)];
  const limit=type==='biserie'?2:type==='triserie'?3:12;
  if(unique.length>limit)throw new Error('M26_SESSION_GROUP_LIMIT_REACHED');
  const id=createM26Id();
  draft.blocks.push({id,type,exerciseIds:unique,rounds:type==='tabata'?8:3,prescriptions:Object.fromEntries(unique.map((exerciseId)=>[exerciseId,normalizePrescription({})]))});
  if(unique.length<limit)draft.activeGroupId=id;
  return invalidateSessionPreview(draft);
}
export function closeTrainingGroup(draft){
  if(!draft.activeGroupId)return draft;
  const groupIndex=draft.blocks.findIndex((b)=>b.id===draft.activeGroupId);
  const group=draft.blocks[groupIndex];
  if(!group){delete draft.activeGroupId;return invalidateSessionPreview(draft);}
  const minimum=group.type==='biserie'?2:group.type==='triserie'?3:group.type==='circuito'?2:1;
  const exerciseIds=group.exerciseIds||[];
  if(exerciseIds.length<minimum){
    const individual=exerciseIds.map((exerciseId)=>({id:createM26Id(),type:'exercise',exerciseId,sets:positiveInt(group.rounds,3),...normalizePrescription(group.prescriptions?.[exerciseId]||{})}));
    draft.blocks.splice(groupIndex,1,...individual);
  }
  delete draft.activeGroupId;
  return invalidateSessionPreview(draft);
}
export function duplicateSessionBlock(draft,blockId){
  const index=draft.blocks.findIndex((block)=>block.id===blockId);
  if(index<0)throw new Error('M26_SESSION_BLOCK_MISSING');
  const copy=structuredClone(draft.blocks[index]);
  copy.id=createM26Id();
  draft.blocks.splice(index+1,0,copy);
  return invalidateSessionPreview(draft);
}
export function sessionBlockRemovalSnapshot(draft,blockId){const index=draft?.blocks?.findIndex((block)=>block.id===blockId)??-1;if(index<0)throw new Error('M26_SESSION_BLOCK_MISSING');return Object.freeze({draftId:String(draft?.id||''),index,block:structuredClone(draft.blocks[index]),wasActiveGroup:draft.activeGroupId===blockId});}
export function restoreSessionBlock(draft,snapshot={}){const block=snapshot?.block;if(!block?.id)throw new Error('M26_SESSION_BLOCK_UNDO_INVALID');if(snapshot?.draftId&&String(snapshot.draftId)!==String(draft?.id||''))throw new Error('M26_SESSION_BLOCK_UNDO_SCOPE_MISMATCH');if(draft.blocks.some((item)=>item.id===block.id))throw new Error('M26_SESSION_BLOCK_ALREADY_PRESENT');const rawIndex=Number(snapshot.index),index=Number.isInteger(rawIndex)?Math.max(0,Math.min(draft.blocks.length,rawIndex)):draft.blocks.length;draft.blocks.splice(index,0,structuredClone(block));if(snapshot.wasActiveGroup===true&&!draft.activeGroupId&&GROUP_TYPES.has(block.type))draft.activeGroupId=block.id;return invalidateSessionPreview(draft);}
export function removeSessionBlock(draft,blockId){draft.blocks=draft.blocks.filter((block)=>block.id!==blockId);if(draft.activeGroupId===blockId)delete draft.activeGroupId;return invalidateSessionPreview(draft);}
export function moveSessionBlock(draft,blockId,direction){const index=draft.blocks.findIndex((block)=>block.id===blockId);if(index<0)throw new Error('M26_SESSION_BLOCK_MISSING');const delta=direction==='up'?-1:direction==='down'?1:0;if(!delta)throw new Error('M26_SESSION_MOVE_INVALID');const target=index+delta;if(target<0||target>=draft.blocks.length)return draft;[draft.blocks[index],draft.blocks[target]]=[draft.blocks[target],draft.blocks[index]];return invalidateSessionPreview(draft);}
export function updateSessionDraft(draft,field,value){if(field==='title')draft.title=text(value,'Sesión IBERFIT',120);else if(field==='durationMinutes')draft.durationMinutes=positiveInt(value,draft.durationMinutes||50,{min:10,max:240});else throw new Error('M26_SESSION_DRAFT_FIELD_INVALID');return invalidateSessionPreview(draft);}
export function updateSessionBlock(draft,{blockId,field,value,exerciseId=null,catalog}={}){const block=draft.blocks.find((item)=>item.id===blockId);if(!block)throw new Error('M26_SESSION_BLOCK_MISSING');if(block.type==='exercise'){
  if(field==='sets')block.sets=positiveInt(value,block.sets||3);
  else if(['reps','tempo'].includes(field))block[field]=optionalText(value,block[field],40);
  else if(EXERCISE_METRIC_KEYS.includes(field))block[field]=optionalText(value,block[field]||'',24);
  else if(field==='plannedLoad')block.plannedLoad=optionalText(value,block.plannedLoad||'',80);
  else if(field==='prescriptionNotes')block.prescriptionNotes=optionalText(value,block.prescriptionNotes||'',1000);
  else if(field==='progression')block.progression=optionalText(value,block.progression||'',500);
  else if(field==='restSeconds')block.restSeconds=positiveInt(value,block.restSeconds??60,{min:0,max:3600});
  else if(field==='targetRpe')block.targetRpe=boundedNumber(value,block.targetRpe||7,{min:1,max:10});
  else if(field==='targetRir')block.targetRir=boundedNumber(value,block.targetRir??3,{min:0,max:10});
  else if(field==='alternativeId'){if(value&&!catalog?.has(value))throw new Error('M26_SESSION_ALTERNATIVE_NOT_IN_CATALOG');block.alternativeId=value||null;}
  else throw new Error('M26_SESSION_BLOCK_FIELD_INVALID');
 }else{
  if(field==='rounds')block.rounds=positiveInt(value,block.rounds||3,{min:1,max:100});
  else {if(!exerciseId||!block.exerciseIds?.includes(exerciseId))throw new Error('M26_SESSION_GROUP_EXERCISE_MISSING');if(field==='alternativeId'&&value&&!catalog?.has(value))throw new Error('M26_SESSION_ALTERNATIVE_NOT_IN_CATALOG');block.prescriptions=block.prescriptions||{};const current=block.prescriptions[exerciseId]||normalizePrescription({});if(!['reps','plannedLoad','restSeconds','tempo','targetRpe','targetRir','prescriptionNotes','progression','alternativeId',...EXERCISE_METRIC_KEYS].includes(field))throw new Error('M26_SESSION_BLOCK_FIELD_INVALID');block.prescriptions[exerciseId]=normalizePrescription({[field]:value},current,catalog?.get?.(exerciseId));}
 }
 return invalidateSessionPreview(draft);}
export function acceptSessionPreview(draft,catalog){const check=validateSessionDraft(draft,catalog);if(!check.ok)throw new Error(`M26_SESSION_DRAFT_INVALID:${check.errors.join(',')}`);draft.previewAccepted=true;return draft;}
function metricErrors(p,exercise){
 const profile=exerciseMeasurementProfile(exercise);
 const invalid=EXERCISE_METRIC_KEYS.filter((key)=>!metricValueValid(key,p?.[key]));
 if(profile.cardio&&!hasCardioPrescription(p))invalid.push('cardio_goal_missing');
 if(profile.kind==='carry'&&!String(p?.reps||'').trim()&&!hasCardioPrescription(p))invalid.push('carry_goal_missing');
 if(profile.kind==='intervals'&&p?.intervalRepetitions&&!p?.intervalWorkSeconds)invalid.push('interval_work_missing');
 return invalid;
}
export function validateSessionDraft(draft,catalog){
 const errors=[],seenBlocks=new Set();
 if(!draft?.clientId)errors.push('clientId');
 if(!String(draft?.title||'').trim()||String(draft.title).length>120)errors.push('title');
 const duration=Number(draft?.durationMinutes);if(!Number.isInteger(duration)||duration<10||duration>240)errors.push('durationMinutes');
 if(!Array.isArray(draft?.blocks)||!draft.blocks.length||draft.blocks.length>100)errors.push('blocks');
 for(const b of draft?.blocks||[]){
  if(!b?.id||seenBlocks.has(b.id)){errors.push(`blockId:${b?.id||'missing'}`);continue;}seenBlocks.add(b.id);
  if(b.type==='exercise'){
   const sets=Number(b.sets),rest=Number(b.restSeconds),rpe=Number(b.targetRpe),rir=Number(b.targetRir);
   if(!catalog.has(b.exerciseId))errors.push(`exercise:${b.exerciseId}`);
   if(!Number.isInteger(sets)||sets<1||sets>100||(!['endurance','intervals','carry'].includes(exerciseMeasurementProfile(catalog.get(b.exerciseId)).kind)&&!String(b.reps||'').trim())||String(b.reps||'').length>40||String(b.plannedLoad||'').length>80||!Number.isFinite(rest)||rest<0||rest>3600||!Number.isFinite(rpe)||rpe<1||rpe>10||!Number.isFinite(rir)||rir<0||rir>10||String(b.tempo||'').length>40||String(b.prescriptionNotes||'').length>1000||String(b.progression||'').length>500)errors.push(`prescription:${b.exerciseId}`);
   if(metricErrors(b,catalog.get(b.exerciseId)).length)errors.push(`metrics:${b.exerciseId}`);
   if(b.alternativeId&&(!catalog.has(b.alternativeId)||b.alternativeId===b.exerciseId))errors.push(`alternative:${b.exerciseId}`);
  }else{
   if(!GROUP_TYPES.has(b.type)){errors.push(`groupType:${b.id}`);continue;}
   const ids=Array.isArray(b.exerciseIds)?b.exerciseIds:[],unique=[...new Set(ids)];
   const min=b.type==='biserie'?2:b.type==='triserie'?3:b.type==='circuito'?2:1;const max=b.type==='biserie'?2:b.type==='triserie'?3:12;
   if(ids.length!==unique.length||ids.length<min||ids.length>max)errors.push(`group:${b.id}`);
   const rounds=Number(b.rounds);if(!Number.isInteger(rounds)||rounds<1||rounds>100)errors.push(`rounds:${b.id}`);
   for(const id of ids){
    if(!catalog.has(id))errors.push(`exercise:${id}`);
    const p=b.prescriptions?.[id],rest=Number(p?.restSeconds),rpe=Number(p?.targetRpe),rir=Number(p?.targetRir);
    if(!p||(!['endurance','intervals','carry'].includes(exerciseMeasurementProfile(catalog.get(id)).kind)&&!String(p.reps||'').trim())||String(p.reps||'').length>40||String(p.plannedLoad||'').length>80||!Number.isFinite(rest)||rest<0||rest>3600||!Number.isFinite(rpe)||rpe<1||rpe>10||!Number.isFinite(rir)||rir<0||rir>10||String(p.tempo||'').length>40||String(p.prescriptionNotes||'').length>1000||String(p.progression||'').length>500)errors.push(`prescription:${id}`);
    if(metricErrors(p,catalog.get(id)).length)errors.push(`metrics:${id}`);
    if(p?.alternativeId&&(!catalog.has(p.alternativeId)||p.alternativeId===id))errors.push(`alternative:${id}`);
   }
  }
 }
 return {ok:errors.length===0,errors:[...new Set(errors)]};
}
export function buildPublishSessionCommand(draft,catalog,baseRevision=0){
 const check=validateSessionDraft(draft,catalog);if(!check.ok)throw new Error(`M26_SESSION_DRAFT_INVALID:${check.errors.join(',')}`);
 if(draft.previewAccepted!==true)throw new Error('M26_SESSION_PREVIEW_REQUIRED');
 const patch=structuredClone(draft);delete patch.activeGroupId;
 patch.status='published';patch.visibleToClient=true;patch.publishedAt=new Date().toISOString();
 return {type:'SESION_PUBLICAR',entityType:'session',entityId:draft.id,clientId:draft.clientId,baseRevision,previewAccepted:true,payload:{patch}};
}
export function importAiProposalAsDraft(proposal,catalog){const check=validateSessionProposal(proposal,catalog);if(!check.ok)throw new Error(`M26_AI_PROPOSAL_INVALID:${check.errors.join(',')}`);const draft=createSessionDraft({clientId:proposal.clientId,durationMinutes:proposal.estimatedMinutes});for(const item of proposal.exercises)addCatalogExercise(draft,item.exerciseId,catalog,item);return draft;}
