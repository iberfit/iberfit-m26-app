export const HEALTH_CONNECT_HISTORICAL_SCHEMA_VERSION=
  'iberfit.health-connect-historical.v1';

export const HEALTH_CONNECT_MAX_LOOKBACK_DAYS=30;

export const HEALTH_CONNECT_HISTORICAL_CAPABILITIES=Object.freeze([
  Object.freeze({
    key:'steps',
    metric:'steps',
    label:'Pasos',
    permission:'android.permission.health.READ_STEPS',
    purpose:'Contextualizar actividad diaria y adherencia.',
  }),
  Object.freeze({
    key:'sleep',
    metric:'sleepMinutes',
    label:'Sueño',
    permission:'android.permission.health.READ_SLEEP',
    purpose:'Contextualizar descanso y recuperación percibida.',
  }),
  Object.freeze({
    key:'resting_heart_rate',
    metric:'restingHeartRate',
    label:'FC en reposo',
    permission:'android.permission.health.READ_RESTING_HEART_RATE',
    purpose:'Aportar contexto longitudinal de frecuencia cardiaca en reposo.',
  }),
  Object.freeze({
    key:'hrv',
    metric:'hrvMs',
    label:'VFC (RMSSD)',
    permission:'android.permission.health.READ_HEART_RATE_VARIABILITY',
    purpose:'Aportar contexto longitudinal de variabilidad con método explícito.',
  }),
  Object.freeze({
    key:'active_energy',
    metric:'activeEnergyKcal',
    label:'Energía activa',
    permission:'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
    purpose:'Contextualizar carga de actividad diaria estimada por el dispositivo.',
  }),
  Object.freeze({
    key:'exercise',
    metric:'workoutMinutes',
    label:'Ejercicio',
    permission:'android.permission.health.READ_EXERCISE',
    purpose:'Contextualizar minutos de ejercicio registrados por el dispositivo.',
  }),
]);

const BY_KEY=new Map(
  HEALTH_CONNECT_HISTORICAL_CAPABILITIES.map((item)=>[item.key,item])
);

function dateOnly(value){
  if(value instanceof Date){
    if(Number.isNaN(value.getTime()))throw new Error('M26_HEALTH_CONNECT_DATE_INVALID');
    return value.toISOString().slice(0,10);
  }
  const text=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(text)){
    throw new Error('M26_HEALTH_CONNECT_DATE_INVALID');
  }
  const parsed=new Date(`${text}T00:00:00Z`);
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==text){
    throw new Error('M26_HEALTH_CONNECT_DATE_INVALID');
  }
  return text;
}

export function healthConnectHistoricalMetricKeys(capabilityKeys){
  const requested=Array.isArray(capabilityKeys)&&capabilityKeys.length
    ?capabilityKeys
    :HEALTH_CONNECT_HISTORICAL_CAPABILITIES.map((item)=>item.key);
  const metrics=[];
  for(const raw of requested){
    const item=BY_KEY.get(String(raw||'').trim());
    if(item&&!metrics.includes(item.metric))metrics.push(item.metric);
  }
  if(!metrics.length)throw new Error('M26_HEALTH_CONNECT_CAPABILITY_REQUIRED');
  return Object.freeze(metrics);
}

export function createHealthConnectHistoricalPlan({
  capabilities,
  endDate=new Date(),
  days=HEALTH_CONNECT_MAX_LOOKBACK_DAYS,
}={}){
  const safeDays=Number(days);
  if(
    !Number.isInteger(safeDays)||
    safeDays<1||
    safeDays>HEALTH_CONNECT_MAX_LOOKBACK_DAYS
  ){
    throw new Error('M26_HEALTH_CONNECT_LOOKBACK_INVALID');
  }

  const end=dateOnly(endDate);
  const startDate=new Date(`${end}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate()-(safeDays-1));

  const selectedKeys=Array.isArray(capabilities)&&capabilities.length
    ?[...new Set(capabilities.map((value)=>String(value||'').trim()))]
    :HEALTH_CONNECT_HISTORICAL_CAPABILITIES.map((item)=>item.key);

  const selected=selectedKeys
    .map((key)=>BY_KEY.get(key))
    .filter(Boolean);

  if(!selected.length){
    throw new Error('M26_HEALTH_CONNECT_CAPABILITY_REQUIRED');
  }

  return Object.freeze({
    schemaVersion:HEALTH_CONNECT_HISTORICAL_SCHEMA_VERSION,
    provider:'health_connect',
    startDate:startDate.toISOString().slice(0,10),
    endDate:end,
    days:safeDays,
    capabilityKeys:Object.freeze(selected.map((item)=>item.key)),
    metrics:Object.freeze(selected.map((item)=>item.metric)),
    permissions:Object.freeze(selected.map((item)=>item.permission)),
    governance:Object.freeze({
      consent:'explicit-per-capability',
      purpose:Object.freeze(
        Object.fromEntries(selected.map((item)=>[item.key,item.purpose]))
      ),
      provenance:'health_connect',
      timestamps:'daily-summary-date+sourceUpdatedAt',
      quality:'normalized-summary-quality',
      ownership:'authenticated-client-only',
      permissionModel:'read-only-per-capability',
      retention:'existing-wearable-summary-retention',
      exportDelete:'existing-wearable-export-delete-flow',
      auditability:'provider+date+metric+permission-selection',
      rawSourceStored:false,
      backgroundReadRequested:false,
      fullHistoryPermissionRequested:false,
      writePermissionRequested:false,
      clinicalDecisionEngine:false,
    }),
  });
}

export const __healthConnectHistoricalInternals=Object.freeze({
  dateOnly,
  capabilityByKey:BY_KEY,
});