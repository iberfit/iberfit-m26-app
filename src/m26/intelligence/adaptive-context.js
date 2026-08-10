import { computeProgressSummary,deriveAdherenceAlerts } from '../engagement/index.js';

function arr(value){return Array.isArray(value)?value:[];}
function first(record,...keys){for(const key of keys){const value=record?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function clientIdOf(record){return first(record,'clientId','client_id','clienteId','cliente_id');}
function dateOf(record){return first(record,'completedAt','completed_at','endedAt','ended_at','updatedAt','updated_at','createdAt','created_at');}
function safeDate(value){const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date:null;}
function unwrap(record){return record?.body&&typeof record.body==='object'?{...record,...record.body}:record;}
function rows(value){if(Array.isArray(value))return value;if(value&&typeof value==='object')return Object.values(value).filter((row)=>row&&typeof row==='object');return [];}
function setRows(execution){
  const source=unwrap(execution)||{};
  const candidates=[source.results,source.setResults,source.set_results,source.progressSnapshot?.results,source.progress_snapshot?.results];
  for(const candidate of candidates){const normalized=rows(candidate);if(normalized.length)return normalized;}
  return [];
}
function exerciseId(row){return first(row,'exerciseId','exercise_id','idEjercicio','exercise');}
function numeric(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function load(value){
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null;
  const match=String(value).trim().replace(',','.').match(/-?\d+(?:\.\d+)?/);
  if(!match)return null;
  const n=Number(match[0]);
  return Number.isFinite(n)&&n>=0?n:null;
}
function metric(row,...keys){return numeric(first(row,...keys));}
function latestExecutions(state,clientId,limit=8){
  return arr(state?.collections?.sessionExecutions)
    .filter((item)=>clientIdOf(item)===clientId)
    .map(unwrap)
    .sort((a,b)=>(safeDate(dateOf(b))?.getTime()||0)-(safeDate(dateOf(a))?.getTime()||0))
    .slice(0,limit);
}
function exposureFor(execution,id,exerciseRows){
  const loads=exerciseRows.map((row)=>load(first(row,'loadKg','load_kg','load','weightKg','weight_kg'))).filter((value)=>value!==null);
  const rpes=exerciseRows.map((row)=>metric(row,'rpe','RPE')).filter((value)=>value!==null);
  const rirs=exerciseRows.map((row)=>metric(row,'rir','RIR')).filter((value)=>value!==null);
  const reps=exerciseRows.map((row)=>metric(row,'reps','repetitions')).filter((value)=>value!==null);
  const completedAt=dateOf(execution);
  return Object.freeze({
    exerciseId:id,
    loadKg:loads.length?Math.max(...loads):null,
    averageRpe:rpes.length?rpes.reduce((a,b)=>a+b,0)/rpes.length:null,
    averageRir:rirs.length?rirs.reduce((a,b)=>a+b,0)/rirs.length:null,
    totalReps:reps.length?reps.reduce((a,b)=>a+b,0):null,
    completedAt:completedAt||null,
    setCount:exerciseRows.length,
  });
}
export function extractSessionHistory(executions=[]){
  const previousLoads={};
  const recentExerciseIds=[];
  const performanceHistory={};
  for(const execution of executions.map(unwrap)){
    const grouped=new Map();
    for(const row of setRows(execution)){
      const id=exerciseId(row);
      if(!id)continue;
      if(!grouped.has(id))grouped.set(id,[]);
      grouped.get(id).push(row);
    }
    for(const [id,exerciseRows] of grouped){
      if(!recentExerciseIds.includes(id))recentExerciseIds.push(id);
      const exposure=exposureFor(execution,id,exerciseRows);
      if(previousLoads[id]===undefined&&exposure.loadKg!==null)previousLoads[id]=exposure.loadKg;
      if(!performanceHistory[id])performanceHistory[id]=[];
      if(performanceHistory[id].length<3)performanceHistory[id].push(exposure);
    }
  }
  return Object.freeze({
    previousLoads:Object.freeze(previousLoads),
    recentExerciseIds:Object.freeze(recentExerciseIds),
    performanceHistory:Object.freeze(Object.fromEntries(Object.entries(performanceHistory).map(([id,list])=>[id,Object.freeze(list)]))),
  });
}
function deriveDecision(summary,alerts){
  const checkin=summary?.latestCheckin||{};
  const pain=Number(checkin.pain),sleep=Number(checkin.sleep),energy=Number(checkin.energy),stress=Number(checkin.stress);
  const criticalPain=Number.isFinite(pain)&&pain>=7;
  const limitedRecovery=(Number.isFinite(sleep)&&sleep<=4)||(Number.isFinite(energy)&&energy<=4)||(Number.isFinite(stress)&&stress>=8)||(Number.isFinite(pain)&&pain>=5);
  const lowAdherence=Number.isFinite(summary?.adherence)&&summary.plannedSessions>=3&&summary.adherence<0.6;
  const rapidLoad=Number.isFinite(summary?.volumeDelta)&&summary.volumeDelta>15;
  if(criticalPain)return {level:'hold',reason:'pain_review',progressionAllowed:false,setAdjustment:-1,rpeAdjustment:-2,restAdjustment:30,durationFactor:0.75,patternLimit:4,structure:'series'};
  if(limitedRecovery||(rapidLoad&&lowAdherence))return {level:'reduced',reason:limitedRecovery?'recovery_context':'load_and_adherence',progressionAllowed:false,setAdjustment:-1,rpeAdjustment:-1,restAdjustment:15,durationFactor:0.85,patternLimit:5,structure:'series'};
  if(lowAdherence)return {level:'simplified',reason:'adherence_context',progressionAllowed:false,setAdjustment:0,rpeAdjustment:0,restAdjustment:10,durationFactor:0.85,patternLimit:4,structure:'series'};
  const good=Number.isFinite(summary?.adherence)&&summary.adherence>=0.8&&!alerts.some((item)=>['critical','warning'].includes(item.severity));
  return {level:'normal',reason:good?'stable_progression':'insufficient_or_neutral_data',progressionAllowed:good,setAdjustment:0,rpeAdjustment:0,restAdjustment:0,durationFactor:1,patternLimit:6,structure:null};
}
function list(value){if(Array.isArray(value))return value.map((x)=>String(x||'').trim()).filter(Boolean);if(typeof value==='string')return value.split(/[,;\n]/).map((x)=>x.trim()).filter(Boolean);return [];}
function mergeLists(...sources){return [...new Set(sources.flatMap(list))];}
function clientProfile(state,clientId){
  return arr(state?.collections?.clientProfiles).map(unwrap).find((profile)=>clientIdOf(profile)===clientId)||null;
}
function latestIri(state,clientId){
  return arr(state?.collections?.iriAssessments).filter((item)=>clientIdOf(item)===clientId).map(unwrap).sort((a,b)=>(safeDate(dateOf(b))?.getTime()||0)-(safeDate(dateOf(a))?.getTime()||0))[0]||null;
}
function profileContext(state,clientId){
  const profile=clientProfile(state,clientId)||{};
  return Object.freeze({
    equipment:Object.freeze(mergeLists(profile.equipment,profile.availableEquipment,profile.available_equipment,profile.material)),
    restrictions:Object.freeze(mergeLists(profile.restrictions,profile.medicalRestrictions,profile.medical_restrictions,profile.limitations,profile.injuries)),
    painAreas:Object.freeze(mergeLists(profile.painAreas,profile.pain_areas)),
    contraindications:Object.freeze(mergeLists(profile.contraindications,profile.contra_indications)),
  });
}
export function buildAdaptiveSessionContext(state,clientId,{now=new Date()}={}){
  if(!clientId)throw new Error('M26_ADAPTIVE_CLIENT_REQUIRED');
  const summary=computeProgressSummary(state,clientId,{now,days:28});
  const alerts=deriveAdherenceAlerts(state,clientId,{now});
  const executions=latestExecutions(state,clientId);
  const history=extractSessionHistory(executions);
  const decision=deriveDecision(summary,alerts);
  const profile=profileContext(state,clientId);
  const iri=latestIri(state,clientId);
  const exposureCount=Object.values(history.performanceHistory).reduce((sum,list)=>sum+list.length,0);
  return Object.freeze({
    clientId,
    generatedAt:new Date(now).toISOString(),
    summary,
    alerts:Object.freeze(alerts),
    decision:Object.freeze(decision),
    previousLoads:history.previousLoads,
    recentExerciseIds:history.recentExerciseIds,
    performanceHistory:history.performanceHistory,
    profile,
    evidence:Object.freeze({
      adherence:summary?.adherence??null,
      averageRpe:summary?.averageRpe??null,
      volumeDelta:summary?.volumeDelta??null,
      latestCheckin:summary?.latestCheckin??null,
      dataQuality:summary?.dataQuality||'limitada',
      historyExerciseCount:Object.keys(history.performanceHistory).length,
      historyExposureCount:exposureCount,
      iriAvailable:Boolean(iri),
      iriStatus:first(iri,'status','estado')||null,
      iriDate:dateOf(iri)||null,
    }),
  });
}
export function applyAdaptiveContext(input,state,clientId=input?.clientId,{now=new Date()}={}){
  const adaptiveContext=buildAdaptiveSessionContext(state,clientId,{now});
  const profile=adaptiveContext.profile||{};
  return Object.freeze({
    ...structuredClone(input),
    clientId,
    equipment:mergeLists(input?.equipment,profile.equipment),
    restrictions:mergeLists(input?.restrictions,profile.restrictions),
    painAreas:mergeLists(input?.painAreas,profile.painAreas),
    contraindications:mergeLists(input?.contraindications,profile.contraindications),
    adaptiveContext,
    previousLoads:{...adaptiveContext.previousLoads,...(input?.previousLoads||{})},
    performanceHistory:{...adaptiveContext.performanceHistory,...(input?.performanceHistory||{})},
    recentExerciseIds:[...new Set([...(adaptiveContext.recentExerciseIds||[]),...(input?.recentExerciseIds||[])])],
  });
}
