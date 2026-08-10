import { validateSessionProposal } from '../intelligence/session-engine.js';
import {createM26Id} from '../platform/id.js';
const GROUP_TYPES=new Set(['biserie','triserie','circuito','amrap','tabata']);
function positiveInt(value,fallback,{min=1,max=100}={}){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;}
function boundedNumber(value,fallback,{min=0,max=10}={}){const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:fallback;}
function text(value,fallback='',max=120){const out=String(value??fallback).trim();return out.slice(0,max)||String(fallback);}
function normalizePrescription(input={},fallback={}){return {
  reps:text(input.reps,fallback.reps||'8–12',40),
  restSeconds:positiveInt(input.restSeconds,fallback.restSeconds||60,{min:1,max:3600}),
  tempo:text(input.tempo,fallback.tempo||'controlado',40),
  targetRpe:boundedNumber(input.targetRpe,fallback.targetRpe||7,{min:1,max:10}),
  targetRir:boundedNumber(input.targetRir,fallback.targetRir??3,{min:0,max:10}),
  alternativeId:input.alternativeId||fallback.alternativeId||null,
};}
export function createSessionDraft({clientId,title='Sesión IBERFIT',durationMinutes=50}={}){if(!clientId)throw new Error('M26_SESSION_CLIENT_REQUIRED');return {id:createM26Id(),clientId,title:text(title,'Sesión IBERFIT',120),durationMinutes:positiveInt(durationMinutes,50,{min:10,max:240}),status:'draft',previewAccepted:false,blocks:[],revision:0};}
export function invalidateSessionPreview(draft){draft.previewAccepted=false;return draft;}
export function addCatalogExercise(draft,exerciseId,catalog,prescription={}){const ex=catalog.get(exerciseId);if(!ex)throw new Error('M26_SESSION_EXERCISE_NOT_IN_CATALOG');if(draft.activeGroupId){const group=draft.blocks.find((b)=>b.id===draft.activeGroupId);if(!group)throw new Error('M26_SESSION_ACTIVE_GROUP_MISSING');group.prescriptions=group.prescriptions||{};if(!group.exerciseIds.includes(exerciseId)){group.exerciseIds.push(exerciseId);group.prescriptions[exerciseId]=normalizePrescription(prescription);}const limit=group.type==='biserie'?2:group.type==='triserie'?3:null;if(limit&&group.exerciseIds.length>=limit)delete draft.activeGroupId;return invalidateSessionPreview(draft);}draft.blocks.push({id:createM26Id(),type:'exercise',exerciseId,name:ex.name_es,sets:positiveInt(prescription.sets,3),...normalizePrescription(prescription)});return invalidateSessionPreview(draft);}
export function addTrainingGroup(draft,type,exerciseIds=[]){if(!GROUP_TYPES.has(type))throw new Error('M26_SESSION_GROUP_INVALID');const id=createM26Id();const unique=[...new Set(exerciseIds)];draft.blocks.push({id,type,exerciseIds:unique,rounds:type==='tabata'?8:3,prescriptions:Object.fromEntries(unique.map((exerciseId)=>[exerciseId,normalizePrescription({})]))});draft.activeGroupId=id;invalidateSessionPreview(draft);return draft;}
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
export function removeSessionBlock(draft,blockId){draft.blocks=draft.blocks.filter((block)=>block.id!==blockId);if(draft.activeGroupId===blockId)delete draft.activeGroupId;return invalidateSessionPreview(draft);}
export function moveSessionBlock(draft,blockId,direction){const index=draft.blocks.findIndex((block)=>block.id===blockId);if(index<0)throw new Error('M26_SESSION_BLOCK_MISSING');const delta=direction==='up'?-1:direction==='down'?1:0;if(!delta)throw new Error('M26_SESSION_MOVE_INVALID');const target=index+delta;if(target<0||target>=draft.blocks.length)return draft;[draft.blocks[index],draft.blocks[target]]=[draft.blocks[target],draft.blocks[index]];return invalidateSessionPreview(draft);}
export function updateSessionDraft(draft,field,value){if(field==='title')draft.title=text(value,'Sesión IBERFIT',120);else if(field==='durationMinutes')draft.durationMinutes=positiveInt(value,draft.durationMinutes||50,{min:10,max:240});else throw new Error('M26_SESSION_DRAFT_FIELD_INVALID');return invalidateSessionPreview(draft);}
export function updateSessionBlock(draft,{blockId,field,value,exerciseId=null,catalog}={}){const block=draft.blocks.find((item)=>item.id===blockId);if(!block)throw new Error('M26_SESSION_BLOCK_MISSING');if(block.type==='exercise'){
  if(field==='sets')block.sets=positiveInt(value,block.sets||3);
  else if(['reps','tempo'].includes(field))block[field]=text(value,block[field],40);
  else if(field==='restSeconds')block.restSeconds=positiveInt(value,block.restSeconds||60,{min:1,max:3600});
  else if(field==='targetRpe')block.targetRpe=boundedNumber(value,block.targetRpe||7,{min:1,max:10});
  else if(field==='targetRir')block.targetRir=boundedNumber(value,block.targetRir??3,{min:0,max:10});
  else if(field==='alternativeId'){if(value&&!catalog?.has(value))throw new Error('M26_SESSION_ALTERNATIVE_NOT_IN_CATALOG');block.alternativeId=value||null;}
  else throw new Error('M26_SESSION_BLOCK_FIELD_INVALID');
 }else{
  if(field==='rounds')block.rounds=positiveInt(value,block.rounds||3,{min:1,max:100});
  else {if(!exerciseId||!block.exerciseIds?.includes(exerciseId))throw new Error('M26_SESSION_GROUP_EXERCISE_MISSING');if(field==='alternativeId'&&value&&!catalog?.has(value))throw new Error('M26_SESSION_ALTERNATIVE_NOT_IN_CATALOG');block.prescriptions=block.prescriptions||{};const current=block.prescriptions[exerciseId]||normalizePrescription({});block.prescriptions[exerciseId]=normalizePrescription({[field]:value},current);}
 }
 return invalidateSessionPreview(draft);}
export function acceptSessionPreview(draft,catalog){const check=validateSessionDraft(draft,catalog);if(!check.ok)throw new Error(`M26_SESSION_DRAFT_INVALID:${check.errors.join(',')}`);draft.previewAccepted=true;return draft;}
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
   if(!Number.isInteger(sets)||sets<1||sets>100||!String(b.reps||'').trim()||String(b.reps).length>40||!Number.isFinite(rest)||rest<1||rest>3600||!Number.isFinite(rpe)||rpe<1||rpe>10||!Number.isFinite(rir)||rir<0||rir>10||String(b.tempo||'').length>40)errors.push(`prescription:${b.exerciseId}`);
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
    if(!p||!String(p.reps||'').trim()||String(p.reps).length>40||!Number.isFinite(rest)||rest<1||rest>3600||!Number.isFinite(rpe)||rpe<1||rpe>10||!Number.isFinite(rir)||rir<0||rir>10||String(p.tempo||'').length>40)errors.push(`prescription:${id}`);
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
