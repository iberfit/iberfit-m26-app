// Shared, read-only evidence primitives. No persistence, network or clinical scoring.
import {parseCivilDate,reportCivilDate,isWithinCivilPeriod,parseDateValue} from './civil-date.js';

// Domain contract for measured evidence, not a persistence or authorization layer.
// The caller must supply already authorized, canonical observations. Neither an
// absent value nor an absent sample can become a measured zero.
export function createEvidenceSignal(input,{now=new Date()}={}){
  const id=x=>typeof x==='string'&&x.trim()===x&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(x)?x:null;
  const text=(x,max)=>typeof x==='string'&&x.trim()&&x.length<=max&&!/[\u0000-\u001f\u007f]/u.test(x)?x.trim():null;
  const signalId=id(input?.id),subjectId=id(input?.subjectId),sourceType=id(input?.sourceType),kind=id(input?.kind);
  const sourceIds=Array.isArray(input?.sourceIds)?input.sourceIds:[];
  if(!signalId||!subjectId||!sourceType||!kind||!sourceIds.length||sourceIds.length>2000||Array.from(sourceIds).some(x=>!id(x))||new Set(sourceIds).size!==sourceIds.length)return null;
  const start=parseCivilDate(input.periodStart)?.iso,end=parseCivilDate(input.periodEnd)?.iso,cutoff=reportCivilDate(now);
  if(!start||!end||!cutoff||start>end||end>cutoff)return null;
  const measuredAt=input.measuredAt??null;
  if(measuredAt!==null&&(!isWithinCivilPeriod(measuredAt,start,end,now)||typeof measuredAt!=='string'))return null;
  const value=evidenceNumber(input.value),sampleSize=evidenceNumber(input.sampleSize,{min:1,integer:true});
  const unit=text(input.unit,40),method=text(input.method,160),provenance=text(input.provenance,160),boundary=text(input.interpretationBoundary,500),decisionUse=text(input.decisionUse,300),version=text(input.methodologyVersion,80);
  const comparabilityKey=input.comparabilityKey==null?null:text(input.comparabilityKey,1600);
  if(value===null||sampleSize===null||!unit||!method||!provenance||!boundary||!decisionUse||!version||(input.comparabilityKey!=null&&!comparabilityKey))return null;
  if(!['medida','calculada','estimada'].includes(input.quality)||!['alta','media','limitada'].includes(input.confidence))return null;
  const generatedAt=parseDateValue(now)?.toISOString();if(!generatedAt)return null;
  return Object.freeze({id:signalId,subjectId,kind,sourceType,sourceIds:Object.freeze([...sourceIds]),measuredAt,periodStart:start,periodEnd:end,value,unit,method,provenance,sampleSize,comparabilityKey,quality:input.quality,confidence:input.confidence,interpretationBoundary:boundary,decisionUse,generatedAt,methodologyVersion:version});
}
export function evidenceNumber(value,{min=-Infinity,max=Infinity,integer=false}={}){
  if(typeof value==='string'){
    const trimmed=value.trim();
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(trimmed))return null;
    value=Number(trimmed);
  }
  return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max
    &&(!integer||Number.isSafeInteger(value))?value:null;
}

export function currentWearableEvidence(wearable){
  const decision=wearable?.decision;
  const days=evidenceNumber(decision?.currentEvidenceDays,{min:0,integer:true});
  const availableDays=evidenceNumber(wearable?.daysWithData,{min:0,integer:true});
  const providers=decision?.providers;
  const provider=Array.isArray(providers)&&providers.length===1&&typeof providers[0]==='string'
    ?providers[0].trim():'';
  const eligible=decision?.eligible===true&&days!==null&&days>0
    &&availableDays!==null&&days<=availableDays&&provider!=='';
  return Object.freeze({eligible,days:eligible?days:null,availableDays,
    provider:eligible?provider:null,quality:eligible?decision.quality||'limitada':'limitada'});
}

// Stable equality for canonical snapshots, independent of property order.
export function stableEvidenceJson(value){
  if(Array.isArray(value))return '['+value.map(stableEvidenceJson).join(',')+']';
  if(value&&typeof value==='object'){
    return '{'+Object.keys(value).sort((left,right)=>left.localeCompare(right)).map(key=>
      JSON.stringify(key)+':'+stableEvidenceJson(value[key])).join(',')+'}';
  }
  return JSON.stringify(value??null);
}

export function observedSet(row){
  return Boolean(row&&typeof row==='object'&&!Array.isArray(row)&&
    row.skipped!==true&&row.completed!==false&&row.serverConfirmed!==false&&
    !['skipped','omitida','omitido','unconfirmed','pending','borrador'].includes(String(row.status||'').trim().toLowerCase()));
}
// Preserve explicitly recorded kg (including 0). Reject contradictions
// across every alias, including equivalent unit spellings and raw labels.
export function observedLoadKg(row,{max=10000}={}){
  if(!observedSet(row))return null;
  const values=keys=>keys.map(k=>row[k]).filter(v=>v!==undefined&&v!==null&&v!=='');
  if(values(['loadLb','load_lb','weightLb','weight_lb']).length)return null;
  const unitKeys=['loadUnit','load_unit','weightUnit','weight_unit','unit'].filter(k=>row[k]!==undefined&&row[k]!==null&&row[k]!=='');
  const units=unitKeys.map(k=>typeof row[k]==='string'?row[k].trim().toLowerCase():null);
  const kgNames=new Set(['kg','kgs','kilogram','kilograms','kilogramo','kilogramos']);
  // Historical reports used loadUnit for a dumbbell basis, not a mass unit.
  // Preserve only those documented values when kg is independently explicit.
  const legacyBasis=unitKeys.length===1&&unitKeys[0]==='loadUnit'&&['per_dumbbell','per-dumbbell','por_mancuerna'].includes(units[0]);
  if(!legacyBasis&&units.some(u=>!kgNames.has(u)))return null;
  const kgUnit=units.length>0&&units.every(u=>kgNames.has(u));
  const parse=v=>evidenceNumber(typeof v==='string'?v.replace(',','.'):v,{min:0,max});
  const typed=values(['loadKg','load_kg','weightKg','weight_kg','kg']).map(parse);
  const raw=values(['load','weight','carga']).map(v=>{
    if(typeof v!=='string'&&typeof v!=='number')return null;
    const match=String(v).trim().match(/^([+-]?\d+(?:[.,]\d+)?)\s*(?:kgs?|kilogramo(?:s)?|kilogram(?:s)?)$/iu);
    return match?parse(match[1]):kgUnit?parse(v):null;
  });
  const measured=[...typed,...raw];
  if(!measured.length||measured.some(v=>v===null))return null;
  if(Math.max(...measured)-Math.min(...measured)>0.01)return null;
  return measured[0];
}
