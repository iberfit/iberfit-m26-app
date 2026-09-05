const METRICS=Object.freeze([
  Object.freeze({key:'weightKg',keys:['weightKg','weight_kg'],label:'Peso',unit:'kg'}),
  Object.freeze({key:'waistCm',keys:['waistCm','waist_cm'],label:'Cintura',unit:'cm'}),
  Object.freeze({key:'bodyFatPercent',keys:['bodyFatPercent','body_fat_percent'],label:'Grasa corporal',unit:'%'}),
  Object.freeze({key:'leanMassKg',keys:['leanMassKg','lean_mass_kg'],label:'Masa magra',unit:'kg'}),
  Object.freeze({key:'muscleMassKg',keys:['muscleMassKg','muscle_mass_kg'],label:'Masa muscular',unit:'kg'}),
  Object.freeze({key:'waterPercent',keys:['waterPercent','water_percent'],label:'Agua corporal',unit:'%'}),
  Object.freeze({key:'visceralFatLevel',keys:['visceralFatLevel','visceral_fat_level'],label:'Grasa visceral',unit:'nivel'}),
]);

function rows(value){return Array.isArray(value)?value:[];}
function first(record,...keys){for(const key of keys){const value=record?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function unwrap(record){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?{...record,...record.body}:record;}
function clientIdOf(record){return first(unwrap(record),'clientId','client_id','clienteId','cliente_id');}
function dateOf(record){return first(unwrap(record),'assessmentDate','assessment_date','evaluatedAt','evaluated_at','createdAt','created_at','date','fecha');}
function safeDate(value){const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date:null;}
function optionalNumber(value){
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  const raw=String(value).trim().replace(/\s+/g,'');
  if(!raw)return null;
  const normalized=raw.includes(',')&&!raw.includes('.')?raw.replace(',','.'):raw.replace(/,/g,'');
  const match=normalized.match(/[-+]?\d+(?:\.\d+)?/);
  if(!match)return null;
  const parsed=Number(match[0]);
  return Number.isFinite(parsed)?parsed:null;
}
function normalizeProtocol(value){return String(value??'').trim().toLocaleLowerCase('es-CL').replace(/\s+/g,' ');}
function bodyOf(record){
  const item=unwrap(record)||{};
  const nested=first(item,'bodyComposition','body_composition');
  return nested&&typeof nested==='object'&&!Array.isArray(nested)?nested:item;
}
function protocolOf(record){
  const item=unwrap(record)||{};
  const body=bodyOf(record);
  return Object.freeze({
    method:normalizeProtocol(first(body,'bodyCompositionMethod','body_composition_method','method','metodo')??first(item,'bodyCompositionMethod','body_composition_method')),
    device:normalizeProtocol(first(body,'bodyCompositionDevice','body_composition_device','device','equipo')??first(item,'bodyCompositionDevice','body_composition_device')),
    conditions:normalizeProtocol(first(body,'bodyCompositionConditions','body_composition_conditions','conditions','condiciones')??first(item,'bodyCompositionConditions','body_composition_conditions')),
  });
}
function protocolCompatibility(current,previous){
  if(!current?.method||!previous?.method)return Object.freeze({comparable:false,reason:'methodology_missing'});
  if(current.method!==previous.method)return Object.freeze({comparable:false,reason:'method_mismatch'});
  if(current.device||previous.device){
    if(!current.device||!previous.device)return Object.freeze({comparable:false,reason:'device_missing'});
    if(current.device!==previous.device)return Object.freeze({comparable:false,reason:'device_mismatch'});
  }
  if(current.conditions||previous.conditions){
    if(!current.conditions||!previous.conditions)return Object.freeze({comparable:false,reason:'conditions_missing'});
    if(current.conditions!==previous.conditions)return Object.freeze({comparable:false,reason:'conditions_mismatch'});
  }
  return Object.freeze({comparable:true,reason:null});
}
function metricValue(record,definition){
  const body=bodyOf(record);
  return optionalNumber(first(body,...definition.keys));
}
function round(value,digits=1){if(!Number.isFinite(value))return null;const power=10**digits;return Math.round(value*power)/power;}
function reasonLabel(reason){
  return ({
    insufficient_measurements:'Falta una medición anterior con este dato',
    methodology_missing:'Método no documentado en ambas mediciones',
    method_mismatch:'Método distinto',
    device_missing:'Equipo no documentado en ambas mediciones',
    device_mismatch:'Equipo distinto',
    conditions_missing:'Condiciones no documentadas en ambas mediciones',
    conditions_mismatch:'Condiciones distintas',
  })[reason]||'Sin referencia metodológicamente comparable';
}

export function buildBodyCompositionProgress(state,clientId,{limit=8}={}){
  if(!clientId)return Object.freeze({available:false,measurements:0,metrics:Object.freeze([]),latestAt:null,protocol:null});
  const safeLimit=Number.isInteger(Number(limit))?Math.max(2,Math.min(24,Number(limit))):8;
  const assessments=rows(state?.collections?.iriAssessments)
    .filter((record)=>String(clientIdOf(record)||'')===String(clientId))
    .map((record)=>({record,date:safeDate(dateOf(record))}))
    .filter((entry)=>entry.date)
    .sort((a,b)=>b.date.getTime()-a.date.getTime())
    .slice(0,safeLimit);
  const withBody=assessments.filter(({record})=>METRICS.some((definition)=>Number.isFinite(metricValue(record,definition))));
  if(!withBody.length)return Object.freeze({available:false,measurements:0,metrics:Object.freeze([]),latestAt:null,protocol:null});

  const latest=withBody[0];
  const latestProtocol=protocolOf(latest.record);
  const metrics=METRICS.flatMap((definition)=>{
    const current=metricValue(latest.record,definition);
    if(!Number.isFinite(current))return [];
    let previousValue=null;
    let previousAt=null;
    let reason='insufficient_measurements';
    for(const candidate of withBody.slice(1)){
      const value=metricValue(candidate.record,definition);
      if(!Number.isFinite(value))continue;
      const compatibility=protocolCompatibility(latestProtocol,protocolOf(candidate.record));
      if(compatibility.comparable){
        previousValue=value;
        previousAt=candidate.date.toISOString();
        reason=null;
        break;
      }
      if(reason==='insufficient_measurements')reason=compatibility.reason;
    }
    const comparable=Number.isFinite(previousValue);
    return [Object.freeze({
      key:definition.key,label:definition.label,unit:definition.unit,
      current:round(current,1),previous:comparable?round(previousValue,1):null,
      delta:comparable?round(current-previousValue,1):null,
      currentAt:latest.date.toISOString(),previousAt,
      comparable,reason,reasonLabel:comparable?null:reasonLabel(reason),
    })];
  });

  return Object.freeze({
    available:metrics.length>0,
    measurements:withBody.length,
    latestAt:latest.date.toISOString(),
    protocol:latestProtocol,
    comparableMetrics:metrics.filter((metric)=>metric.comparable).length,
    metrics:Object.freeze(metrics),
  });
}

export const __bodyCompositionProgressInternals=Object.freeze({optionalNumber,protocolCompatibility,protocolOf,reasonLabel});
