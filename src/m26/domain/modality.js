const fold=(value)=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s-]+/g,'_');

export const APPOINTMENT_MODALITIES=Object.freeze(['presencial','guiada_en_app','online']);
export const CLIENT_MODALITIES=Object.freeze(['presencial','hibrido','online']);
export const M27_SESSION_EXPERIENCE_VERSION='m27-session-experience-v1';

const APPOINTMENT_ALIASES=Object.freeze(new Map([
  ['presencial','presencial'],
  ['in_person','presencial'],
  ['guiada_en_app','guiada_en_app'],
  ['guiada_app','guiada_en_app'],
  ['online_guiada','guiada_en_app'],
  ['guided_app','guiada_en_app'],
  ['online','online'],
]));
const CLIENT_ALIASES=Object.freeze(new Map([
  ['presencial','presencial'],
  ['hibrido','hibrido'],
  ['hybrid','hibrido'],
  ['online','online'],
]));

export function normalizeAppointmentModality(value){return APPOINTMENT_ALIASES.get(fold(value))||null;}
export function normalizeClientModality(value){return CLIENT_ALIASES.get(fold(value))||null;}
export function isAppointmentModality(value){return normalizeAppointmentModality(value)!==null;}
export function isClientModality(value){return normalizeClientModality(value)!==null;}
export function appointmentModalityLabel(value){return ({presencial:'Presencial',guiada_en_app:'Guiada en la aplicación',online:'En línea'})[normalizeAppointmentModality(value)]||'Sin modalidad';}
export function clientModalityLabel(value){return ({presencial:'Presencial',hibrido:'Híbrido',online:'En línea'})[normalizeClientModality(value)]||'Sin modalidad';}

const normalizeRole=(value)=>String(value??'').trim().toLowerCase();
const normalizeOwnership=(value)=>{
  const token=String(value??'').trim().toLowerCase();
  return ['coach_led','client_autonomous','guided_in_app','live_online'].includes(token)?token:'client_autonomous';
};

function resolveKind(contractModality,deliveryModality,ownership,clientCanExecute){
  const modality=contractModality||'unknown';
  if(clientCanExecute){
    if(modality==='hibrido')return 'hybrid_autonomous';
    if(modality==='presencial')return 'presencial_autonomous';
    return 'online_autonomous';
  }
  if(ownership==='live_online'||deliveryModality==='online'){
    if(modality==='hibrido')return 'hybrid_live_online';
    if(modality==='presencial')return 'presencial_live_online';
    return 'online_live_coach';
  }
  if(modality==='hibrido')return 'hybrid_coach_led';
  if(modality==='online')return 'online_coach_led';
  return 'presencial_coach_led';
}

const SESSION_COPY=Object.freeze({
  presencial_coach_led:Object.freeze({
    eyebrow:'IBERFIT Presencial · Con tu Coach',
    headline:'Tu Coach dirige esta sesión',
    description:'Horario, asistencia y contexto quedan en la app. La ejecución y el registro principal los controla tu Coach durante la sesión presencial.',
    capabilities:['Coach dirige','Asistencia','Historial'],
  }),
  presencial_autonomous:Object.freeze({
    eyebrow:'IBERFIT Presencial · Sesión autónoma',
    headline:'Sesión preparada para ejecutar',
    description:'Esta sesión concreta está publicada para ejecución autónoma aunque tu servicio sea presencial.',
    capabilities:['Live Workout','RIR / RPE','Descansos','Offline'],
  }),
  presencial_live_online:Object.freeze({
    eyebrow:'IBERFIT Presencial · Online en directo',
    headline:'Sesión remota con tu Coach',
    description:'Esta sesión excepcional se realiza online en directo y permanece bajo supervisión del Coach.',
    capabilities:['Coach en directo','Registro compartido','Feedback'],
  }),
  hybrid_coach_led:Object.freeze({
    eyebrow:'IBERFIT Híbrido · Hoy presencial',
    headline:'Hoy entrenas con tu Coach',
    description:'Tu plan híbrido alterna sesiones presenciales y autónomas sin duplicar el programa. Esta sesión la dirige el Coach.',
    capabilities:['Presencial','Coach dirige','Asistencia','Historial'],
  }),
  hybrid_autonomous:Object.freeze({
    eyebrow:'IBERFIT Híbrido · Hoy autónomo',
    headline:'Hoy entrenas desde IBERFIT',
    description:'La sesión autónoma conserva la misma progresión del plan híbrido y habilita registro, RIR/RPE y descansos desde la app.',
    capabilities:['Live Workout','RIR / RPE','Descansos','Offline'],
  }),
  hybrid_live_online:Object.freeze({
    eyebrow:'IBERFIT Híbrido · Online en directo',
    headline:'Hoy entrenas online con tu Coach',
    description:'La sesión híbrida de hoy se realiza en directo con tu Coach y comparte el mismo historial de progresión.',
    capabilities:['Coach en directo','Registro compartido','Feedback'],
  }),
  online_autonomous:Object.freeze({
    eyebrow:'IBERFIT Online · Live Workout',
    headline:'Tu entrenamiento, guiado paso a paso',
    description:'Registra cargas y repeticiones con mínima fricción. IBERFIT conserva el histórico para progresión y feedback asíncrono del Coach.',
    capabilities:['Live Workout','RIR / RPE','Descansos','Offline','Feedback'],
  }),
  online_live_coach:Object.freeze({
    eyebrow:'IBERFIT Online · Coach en directo',
    headline:'Entrenamiento online supervisado',
    description:'Esta sesión se realiza en directo con tu Coach y queda integrada en tu mismo historial de entrenamiento.',
    capabilities:['Coach en directo','Registro compartido','Feedback'],
  }),
  online_coach_led:Object.freeze({
    eyebrow:'IBERFIT Online · Sesión con Coach',
    headline:'Tu Coach controla esta sesión',
    description:'Esta sesión concreta requiere ejecución supervisada y no se inicia de forma autónoma desde el perfil cliente.',
    capabilities:['Coach dirige','Historial','Feedback'],
  }),
});

export function resolveSessionExperience({
  contractModality=null,
  deliveryModality=null,
  ownership='client_autonomous',
  clientCanExecute=false,
  role='client',
  hasFullContent=false,
  isPublished=true,
}={}){
  const contract=normalizeClientModality(contractModality);
  const delivery=normalizeAppointmentModality(deliveryModality)||'guiada_en_app';
  const resolvedOwnership=normalizeOwnership(ownership);
  const executable=Boolean(clientCanExecute&&isPublished&&hasFullContent);
  const kind=resolveKind(contract,delivery,resolvedOwnership,executable);
  const copy=SESSION_COPY[kind]||SESSION_COPY.online_autonomous;
  const coachControl=['coach_led','live_online'].includes(resolvedOwnership)||!executable;
  const liveWorkout=executable;
  const remote=delivery==='online'||resolvedOwnership==='live_online';
  const actor=normalizeRole(role);
  return Object.freeze({
    version:M27_SESSION_EXPERIENCE_VERSION,
    kind,
    contractModality:contract,
    contractLabel:clientModalityLabel(contractModality),
    deliveryModality:delivery,
    deliveryLabel:appointmentModalityLabel(delivery),
    ownership:resolvedOwnership,
    eyebrow:copy.eyebrow,
    headline:copy.headline,
    description:copy.description,
    capabilities:Object.freeze([...copy.capabilities]),
    clientLiveWorkout:liveWorkout,
    coachLed:coachControl,
    coachControl:actor==='coach'||coachControl,
    adminOversight:actor==='admin',
    attendance:['coach_led','live_online'].includes(resolvedOwnership),
    selfLog:liveWorkout,
    rirCapture:liveWorkout,
    restTimer:liveWorkout,
    loadSuggestions:liveWorkout,
    asyncFeedback:contract==='online'||contract==='hibrido'||remote,
    offlineEligible:liveWorkout&&!remote,
    requiresConnection:remote,
    primaryLabel:liveWorkout?'Comenzar Live Workout':resolvedOwnership==='live_online'?'Sesión online con tu Coach':'Sesión con tu Coach',
    primaryEnabled:liveWorkout,
  });
}
