import {summarizeWearableData} from '../wearables/normalization.js';
import {parseDateValue} from '../domain/civil-date.js';
function clone(value){return value==null?value:structuredClone(value);}
function arr(value){return Array.isArray(value)?value:[];}
function first(record,...keys){for(const key of keys){const value=record?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function clientIdOf(record){return first(record,'clientId','client_id','clienteId','cliente_id');}
function statusOf(record){return String(first(record,'status','estado')||'').trim().toLowerCase();}
function unconfirmedCompletionIds(state){
  const ids=new Set();
  for(const key of ['pendingOperations','conflicts','rejectedOperations']){
    for(const operation of arr(state?.[key])){
      const item=unwrap(operation)||{};
      const type=String(first(item,'type','commandType','command_type')||'').trim().toUpperCase();
      if(type!=='EJECUCION_COMPLETAR')continue;
      const entityId=first(item,'entityId','entity_id','executionId','execution_id');
      if(entityId)ids.add(String(entityId));
    }
  }
  return ids;
}
function executionIsConfirmed(record,unconfirmedIds=new Set()){
  const sync=String(first(record,'syncStatus','sync_status')||'').trim().toLowerCase();
  const id=String(first(record,'id','executionId','execution_id')||'');
  return (!sync||sync==='clean')&&!unconfirmedIds.has(id);
}
function dateOf(record){return first(record,
  'completedAt','completed_at','endedAt','ended_at','recordedAt','recorded_at',
  'assessmentDate','assessment_date','evaluatedAt','evaluated_at','startAt','start_at',
  'scheduledAt','scheduled_at','savedAt','saved_at','createdAt','created_at','date','fecha');}
function safeDate(value){return parseDateValue(value);}
function normalizeNumericString(value){
  let raw=String(value??'').trim().replace(/\s+/g,'');
  if(!raw)return '';
  const match=raw.match(/[-+]?\d[\d.,]*/);if(!match)return '';
  raw=match[0];
  const comma=raw.lastIndexOf(','),dot=raw.lastIndexOf('.');
  if(comma>=0&&dot>=0){const decimal=Math.max(comma,dot),separator=raw[decimal];raw=raw.slice(0,decimal).replace(/[.,]/g,'')+'.'+raw.slice(decimal+1).replace(/[.,]/g,'');if(separator!==','&&separator!=='.')return '';}
  else if(comma>=0)raw=raw.replace(',','.');
  return raw;
}
function number(value){if(typeof value==='number')return Number.isFinite(value)?value:null;const normalized=normalizeNumericString(value);if(!normalized)return null;const n=Number(normalized);return Number.isFinite(n)?n:null;}
function round(value,digits=1){if(!Number.isFinite(value))return null;const p=10**digits;return Math.round(value*p)/p;}
function within(date,from,to){const time=safeDate(date)?.getTime();return Number.isFinite(time)&&time>=from.getTime()&&time<=to.getTime();}
function byDateDesc(a,b){return (safeDate(dateOf(b))?.getTime()||0)-(safeDate(dateOf(a))?.getTime()||0);}
function collection(state,key){return arr(state?.collections?.[key]);}
function forClient(state,key,clientId){return collection(state,key).filter((item)=>clientIdOf(item)===clientId);}
function unwrap(record){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?{...record,...record.body}:record;}

function rowsFrom(value){
  if(Array.isArray(value))return value.filter((row)=>row&&typeof row==='object'&&!Array.isArray(row));
  if(value&&typeof value==='object')return Object.values(value).filter((row)=>row&&typeof row==='object'&&!Array.isArray(row));
  return [];
}
function setRows(execution){
  const source=unwrap(execution)||{};
  const candidates=[source.results,source.setResults,source.set_results,source.progressSnapshot?.results,source.progress_snapshot?.results,source.feedback?.sets];
  for(const candidate of candidates){const rows=rowsFrom(candidate);if(rows.length)return rows;}
  return [];
}
function rpeValues(execution){return setRows(execution).map((row)=>number(first(row,'rpe','actualRpe','actual_rpe'))).filter(Number.isFinite);}
function volumeOf(execution){
  return setRows(execution).reduce((total,row)=>{
    const reps=number(first(row,'reps','actualReps','actual_reps'));
    const load=number(first(row,'loadKg','load_kg','load','weightKg','weight_kg'));
    return total+(Number.isFinite(reps)&&reps>=0&&Number.isFinite(load)&&load>=0?reps*load:0);
  },0);
}
function checkinValues(record){
  const item=unwrap(record)||{};
  return {energy:number(first(item,'energy','energia')),sleep:number(first(item,'sleep','sueno','sueño')),stress:number(first(item,'stress','estres','estrés')),pain:number(first(item,'pain','dolor'))};
}
function average(values){const valid=values.filter(Number.isFinite);return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null;}
function objectiveValue(value){
  if(value===null||value===undefined||value==='')return false;
  if(typeof value==='number')return Number.isFinite(value);
  if(typeof value==='string')return Number.isFinite(number(value));
  if(Array.isArray(value))return value.some(objectiveValue);
  if(typeof value==='object')return Object.values(value).some(objectiveValue);
  return false;
}
function iriDomainCoverage(record){
  const item=unwrap(record)||{};
  const cardiovascular=Number.isFinite(number(first(item,'stepFinalHr','step_final_hr')))&&Number.isFinite(number(first(item,'stepOneMinuteHr','step_one_minute_hr')));
  const bodyComposition=objectiveValue(first(item,'bodyComposition','body_composition'));
  const strength=objectiveValue(first(item,'strengthPatterns','strength_patterns'))||objectiveValue(first(item,'chairStand30s','chair_stand_30s'))||objectiveValue(first(item,'pushUps','push_ups'));
  return [cardiovascular,bodyComposition,strength].filter(Boolean).length;
}
function safePositiveInteger(value,{fallback,min=1,max=3650}={}){const parsed=Number(value);return Number.isInteger(parsed)&&parsed>=min&&parsed<=max?parsed:fallback;}

export function progressWindow({now=new Date(),days=28}={}){
  const end=safeDate(now);if(!end)throw new Error('M26_PROGRESS_NOW_INVALID');
  const safeDays=safePositiveInteger(days,{fallback:28,min:1,max:3650});
  const start=new Date(end);start.setUTCDate(start.getUTCDate()-safeDays);
  return {start,end,days:safeDays};
}

export function computeProgressSummary(state,clientId,{now=new Date(),days=28}={}){
  if(!clientId)return null;
  const window=progressWindow({now,days}),{start,end}=window;
  const appointments=forClient(state,'appointments',clientId).map(unwrap).filter((item)=>within(dateOf(item),start,end));
  const planned=appointments.filter((item)=>!['cancelado','cancelled','anulado','annulled'].includes(statusOf(item)));
  const completedAppointments=planned.filter((item)=>['completado','completed'].includes(statusOf(item)));
  const executionRows=forClient(state,'sessionExecutions',clientId).map(unwrap).filter((item)=>within(dateOf(item),start,end));
  const blockedExecutionIds=unconfirmedCompletionIds(state);
  const executions=executionRows.filter((item)=>executionIsConfirmed(item,blockedExecutionIds));
  const completedExecutions=executions.filter((item)=>['completado','completed','complete'].includes(statusOf(item)));
  const completedIds=new Set(completedExecutions.map((item)=>first(item,'appointmentId','appointment_id')).filter(Boolean));
  const confirmedCompleted=Math.max(completedAppointments.length,completedIds.size,completedExecutions.length);
  const plannedCount=planned.length||completedExecutions.length;
  const adherence=plannedCount?Math.min(1,confirmedCompleted/plannedCount):null;
  const rpes=completedExecutions.flatMap(rpeValues);
  const volumeSeries=completedExecutions
    .map((item)=>({date:safeDate(dateOf(item))?.getTime()||0,volume:volumeOf(item)}))
    .filter((item)=>item.volume>0)
    .sort((a,b)=>a.date-b.date);
  const volumes=volumeSeries.map((item)=>item.volume);
  const split=Math.ceil(volumes.length/2);
  const olderVolume=volumes.length>=2?average(volumes.slice(0,split)):null;
  const recentVolume=volumes.length>=2?average(volumes.slice(split)):null;
  const volumeDelta=Number.isFinite(olderVolume)&&olderVolume>0&&Number.isFinite(recentVolume)?((recentVolume-olderVolume)/olderVolume)*100:null;
  const checkins=forClient(state,'checkins',clientId).map(unwrap).filter((item)=>within(dateOf(item),start,end)).sort(byDateDesc);
  const wearable=summarizeWearableData(forClient(state,'wearableDailySummaries',clientId),{now:end,days:Math.min(7,window.days)});
  const checkinSeries=checkins.map(checkinValues);
  const iri=forClient(state,'iriAssessments',clientId).map(unwrap).sort(byDateDesc);
  const iriCoverage=iri.map(iriDomainCoverage);
  const iriDelta=iriCoverage.length>=2&&iriCoverage[0]>0&&iriCoverage[1]>0?iriCoverage[0]-iriCoverage[1]:null;
  const sortedExecutions=[...completedExecutions].sort(byDateDesc);
  const lastExecution=sortedExecutions[0]||null;
  const lastExecutionRpe=lastExecution?rpeValues(lastExecution):[];
  const latestCheckin=checkins[0]||null;
  const dataPoints=completedExecutions.length+checkins.length+iri.length;
  const dataQuality=dataPoints>=8?'alta':dataPoints>=3?'media':'limitada';
  return Object.freeze({
    clientId,startAt:start.toISOString(),endAt:end.toISOString(),days:window.days,
    plannedSessions:plannedCount,completedSessions:confirmedCompleted,adherence:round(adherence,3),
    averageRpe:round(average(rpes),1),volume:round(average(volumes),1),volumeDelta:round(volumeDelta,1),
    iriCurrent:iri.length?iriCoverage[0]:null,iriPrevious:iri.length>1?iriCoverage[1]:null,iriDelta:round(iriDelta,1),iriAssessmentCount:iri.length,
    checkins:checkins.length,latestCheckin:latestCheckin?clone(checkinValues(latestCheckin)):null,
    checkinAverage:Object.freeze({
      energy:round(average(checkinSeries.map((x)=>x.energy)),1),sleep:round(average(checkinSeries.map((x)=>x.sleep)),1),
      stress:round(average(checkinSeries.map((x)=>x.stress)),1),pain:round(average(checkinSeries.map((x)=>x.pain)),1),
    }),
    lastExecutionAt:dateOf(lastExecution)||null,lastExecutionRpe:round(average(lastExecutionRpe),1),
    latestCheckinAt:dateOf(latestCheckin)||null,
    unconfirmedExecutions:executionRows.length-executions.length,dataQuality,wearable,
  });
}

export function buildProgressTimeline(state,clientId,{now=new Date(),days=90,limit=24}={}){
  if(!clientId)return [];
  const {start,end}=progressWindow({now,days});
  const safeLimit=safePositiveInteger(limit,{fallback:24,min:1,max:200});
  const rows=[];
  const blockedExecutionIds=unconfirmedCompletionIds(state);
  for(const item of forClient(state,'sessionExecutions',clientId).map(unwrap).filter((item)=>executionIsConfirmed(item,blockedExecutionIds)))if(within(dateOf(item),start,end))rows.push({kind:'execution',date:dateOf(item),title:first(item,'title','sessionTitle','session_title')||'Sesión ejecutada',status:statusOf(item),detail:rpeValues(item).length?`RPE medio ${round(average(rpeValues(item)),1)}`:'Ejecución registrada'});
  for(const item of forClient(state,'iriAssessments',clientId).map(unwrap))if(within(dateOf(item),start,end)){const coverage=iriDomainCoverage(item);rows.push({kind:'iri',date:dateOf(item),title:'Evaluación IRI',status:statusOf(item),detail:coverage?`${coverage} de 3 dominios registrados`:'Evaluación registrada · formato histórico sin dominios comparables'});}
  for(const item of forClient(state,'checkins',clientId).map(unwrap))if(within(dateOf(item),start,end)){const values=checkinValues(item);rows.push({kind:'checkin',date:dateOf(item),title:'Registro de bienestar',status:'registrado',detail:`Energía ${values.energy??'—'} · Sueño ${values.sleep??'—'} · Estrés ${values.stress??'—'} · Dolor ${values.pain??'—'}`});}
  return rows.sort((a,b)=>(safeDate(b.date)?.getTime()||0)-(safeDate(a.date)?.getTime()||0)).slice(0,safeLimit).map(clone);
}
