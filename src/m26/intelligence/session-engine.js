const DEFAULT_PATTERNS=['sentadilla','bisagra','empuje','tracción','core','locomoción'];
function n(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function hasAny(value,needles){const x=n(value);return needles.some(y=>x.includes(n(y)));}
function rank(v){return ({inicial:1,intermedio:2,avanzado:3})[n(v)]||2;}
function optionalAge(v){if(v===null||v===undefined||v==='')return null;const value=Number(v);return Number.isFinite(value)?value:null;}
function assertInput(input,catalog){const required=['clientId','goal','durationMinutes','experience','modality'];const missing=required.filter(k=>input[k]===undefined||input[k]===null||input[k]==='');if(missing.length)throw new Error(`M26_SESSION_INPUT_REQUIRED:${missing.join(',')}`);if(!catalog?.count||catalog.count<367)throw new Error('M26_SESSION_CATALOG_REQUIRED');if(Number(input.durationMinutes)<20||Number(input.durationMinutes)>120)throw new Error('M26_SESSION_DURATION_INVALID');}
function restrictionTokens(input){return [...(input.restrictions||[]),...(input.painAreas||[]),...(input.contraindications||[])].map(n).filter(Boolean);}
function safe(ex,input){const text=n([ex.name_es,ex.pattern,ex.intent,...(ex.precautions||[]),...(ex.tags||[])].join(' '));return !restrictionTokens(input).some(r=>text.includes(r));}
function equipmentAllowed(ex,equipment=[]){if(!equipment?.length)return hasAny(ex.equipment,['sin equipo','peso corporal']);return hasAny(ex.equipment,['sin equipo','peso corporal',...equipment]);}
function historyContinuity(ex,input){const index=(input.recentExerciseIds||[]).indexOf(ex.id);if(index<0)return 0;return Math.max(2,8-index);}
function adaptive(input){const d=input.adaptiveContext?.decision||{};return {level:d.level||'normal',reason:d.reason||'not_provided',progressionAllowed:d.progressionAllowed===true,setAdjustment:Number(d.setAdjustment||0),rpeAdjustment:Number(d.rpeAdjustment||0),restAdjustment:Number(d.restAdjustment||0),durationFactor:Number(d.durationFactor||1),patternLimit:Math.max(3,Math.min(6,Number(d.patternLimit||6))),structure:d.structure||null};}
function assertAdaptive(input){const a=adaptive(input);if(a.level==='hold'&&input.coachOverride!==true)throw new Error('M26_SESSION_SAFETY_REVIEW_REQUIRED');return a;}
function score(ex,input,pattern){let s=0;if(hasAny(ex.pattern,[pattern]))s+=45;if(hasAny(ex.intent,[input.goal]))s+=24;if(equipmentAllowed(ex,input.equipment))s+=14;s-=Math.abs(rank(ex.difficulty)-rank(input.experience))*9;s+=historyContinuity(ex,input);if(ex.review_status==='validado_nucleo')s+=5;if(ex.media_status==='validado')s+=4;if((input.preferredExerciseIds||[]).includes(ex.id))s+=10;return s;}
function historyFor(input,exerciseId){return Array.isArray(input.performanceHistory?.[exerciseId])?input.performanceHistory[exerciseId]:[];}
function progressionEvidence(history=[]){
  const recent=history.slice(0,2);
  if(recent.length<2)return {ready:false,reason:'menos de dos exposiciones recientes comparables'};
  const rpes=recent.map((x)=>Number(x.averageRpe)).filter(Number.isFinite);
  const rirs=recent.map((x)=>Number(x.averageRir)).filter(Number.isFinite);
  if(rpes.length<2)return {ready:false,reason:'faltan RPE comparables del ejercicio'};
  if(rpes.some((value)=>value>7.5))return {ready:false,reason:'el esfuerzo reciente no deja margen suficiente'};
  if(rirs.length&&rirs.some((value)=>value<2))return {ready:false,reason:'el RIR reciente aconseja mantener'};
  return {ready:true,reason:'dos exposiciones recientes con margen de esfuerzo'};
}
function loadInstruction(previous,a,history){
  if(previous===null||previous===undefined)return 'Seleccionar carga que permita completar el rango con técnica estable; el entrenador decide la carga final';
  if(!a.progressionAllowed)return `Partir desde ${previous} kg y ajustar para mantener el RPE objetivo; el contexto actual no autoriza proponer progresión; el entrenador decide`;
  const evidence=progressionEvidence(history);
  if(!evidence.ready)return `Mantener como referencia ${previous} kg; no se propone progresión automática porque ${evidence.reason}; el entrenador decide`;
  const low=Math.round(previous*1.025*10)/10,high=Math.round(previous*1.05*10)/10;
  return `Valorar ${low}–${high} kg solo si técnica y RPE se mantienen; ${evidence.reason}; el entrenador decide`;
}
function prescription(ex,input,index,a){
  const exp=n(input.experience),goal=n(input.goal),conditioning=hasAny(goal,['cardio','resistencia','acondicionamiento']),strength=hasAny(goal,['fuerza','hipertrofia','rendimiento']);
  const baseSets=conditioning?3:(exp==='inicial'?2:3),sets=Math.max(2,baseSets+a.setAdjustment);
  const reps=conditioning?'30–45 s':strength?(exp==='avanzado'?'6–10':'8–12'):'10–15';
  const rest=Math.max(30,(conditioning?30:(strength?75:45))+a.restAdjustment);
  const previous=input.previousLoads?.[ex.id]??null;
  const history=historyFor(input,ex.id);
  const baseRpe=exp==='inicial'?6:7;
  return {exerciseId:ex.id,name:ex.name_es,pattern:ex.pattern,sets,reps,restSeconds:rest,tempo:strength?'3-1-1':'controlado',targetRpe:Math.max(4,Math.min(8,baseRpe+a.rpeAdjustment)),targetRir:Math.max(2,exp==='inicial'?4:3-a.rpeAdjustment),loadInstruction:loadInstruction(previous,a,history),previousLoad:previous,historyCount:history.length,historyEvidence:history.slice(0,2),alternativeId:null,cues:ex.cues?.slice(0,3)||[],source:'catalog',coachEditable:true,adaptation:a.level};
}
function structureFor(input,count,a){if(a.structure)return {type:a.structure,groups:count};const goal=n(input.goal);if(hasAny(goal,['acondicionamiento','cardio']))return {type:'circuito',rounds:3,workSeconds:40,transitionSeconds:20};if(count>=6&&Number(input.durationMinutes)<=45)return {type:'biseries',groups:Math.ceil(count/2)};return {type:'series',groups:count};}
import {createM26Id} from '../platform/id.js';
export function generateSessionProposal(input,catalog){
  assertInput(input,catalog);const a=assertAdaptive(input);
  const requested=input.patterns?.length?input.patterns:DEFAULT_PATTERNS,patterns=requested.slice(0,a.patternLimit);
  const candidates=catalog.list().filter(ex=>safe(ex,input)&&equipmentAllowed(ex,input.equipment));
  if(candidates.length<patterns.length*2)throw new Error('M26_SESSION_NOT_ENOUGH_SAFE_EXERCISES');
  const used=new Set(),exercises=[];
  for(const pattern of patterns){
    const pick=candidates.filter(x=>!used.has(x.id)).map(ex=>({ex,s:score(ex,input,pattern)})).sort((x,y)=>y.s-x.s||x.ex.name_es.localeCompare(y.ex.name_es,'es'))[0]?.ex;
    if(!pick)continue;used.add(pick.id);exercises.push(prescription(pick,input,exercises.length,a));
  }
  for(const item of exercises){const alt=candidates.filter(x=>x.id!==item.exerciseId&&!used.has(x.id)&&n(x.pattern)===n(item.pattern)).sort((x,y)=>score(y,input,item.pattern)-score(x,input,item.pattern))[0];if(alt)item.alternativeId=alt.id;}
  const structure=structureFor(input,exercises.length,a);
  const estimatedMinutes=Math.max(20,Math.round(Number(input.durationMinutes)*a.durationFactor));
  const contextEvidence=input.adaptiveContext?.evidence||null;
  return Object.freeze({
    proposalId:createM26Id(),clientId:input.clientId,status:'proposal',requiresCoachApproval:true,coachApproved:false,requiresManualReview:a.level==='hold'||a.level==='reduced',
    rationale:{goal:input.goal,experience:input.experience,modality:input.modality,ageYears:optionalAge(input.ageYears),sexForNorms:input.sexForNorms||null,restrictions:restrictionTokens(input),equipment:[...(input.equipment||[])],catalogCount:catalog.count,progressionBasis:Object.keys(input.performanceHistory||{}).length?'historial confirmado por ejercicio':input.previousLoads?'historial de carga':'inicio conservador',adaptiveLevel:a.level,adaptiveReason:a.reason,adaptiveEvidence:contextEvidence,contextEvidence},
    warmup:{minutes:a.level==='normal'?8:10,focus:['movilidad específica','activación','ensayo técnico']},
    structure,
    exercises:Object.freeze(exercises.map(Object.freeze)),
    cooldown:{minutes:5,focus:['vuelta a la calma','registro de RPE y molestias']},
    estimatedMinutes,
    qualityChecks:Object.freeze({allFromCatalog:exercises.every(x=>catalog.get(x.exerciseId)),alternativesConcrete:exercises.every(x=>x.alternativeId),objectiveLoad:exercises.every(x=>x.loadInstruction&&x.targetRpe&&x.targetRir),restrictionScreened:true,adaptiveContextApplied:Boolean(input.adaptiveContext),historyAware:Object.keys(input.performanceHistory||{}).length>0,automaticProgression:false,reviewRequired:true})
  });
}
export function validateSessionProposal(proposal,catalog){const errors=[];if(!proposal?.requiresCoachApproval)errors.push('coachApprovalRequired');if(!proposal?.exercises?.length)errors.push('exercises');for(const item of proposal?.exercises||[]){if(!catalog.get(item.exerciseId))errors.push(`unknown:${item.exerciseId}`);if(!item.sets||!item.reps||!item.restSeconds||!item.loadInstruction)errors.push(`prescription:${item.exerciseId}`);if(!item.alternativeId||!catalog.get(item.alternativeId))errors.push(`alternative:${item.exerciseId}`);}return {ok:errors.length===0,errors};}
export function approveSessionProposal(proposal,coachId){if(!coachId)throw new Error('M26_SESSION_COACH_REQUIRED');return Object.freeze({...structuredClone(proposal),status:'approved',coachApproved:true,coachId,approvedAt:new Date().toISOString()});}
