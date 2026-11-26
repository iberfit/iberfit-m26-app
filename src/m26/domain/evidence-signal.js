// Shared, read-only evidence primitives. No persistence, network or clinical scoring.
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
function loadField(row,...keys){
  for(const key of keys){const value=row?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}
  return null;
}
// Preserve explicitly recorded kg (including 0). Conflicting units, invalid
// typed values, unitless legacy strings, and ambiguous labels are not kg.
export function observedLoadKg(row,{max=10000}={}){
  if(!observedSet(row))return null;
  const raw=loadField(row,'load','weight','carga');
  const direct=loadField(row,'loadKg','load_kg','weightKg','weight_kg','kg');
  const pounds=loadField(row,'loadLb','load_lb','weightLb','weight_lb');
  if(pounds!==null)return null;
  const unit=String(loadField(row,'loadUnit','load_unit','weightUnit','weight_unit','unit')||'').trim().toLowerCase();
  const kgUnit=['kg','kgs','kilogram','kilograms','kilogramo','kilogramos'].includes(unit);
  const explicitLb=['lb','lbs','pound','pounds','libra','libras'].includes(unit);
  const parse=(value)=>evidenceNumber(typeof value==='string'?value.replace(',','.'):value,{min:0,max});
  if(explicitLb)return null;
  const typed=parse(direct);
  if(direct!==null&&typed===null)return null;
  if(raw===null)return typed;
  if(typeof raw!=='number'&&typeof raw!=='string')return null;
  const label=String(raw).trim();
  const match=label.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(?:kgs?|kilogramo(?:s)?|kilogram(?:s)?)$/iu);
  const labelled=match?parse(match[1]):kgUnit?parse(raw):null;
  if(labelled===null)return null;
  if(typed!==null&&Math.abs(typed-labelled)>0.01)return null;
  return typed??labelled;
}
