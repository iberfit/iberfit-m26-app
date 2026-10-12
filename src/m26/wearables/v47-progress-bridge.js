// Read-only projection of owner-scoped Connected360 V47 records into the
// existing progress model. Never rewrites the IRI baseline or a session outcome.
import {normalizeWearableDailyRecord} from './normalization.js';
const CATEGORIES=Object.freeze(['steps','sleepMinutes','restingHeartRate']);
const DAY=/^\d{4}-\d{2}-\d{2}$/u;
const LIMITS=Object.freeze({steps:[0,200000,true],sleepMinutes:[0,1440,true],
  restingHeartRate:[25,240,false]});
function validMetric(name,value){
  if(typeof value!=='number'||!Number.isFinite(value))return false;
  const [min,max,integer]=LIMITS[name];
  return value>=min&&value<=max&&(!integer||Number.isInteger(value));
}
function validDate(raw){
  if(typeof raw!=='string'||!DAY.test(raw))return false;
  const date=new Date(raw+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===raw;
}
function ownerOf(raw){return String(raw?.clientId??raw?.client_id??raw?.body?.clientId??raw?.body?.client_id??'');}
function findDay(rows,clientId,date){
  return rows.findIndex(item=>{
    if(ownerOf(item)!==clientId)return false;
    const source=item?.body&&typeof item.body==='object'?item.body:item;
    return String(source?.date||'')===date&&
      String(source?.provider||source?.source||'')==='health_connect';
  });
}
function validObservation(row,clientId){
  if(!row||typeof row!=='object'||Array.isArray(row)||!validDate(row.date)
    ||(row.clientId!=null&&row.clientId!==clientId)
    ||(row.client_id!=null&&row.client_id!==clientId)
    ||(row.sourceVerified!==false&&row.sourceVerified!=null))return false;
  const at=Date.parse(row.acquiredAt);
  if(!Number.isFinite(at))return false;
  let found=false;
  for(const k of CATEGORIES){
    if(row[k]==null)continue;
    if(!validMetric(k,row[k]))return false;
    found=true;
  }
  return found;
}
/**
 * Only client-owned, OS-observed values are projected. A missing category never
 * erases a historical V44 value or creates a fabricated zero. No remote writes.
 */
export function mergeV47DailyIntoClientProgress({
  existing=[],dailyHealth=[],clientId,
}={}){
  const base=Array.isArray(existing)?[...existing]:[];
  if(typeof clientId!=='string'||!clientId||!Array.isArray(dailyHealth)
    ||dailyHealth.length>7||!dailyHealth.length)return base;
  if(dailyHealth.some(row=>!validObservation(row,clientId)))return base;
  const unique=new Set();
  for(const row of dailyHealth){if(unique.has(row.date))return base;unique.add(row.date);}
  const result=base.filter(item=>!ownerOf(item)||ownerOf(item)===clientId);
  for(const row of dailyHealth){
    const attrs={clientId,provider:'health_connect',date:row.date,
      sourceUpdatedAt:new Date(row.acquiredAt).toISOString(),quality:'limitada'};
    for(const k of CATEGORIES){if(row[k]!=null)attrs[k]=row[k];}
    const observed=normalizeWearableDailyRecord(attrs);
    if(!observed.ok)continue;
    const index=findDay(result,clientId,row.date);
    if(index===-1){result.push(observed.value);continue;}
    const original=normalizeWearableDailyRecord(result[index],{clientId});
    if(!original.ok){result[index]=observed.value;continue;}
    const current=original.value;
    const metrics={...current.metrics};
    for(const k of CATEGORIES){if(row[k]!=null)metrics[k]=observed.value.metrics[k];}
    result[index]=Object.freeze({...current,
      metrics:Object.freeze(metrics),
      sourceUpdatedAt:[current.sourceUpdatedAt,observed.value.sourceUpdatedAt].sort().at(-1),
      quality:'limitada',
    });
  }
  return result;
}
