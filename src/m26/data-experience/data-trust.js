import {renderGuidanceTrigger} from '../guidance/contextual-guidance.js';

export const DATA_TRUST_SCHEMA_VERSION='iberfit.data-trust.v1';

const SOURCE_LABELS=Object.freeze({
  health_connect:'Health Connect',
  samsung_health:'Samsung Health',
  apple_health:'Apple Health',
  fitbit:'Fitbit / Google Health',
  garmin_connect:'Garmin Connect',
  oura:'Oura',
  strava:'Strava',
  normalized_file:'Archivo normalizado IBERFIT',
  longitudinal:'Agregado longitudinal IBERFIT',
  progress:'Progreso confirmado IBERFIT',
  engagement:'Registros confirmados IBERFIT',
  device_consent:'Permiso de dispositivo',
  wearableDailySummaries:'Resumen diario de dispositivos',
});

const METHOD_LABELS=Object.freeze({
  daily_provider_mean:'Media diaria por proveedor',
  sum_daily_provider_mean:'Suma de medias diarias por proveedor',
  available_day_mean:'Media de días disponibles',
  normalized_daily_record:'Registro diario normalizado',
  confirmed_adherence_ratio:'Sesiones completadas / planificadas',
  confirmed_session_count:'Conteo de sesiones confirmadas',
  confirmed_habit_log_count:'Conteo de hábitos confirmados',
  consent_gate:'Permiso explícito antes de leer el dato',
  rmssd:'VFC · RMSSD',
  sdnn:'VFC · SDNN',
  unknown:'Método no identificado',
});

const QUALITY_LABELS=Object.freeze({
  alta:'Alta',
  media:'Media',
  limitada:'Limitada',
  confirmada:'Confirmada',
  sin_datos:'Sin datos',
});

function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}

function finite(value){
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function text(value,max=240){
  return String(value??'').trim().slice(0,max);
}

function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function dateOnly(value){
  if(!value)return null;
  const direct=String(value).match(/^\d{4}-\d{2}-\d{2}/u)?.[0];
  if(direct)return direct;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?null:date.toISOString().slice(0,10);
}

function quality(value){
  const key=text(value,40).toLowerCase();
  return Object.hasOwn(QUALITY_LABELS,key)?key:'sin_datos';
}

function coverage(value){
  const number=finite(value);
  return number===null?null:Math.max(0,Math.min(1,number));
}

function providers(values=[]){
  return Object.freeze(
    [...new Set((Array.isArray(values)?values:[]).map((value)=>text(value,120)).filter(Boolean))]
      .sort()
  );
}

function sourceLabel(source,providerList=[]){
  const explicit=text(source,120);
  const explicitLabel=explicit
    ?SOURCE_LABELS[explicit]||explicit.replaceAll('_',' ')
    :null;

  if(explicit==='wearableDailySummaries'&&providerList.length===1){
    const provider=providerList[0];
    const providerLabel=SOURCE_LABELS[provider]||provider.replaceAll('_',' ');
    return `${explicitLabel} · ${providerLabel}`;
  }
  if(explicit==='wearableDailySummaries'&&providerList.length>1){
    return `${explicitLabel} · ${providerList.length} fuentes`;
  }
  if(explicitLabel)return explicitLabel;
  if(providerList.length===1){
    const provider=providerList[0];
    return SOURCE_LABELS[provider]||provider.replaceAll('_',' ');
  }
  if(providerList.length>1)return `${providerList.length} fuentes`;
  return 'Sin procedencia confirmada';
}

function methodLabel(method){
  const key=text(method,120).toLowerCase();
  if(!key)return 'Método no informado';
  return METHOD_LABELS[key]||key.replaceAll('_',' ');
}

function formatDate(value){
  const day=dateOnly(value);
  if(!day)return 'Sin fecha';
  const date=new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-CL',{
    day:'2-digit',
    month:'short',
    year:'numeric',
    timeZone:'UTC',
  }).format(date);
}

function formatCoverage(value){
  const number=coverage(value);
  return number===null?'No aplica':`${Math.round(number*100)} %`;
}

export function createDataTrust(input={}){
  const providerList=providers(input.providers);
  const observedAt=dateOnly(input.observedAt||input.date||input.latestDate);
  const missing=input.missing===true;
  const method=text(input.method,120)||null;
  const coverageValue=coverage(input.coverage);
  const qualityValue=quality(input.quality);

  return deepFreeze({
    schemaVersion:DATA_TRUST_SCHEMA_VERSION,
    source:text(input.source,120)||null,
    sourceLabel:sourceLabel(input.source,providerList),
    observedAt,
    quality:qualityValue,
    qualityLabel:QUALITY_LABELS[qualityValue],
    coverage:coverageValue,
    coverageLabel:formatCoverage(coverageValue),
    missing,
    missingLabel:missing?'Dato faltante':'Dato disponible',
    method,
    methodLabel:methodLabel(method),
    providers:providerList,
    reason:text(input.reason,240)||null,
  });
}

export function longitudinalMetricTrust(metric={},aggregateTrust={}){
  const points=Array.isArray(metric?.points)?metric.points:[];
  const qualityRank={sin_datos:0,limitada:1,media:2,alta:3};
  const qualityValue=points.length
    ?points
      .map((point)=>quality(point?.quality))
      .sort((a,b)=>(qualityRank[a]??0)-(qualityRank[b]??0))[0]
    :'sin_datos';
  const method=metric?.key==='hrvMs'
    ?metric?.vfcMethod||'unknown'
    :'daily_provider_mean';

  return createDataTrust({
    source:aggregateTrust?.wearableSourceCollection||'longitudinal',
    providers:metric?.providers||[],
    observedAt:metric?.latestDate||metric?.endDate||null,
    quality:qualityValue,
    coverage:metric?.coverage,
    missing:Number(metric?.daysWithData||0)===0||!Number.isFinite(Number(metric?.average)),
    method,
    reason:metric?.comparabilityReason||null,
  });
}

export function wearableSummaryTrust(summary={}){
  const days=Number(summary?.days||0);
  const daysWithData=Number(summary?.daysWithData||0);
  return createDataTrust({
    source:'wearableDailySummaries',
    providers:summary?.providers||[],
    observedAt:summary?.latestDate||summary?.endDate||null,
    quality:summary?.quality||'sin_datos',
    coverage:days>0?daysWithData/days:null,
    missing:daysWithData===0,
    method:'available_day_mean',
  });
}

export function wearableRecordTrust(record={}){
  const metrics=record?.metrics||{};
  const hasMetric=Object.values(metrics).some((value)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value)));
  return createDataTrust({
    source:record?.provider||null,
    providers:record?.provider?[record.provider]:[],
    observedAt:record?.date||record?.sourceUpdatedAt||null,
    quality:record?.quality||'sin_datos',
    coverage:null,
    missing:!hasMetric,
    method:record?.vfcMethod||'normalized_daily_record',
  });
}

export function challengeEvaluationTrust(evaluation={}){
  const verification=evaluation?.verification||{};
  return createDataTrust({
    source:verification.source||null,
    providers:verification.providers||[],
    observedAt:verification.observedAt||evaluation?.asOf||null,
    quality:verification.quality||'sin_datos',
    coverage:verification.coverage,
    missing:evaluation?.status==='no_data'||evaluation?.status==='consent_required'||evaluation?.value===null,
    method:verification.method||null,
    reason:verification.reason||null,
  });
}

function trustItem(label,value,{kind='neutral',guidanceKey=null}={}){
  const guidance=guidanceKey
    ?renderGuidanceTrigger(guidanceKey,{label:`Ayuda sobre ${label.toLowerCase()}`})
    :'';
  return `<span class="m26-data-trust-item is-${escapeHtml(kind)}"><span class="m26-data-trust-label"><small>${escapeHtml(label)}</small>${guidance}</span><strong>${escapeHtml(value)}</strong></span>`;
}

export function renderDataTrustStrip(trustInput,{role='client',compact=false}={}){
  const trust=trustInput?.schemaVersion===DATA_TRUST_SCHEMA_VERSION
    ?trustInput
    :createDataTrust(trustInput);
  const professional=['coach','admin'].includes(String(role||'').toLowerCase());
  const items=[
    trustItem('Fuente',trust.sourceLabel,{guidanceKey:'data-source'}),
    trustItem('Fecha',formatDate(trust.observedAt),{kind:trust.observedAt?'neutral':'warning'}),
    trustItem('Calidad',trust.qualityLabel,{kind:trust.quality==='alta'||trust.quality==='confirmada'?'success':trust.quality==='sin_datos'?'warning':'neutral',guidanceKey:'data-quality'}),
    trustItem('Cobertura',trust.coverageLabel,{kind:trust.coverage===0?'warning':'neutral',guidanceKey:'data-coverage'}),
    trustItem('Dato',trust.missingLabel,{kind:trust.missing?'warning':'success'}),
    trustItem('Método',trust.methodLabel,{kind:trust.method&&trust.method!=='unknown'?'neutral':'warning',guidanceKey:'data-method'}),
  ];

  const providerDetail=professional&&trust.providers.length>1
    ?`<span class="m26-data-trust-providers">Proveedores: ${escapeHtml(trust.providers.map((provider)=>SOURCE_LABELS[provider]||provider).join(' · '))}</span>`
    :'';
  const reason=professional&&trust.reason
    ?`<span class="m26-data-trust-reason">Limitación: ${escapeHtml(trust.reason.replaceAll('_',' '))}</span>`
    :'';

  return `<div class="m26-data-trust-strip${compact?' is-compact':''}" data-data-trust="visible" aria-label="Confianza del dato">${items.join('')}${providerDetail}${reason}</div>`;
}

export const __dataTrustInternals=Object.freeze({
  dateOnly,
  quality,
  coverage,
  sourceLabel,
  methodLabel,
  formatDate,
  formatCoverage,
});