export const TRAINING_SERVICE_STATUSES=Object.freeze({
  none:'none',
  active:'active',
  paused:'paused',
  ended:'ended',
});

function clean(value){return String(value??'').trim().toLowerCase();}

function explicitStatus(record={}){
  const service=record?.trainingService&&typeof record.trainingService==='object'?record.trainingService:{};
  const candidates=[
    record?.trainingServiceStatus,
    record?.training_service_status,
    record?.serviceStatus,
    record?.service_status,
    service?.status,
  ];
  return candidates.map(clean).find((value)=>Object.values(TRAINING_SERVICE_STATUSES).includes(value))||'';
}

function legacyLifecycleStatus(record={}){
  const lifecycle=record?.lifecycle&&typeof record.lifecycle==='object'?record.lifecycle:{};
  return clean(
    record?.lifecycleStatus??
    record?.lifecycle_status??
    lifecycle?.status??
    record?.status
  );
}

export function normalizeTrainingServiceStatus(value,{fallback=TRAINING_SERVICE_STATUSES.none}={}){
  const normalized=clean(value);
  return Object.values(TRAINING_SERVICE_STATUSES).includes(normalized)?normalized:fallback;
}

export function trainingServiceStatusFrom(record={}){
  const explicit=explicitStatus(record);
  if(explicit)return explicit;

  // Backward compatibility while legacy lifecycle rows are still present.
  // New code must prefer the explicit training-service projection above.
  const lifecycle=legacyLifecycleStatus(record);
  if(['active','reactivation','onboarding'].includes(lifecycle))return TRAINING_SERVICE_STATUSES.active;
  if(lifecycle==='paused')return TRAINING_SERVICE_STATUSES.paused;
  if(lifecycle==='inactive')return TRAINING_SERVICE_STATUSES.ended;
  return TRAINING_SERVICE_STATUSES.none;
}

export function hasTrainingService(record={}){
  const status=trainingServiceStatusFrom(record);
  return status===TRAINING_SERVICE_STATUSES.active||status===TRAINING_SERVICE_STATUSES.paused;
}

export function trainingServiceActive(record={}){
  return trainingServiceStatusFrom(record)===TRAINING_SERVICE_STATUSES.active;
}

export function trainingServiceKindFrom(record={}){
  return hasTrainingService(record)?'training':'none';
}

export function trainingServiceLabel(record={}){
  const status=trainingServiceStatusFrom(record);
  if(status===TRAINING_SERVICE_STATUSES.active)return 'Entrenamiento activo';
  if(status===TRAINING_SERVICE_STATUSES.paused)return 'Entrenamiento en pausa';
  if(status===TRAINING_SERVICE_STATUSES.ended)return 'Entrenamiento finalizado';
  return 'Sin entrenamiento activo';
}

export const __trainingServiceInternals=Object.freeze({explicitStatus,legacyLifecycleStatus,clean});
