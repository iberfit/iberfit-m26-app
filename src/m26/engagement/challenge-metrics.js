import {buildLongitudinalAggregation} from '../intelligence/longitudinal-aggregation.js';
import {computeProgressSummary} from './progress-engine.js';

export const CHALLENGE_METRICS_SCHEMA_VERSION='iberfit.challenge-metrics.v1';
export const CHALLENGE_WINDOWS=Object.freeze([7,28,90]);

export const CHALLENGE_TYPE_CATALOG=Object.freeze([
  Object.freeze({type:'consistency',label:'Constancia',metricKey:'adherencePct',groupEligible:true,requiresDeviceOptIn:false}),
  Object.freeze({type:'sessions',label:'Sesiones',metricKey:'completedSessions',groupEligible:true,requiresDeviceOptIn:false}),
  Object.freeze({type:'steps',label:'Pasos',metricKey:'steps',groupEligible:true,requiresDeviceOptIn:true}),
  Object.freeze({type:'activity',label:'Actividad',metricKey:'activeMinutes',groupEligible:true,requiresDeviceOptIn:true}),
  Object.freeze({type:'habits',label:'Hábitos',metricKey:'habitCompletions',groupEligible:true,requiresDeviceOptIn:false}),
  Object.freeze({type:'personal_progress',label:'Progreso personal',metricKey:null,groupEligible:false,requiresDeviceOptIn:false}),
  Object.freeze({type:'coach_goal',label:'Objetivo individualizado por Coach',metricKey:null,groupEligible:false,requiresDeviceOptIn:false}),
]);

export const SAFE_CHALLENGE_METRICS=Object.freeze({
  adherencePct:Object.freeze({unit:'%',source:'progress',device:false}),
  completedSessions:Object.freeze({unit:'sesiones',source:'progress',device:false}),
  steps:Object.freeze({unit:'pasos',source:'longitudinal',device:true}),
  activeMinutes:Object.freeze({unit:'min',source:'longitudinal',device:true}),
  workoutMinutes:Object.freeze({unit:'min',source:'longitudinal',device:true}),
  habitCompletions:Object.freeze({unit:'registros',source:'engagement',device:false}),
});

export const FORBIDDEN_COMPETITIVE_METRIC_PATTERNS=Object.freeze([
  'heartrate',
  'heart_rate',
  'restingheartrate',
  'resting_heart_rate',
  'maxheartrate',
  'max_heart_rate',
  'hrv',
  'bpm',
  'pulse',
  'raw',
]);

const TYPE_BY_KEY=new Map(CHALLENGE_TYPE_CATALOG.map((item)=>[item.type,item]));
const QUALITY_RANK=Object.freeze({limitada:1,media:2,alta:3});

function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}

function finite(value){
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function round(value,digits=1){
  if(!Number.isFinite(value))return null;
  const power=10**digits;
  return Math.round(value*power)/power;
}

function text(value,max=160){
  return String(value??'').trim().slice(0,max);
}

function safeDate(value){
  const date=value instanceof Date?new Date(value):new Date(value);
  return Number.isNaN(date.getTime())?null:date;
}

function dateOnly(value){
  const date=safeDate(value);
  return date?date.toISOString().slice(0,10):null;
}

function shiftDate(value,days){
  const base=dateOnly(value);
  if(!base)return null;
  const date=new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()+Number(days||0));
  return date.toISOString().slice(0,10);
}

function windowFor(now,days){
  const safeDays=Number(days);
  if(!CHALLENGE_WINDOWS.includes(safeDays)){
    throw new Error('M26_CHALLENGE_WINDOW_UNSUPPORTED');
  }
  const endDate=dateOnly(now);
  if(!endDate)throw new Error('M26_CHALLENGE_NOW_INVALID');
  return deepFreeze({
    days:safeDays,
    startDate:shiftDate(endDate,-(safeDays-1)),
    endDate,
  });
}

function unwrap(record){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?{...record,...record.body}
    :record;
}

function first(record,...keys){
  for(const key of keys){
    const value=record?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
}

function clientIdOf(record){
  return first(record,'clientId','client_id','clienteId','cliente_id');
}

function confirmedStatus(record){
  const status=text(first(record,'status','estado'),80).toLowerCase();
  return !status||['confirmado','confirmed','completado','completed','complete','activo','active'].includes(status);
}

function isCompletedHabitLog(record){
  const value=first(record,'completed','completado');
  return value===true||value===1||value==='1'||value==='true'||value==='on';
}

function habitLogDate(record){
  return first(record,'recordedAt','recorded_at','createdAt','created_at','date','fecha');
}

function qualityOf(points=[]){
  const ranks=points
    .map((point)=>QUALITY_RANK[String(point?.quality||'').toLowerCase()]||1);
  const rank=ranks.length?Math.min(...ranks):0;
  if(rank>=3)return 'alta';
  if(rank>=2)return 'media';
  return ranks.length?'limitada':'sin_datos';
}

function safeMetricKey(value){
  const key=text(value,80);
  const normalized=key.toLowerCase().replace(/[^a-z0-9_]/gu,'');
  if(FORBIDDEN_COMPETITIVE_METRIC_PATTERNS.some((part)=>normalized.includes(part))){
    throw new Error('M26_CHALLENGE_METRIC_FORBIDDEN');
  }
  if(!Object.hasOwn(SAFE_CHALLENGE_METRICS,key)){
    throw new Error('M26_CHALLENGE_METRIC_UNSUPPORTED');
  }
  return key;
}

function targetValue(value){
  const target=finite(value);
  if(target===null||target<=0||target>100_000_000){
    throw new Error('M26_CHALLENGE_TARGET_INVALID');
  }
  return target;
}

function metricForType(type,input){
  const catalog=TYPE_BY_KEY.get(type);
  if(!catalog)throw new Error('M26_CHALLENGE_TYPE_UNSUPPORTED');
  if(catalog.metricKey)return catalog.metricKey;
  return safeMetricKey(input.metricKey);
}

export function createChallengeDefinition(input={}){
  const type=text(input.type,80);
  const catalog=TYPE_BY_KEY.get(type);
  if(!catalog)throw new Error('M26_CHALLENGE_TYPE_UNSUPPORTED');

  const metricKey=metricForType(type,input);
  const metric=SAFE_CHALLENGE_METRICS[metricKey];
  const days=Number(input.days??28);
  if(!CHALLENGE_WINDOWS.includes(days)){
    throw new Error('M26_CHALLENGE_WINDOW_UNSUPPORTED');
  }

  const mode=text(input.mode||'individual',40).toLowerCase();
  if(!['individual','group'].includes(mode)){
    throw new Error('M26_CHALLENGE_MODE_UNSUPPORTED');
  }
  if(mode==='group'&&!catalog.groupEligible){
    throw new Error('M26_CHALLENGE_GROUP_TYPE_FORBIDDEN');
  }

  const habitId=type==='habits'?text(input.habitId,200):null;
  if(type==='habits'&&!habitId){
    throw new Error('M26_CHALLENGE_HABIT_REQUIRED');
  }

  return deepFreeze({
    schemaVersion:CHALLENGE_METRICS_SCHEMA_VERSION,
    id:text(input.id,200)||null,
    type,
    label:catalog.label,
    metricKey,
    unit:metric.unit,
    days,
    mode,
    target:targetValue(input.target),
    habitId,
    requiresDeviceOptIn:Boolean(metric.device),
    groupEligible:catalog.groupEligible,
    coachDefined:['personal_progress','coach_goal'].includes(type),
    rawHealthDataAllowed:false,
    automaticPrescriptionChanges:false,
    clinicalClassification:false,
  });
}

function longitudinalMetricSnapshot(longitudinal,days,metricKey){
  const window=longitudinal?.windows?.[`d${days}`];
  const metric=window?.metrics?.[metricKey];
  if(!metric)return deepFreeze({
    value:null,
    coverage:0,
    quality:'sin_datos',
    providers:Object.freeze([]),
    daysWithData:0,
    source:'longitudinal',
  });

  const points=Array.isArray(metric.points)?metric.points:[];
  const values=points.map((point)=>finite(point?.value)).filter(Number.isFinite);
  return deepFreeze({
    value:round(values.reduce((sum,value)=>sum+value,0),1),
    coverage:finite(metric.coverage)??0,
    quality:qualityOf(points),
    providers:Object.freeze([...(metric.providers||[])]),
    daysWithData:Number(metric.daysWithData||0),
    source:'longitudinal',
  });
}

function habitSnapshot(state,clientId,window,habitId){
  const logs=Array.isArray(state?.collections?.habitLogs)
    ?state.collections.habitLogs
    :[];
  const scoped=logs
    .map(unwrap)
    .filter((record)=>clientIdOf(record)===clientId)
    .filter((record)=>first(record,'habitId','habit_id')===habitId)
    .filter(confirmedStatus)
    .filter(isCompletedHabitLog)
    .filter((record)=>{
      const day=dateOnly(habitLogDate(record));
      return day&&day>=window.startDate&&day<=window.endDate;
    });
  const days=new Set(scoped.map((record)=>dateOnly(habitLogDate(record))).filter(Boolean));
  return deepFreeze({
    value:scoped.length,
    completedDays:days.size,
    source:'engagement',
    quality:scoped.length?'confirmada':'sin_datos',
    coverage:null,
    providers:Object.freeze([]),
  });
}

export function buildCanonicalChallengeContext(state,clientId,{now=new Date()}={}){
  if(!clientId)throw new Error('M26_CHALLENGE_CLIENT_REQUIRED');
  const longitudinal=buildLongitudinalAggregation(state,clientId,{now});
  const progress=Object.fromEntries(
    CHALLENGE_WINDOWS.map((days)=>[
      `d${days}`,
      computeProgressSummary(state,clientId,{now,days}),
    ])
  );

  return deepFreeze({
    schemaVersion:CHALLENGE_METRICS_SCHEMA_VERSION,
    clientId,
    asOf:safeDate(now)?.toISOString()||null,
    longitudinal,
    progress:deepFreeze(progress),
    canonicalSources:Object.freeze([
      'longitudinal-aggregation',
      'progress-engine',
      'engagement-habit-logs',
    ]),
    sensorAccess:false,
    rawTelemetryAccess:false,
  });
}

function metricSnapshot(context,state,definition,now){
  const days=definition.days;
  const progress=context?.progress?.[`d${days}`];

  if(definition.metricKey==='adherencePct'){
    const adherence=finite(progress?.adherence);
    return deepFreeze({
      value:adherence===null?null:round(adherence*100,1),
      source:'progress',
      quality:progress?.dataQuality||'limitada',
      coverage:null,
      providers:Object.freeze([]),
    });
  }

  if(definition.metricKey==='completedSessions'){
    return deepFreeze({
      value:finite(progress?.completedSessions),
      source:'progress',
      quality:progress?.dataQuality||'limitada',
      coverage:null,
      providers:Object.freeze([]),
    });
  }

  if(definition.metricKey==='habitCompletions'){
    return habitSnapshot(
      state,
      context.clientId,
      windowFor(now,days),
      definition.habitId
    );
  }

  return longitudinalMetricSnapshot(
    context.longitudinal,
    days,
    definition.metricKey
  );
}

export function evaluateChallenge(
  state,
  clientId,
  challenge,
  {now=new Date(),deviceOptIn=false}={}
){
  const definition=createChallengeDefinition(challenge);
  const context=buildCanonicalChallengeContext(state,clientId,{now});

  if(definition.requiresDeviceOptIn&&deviceOptIn!==true){
    return deepFreeze({
      schemaVersion:CHALLENGE_METRICS_SCHEMA_VERSION,
      challenge:definition,
      clientId,
      status:'consent_required',
      value:null,
      progressPct:null,
      completed:false,
      verification:deepFreeze({
        canonicalSource:true,
        deviceOptIn:false,
        rawHealthDataExposed:false,
        eligibleForLeaderboard:false,
        reason:'device_opt_in_required',
      }),
    });
  }

  const snapshot=metricSnapshot(context,state,definition,now);
  const value=finite(snapshot.value);
  const progressPct=value===null
    ?null
    :round(Math.max(0,Math.min(100,(value/definition.target)*100)),1);
  const hasData=value!==null;

  return deepFreeze({
    schemaVersion:CHALLENGE_METRICS_SCHEMA_VERSION,
    challenge:definition,
    clientId,
    status:hasData?'active':'no_data',
    value,
    progressPct,
    completed:progressPct===100,
    verification:deepFreeze({
      canonicalSource:true,
      source:snapshot.source,
      quality:snapshot.quality,
      coverage:snapshot.coverage??null,
      providers:Object.freeze([...(snapshot.providers||[])]),
      deviceOptIn:definition.requiresDeviceOptIn?true:null,
      rawHealthDataExposed:false,
      eligibleForLeaderboard:
        definition.mode==='group'
        &&definition.groupEligible
        &&hasData,
      reason:hasData?null:'canonical_data_missing',
    }),
  });
}

export function buildPrivacySafeLeaderboard(entries=[],challenge={}){
  const definition=createChallengeDefinition({...challenge,mode:'group'});
  if(!definition.groupEligible){
    throw new Error('M26_CHALLENGE_GROUP_TYPE_FORBIDDEN');
  }

  const rows=(Array.isArray(entries)?entries:[])
    .map((entry)=>({
      participantId:text(entry?.participantId||entry?.clientId,200),
      alias:text(entry?.alias||'Participante',80),
      progressPct:finite(entry?.progressPct),
      eligible:entry?.verification?.eligibleForLeaderboard===true,
    }))
    .filter((entry)=>entry.participantId&&entry.eligible&&entry.progressPct!==null)
    .sort((a,b)=>b.progressPct-a.progressPct||a.alias.localeCompare(b.alias,'es'));

  return deepFreeze(rows.map((entry,index)=>({
    rank:index+1,
    participantId:entry.participantId,
    alias:entry.alias,
    progressPct:round(Math.max(0,Math.min(100,entry.progressPct)),1),
    completed:entry.progressPct>=100,
  })));
}

export const __challengeMetricsInternals=Object.freeze({
  windowFor,
  safeMetricKey,
  longitudinalMetricSnapshot,
  habitSnapshot,
  qualityOf,
});