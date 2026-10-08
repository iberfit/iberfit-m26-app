// Exercise-specific prescription profiles. The catalog remains the source of identity;
// this deterministic projection supplies presentation/validation without rewriting history.
const norm=(value)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const cardioNames=/carrera|correr|trote|caminar|caminata|biciclet|ciclismo|mountain.?bike|\bmtb\b|rodillo|spinning|air.?bike|eliptica|ergometro|skierg|ski.?erg|cinta inclinada|subida de escaleras/;
const travelNames=/farmer[- ]carry|front[- ]rack[- ]carry|suitcase[- ]carry|overhead[- ]carry|arrastre de trineo|sled[- ]push|sled[- ]drag/;
const intervalNames=/interval|fartlek|serie de carrera|repeticiones en cuesta|sprint interval/;
const holdNames=/plancha|plank|\bhold\b|isometr|wall sit|l-sit|prone cobra|handstand hold|hollow hold/;
export const EXERCISE_METRIC_FIELDS=Object.freeze({
  plannedDistanceKm:{max:1000, label:'Distancia objetivo (km)'},
  plannedDistanceM:{max:100000, label:'Distancia objetivo (m)'},
  plannedSpeedKmh:{max:120,label:'Velocidad objetivo (km/h)'},
  plannedDurationMinutes:{max:1440,label:'Duración objetivo (min)'},
  plannedPace:{maxLength:16,label:'Ritmo objetivo (min/km)'},
  targetHeartRateBpm:{maxLength:24,label:'FC objetivo (lpm o rango)'},
  targetHeartRateZone:{maxLength:12,label:'Zona de FC (ej. Z2)'},
  plannedCadenceRpm:{max:250,label:'Cadencia objetivo (rpm)'},
  plannedPowerWatts:{max:2500,label:'Potencia objetivo (W)'},
  plannedElevationM:{max:15000,label:'Desnivel positivo objetivo (m)'},
  intervalWorkSeconds:{max:86400,label:'Trabajo por intervalo (s)'},
  intervalRecoverySeconds:{max:86400,label:'Recuperación por intervalo (s)'},
  intervalRepetitions:{max:1000,label:'Número de intervalos'},
});
export const EXERCISE_METRIC_KEYS=Object.freeze(Object.keys(EXERCISE_METRIC_FIELDS));
export function exerciseMeasurementProfile(exercise={}){
  const title=norm((exercise?.name_es||exercise?.name||'')+' '+(exercise?.id||''));
  const pattern=norm(exercise?.pattern);
  const override=norm(exercise?.measurementProfile||exercise?.measurement_profile);
  if(['endurance','intervals','isometric','mobility','carry','strength','power'].includes(override)){
    return Object.freeze({kind:override,sport:guessSport(title),cardio:override==='endurance'||override==='intervals'});
  }
  // Lateral band walks are glute activation, not continuous endurance training.
  if(pattern==='activacion gluteo')return Object.freeze({kind:'strength',sport:null,cardio:false});
  if(travelNames.test(title))return Object.freeze({kind:'carry',sport:null,cardio:false});
  if(intervalNames.test(title))return Object.freeze({kind:'intervals',sport:guessSport(title),cardio:true});
  if(cardioNames.test(title)||pattern==='ciclico'||pattern==='locomocion')
    return Object.freeze({kind:'endurance',sport:guessSport(title),cardio:true});
  if(holdNames.test(title)&&!/(arrastre|mountain climber)/.test(title))
    return Object.freeze({kind:'isometric',sport:null,cardio:false});
  if(['recuperacion','respiracion','columna','cuello'].includes(pattern)||pattern.startsWith('movilidad')||/estiramiento|foam roll|movilidad|\bcars\b|\bopen book\b|rock back/.test(title))
    return Object.freeze({kind:'mobility',sport:null,cardio:false});
  if(['salto','potencia'].includes(pattern)||/lanzamiento|\bjump\b|\bpogo\b/.test(title))
    return Object.freeze({kind:'power',sport:null,cardio:false});
  return Object.freeze({kind:'strength',sport:null,cardio:false});
}
function guessSport(title){
  if(/biciclet|ciclismo|mountain.?bike|\bmtb\b|rodillo|spinning|air.?bike/.test(title))return 'cycling';
  if(/remo ergometro/.test(title))return 'rowing';
  if(/skierg|ski.?erg/.test(title))return 'ski';
  if(/eliptica/.test(title))return 'elliptical';
  return 'running';
}
export function initialExercisePrescription(exercise={}){
  const {kind}=exerciseMeasurementProfile(exercise);
  if(kind==='endurance'||kind==='intervals')return {sets:1,reps:'',restSeconds:0,tempo:'libre',targetRpe:5,targetRir:0};
  if(kind==='isometric')return {sets:3,reps:'30 s',restSeconds:60};
  if(kind==='carry')return {sets:3,reps:'',restSeconds:60};
  if(kind==='mobility')return {sets:2,reps:'8',restSeconds:0};
  return {sets:3,reps:'8–12',restSeconds:60};
}
export function metricPrescriptionSummary(p={},exercise={}){
  const profile=exerciseMeasurementProfile(exercise),parts=[];
  if(profile.cardio||profile.kind==='carry'){
    if(p.plannedDistanceKm!==''&&p.plannedDistanceKm!=null)parts.push(p.plannedDistanceKm+' km');
    if(p.plannedDistanceM!==''&&p.plannedDistanceM!=null)parts.push(p.plannedDistanceM+' m');
    if(p.plannedSpeedKmh)parts.push(p.plannedSpeedKmh+' km/h');
    if(p.plannedDurationMinutes!==''&&p.plannedDurationMinutes!=null)parts.push(p.plannedDurationMinutes+' min');
    if(p.plannedPace)parts.push(p.plannedPace+' min/km');
    if(p.targetHeartRateZone)parts.push(p.targetHeartRateZone);
    if(p.targetHeartRateBpm)parts.push('FC '+p.targetHeartRateBpm+' lpm');
    if(profile.kind==='intervals'&&p.intervalRepetitions)parts.push(p.intervalRepetitions+' intervalos');
  }else if(p.reps)parts.push(p.reps);
  return parts.join(' · ')||'Objetivo por concretar';
}
export function metricValueValid(field,value){
  if(value===undefined||value===null||String(value).trim()==='')return true;
  if(field==='plannedPace')return /^\d{1,2}:[0-5]\d$/.test(String(value).trim())&&String(value).trim()!=='0:00';
  if(field==='targetHeartRateZone')return /^(?:Z[1-7]|zona [1-7])$/i.test(String(value).trim());
  if(field==='targetHeartRateBpm')return /^(?:\d{2,3}|\d{2,3}\s*[-–]\s*\d{2,3})$/.test(String(value).trim());
  const descriptor=EXERCISE_METRIC_FIELDS[field];
  if(!descriptor)return false;
  const n=Number(String(value).replace(',','.'));
  return Number.isFinite(n)&&n>=0&&n<=descriptor.max&&
    (field!=='intervalRepetitions'||(n>=1&&Number.isInteger(n)));
}
export function hasCardioPrescription(p={}){
  const positive=(v)=>v!==undefined&&v!==null&&String(v).trim()!==''&&Number(String(v).replace(',','.'))>0;
  return positive(p.plannedDistanceKm)||positive(p.plannedDistanceM)||positive(p.plannedDurationMinutes)||
    (positive(p.intervalRepetitions)&&positive(p.intervalWorkSeconds));
}
