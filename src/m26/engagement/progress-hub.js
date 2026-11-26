import {buildAdherenceWindows,reusableConfirmedSummary,confirmedScheduledCompletion} from './progress-continuity.js';
import {computeProgressSummary} from './progress-engine.js';
import {evidenceNumber,currentWearableEvidence} from '../domain/evidence-signal.js';
import {
  assessExercisePerformance,
  buildExercisePerformanceTrend,
  listExercisePerformanceMemories,
} from './exercise-performance-engine.js';

function finite(value){return evidenceNumber(value);}
function count(value){
  const number=finite(value);
  return number!==null&&Number.isSafeInteger(number)&&number>=0?number:null;
}
function percent(value){const number=finite(value);return number===null?null:Math.round(number*100);}
function labelForQuality(value){
  const quality=String(value||'').toLowerCase();
  return ({alta:'Alta',media:'Media',limitada:'Limitada',reciente:'Reciente',atrasada:'Atrasada',obsoleta:'Obsoleta',sin_datos:'Sin datos'})[quality]||'Sin evidencia suficiente';
}
function status(value,{positive=0.8,watch=0.6}={}){
  const number=finite(value);
  if(number===null)return 'insufficient';
  if(number>=positive)return 'strong';
  if(number>=watch)return 'building';
  return 'review';
}
function exerciseLoadDirection(memory,loadDirectionForExercise){
  if(typeof loadDirectionForExercise!=='function')return 'unknown';
  try{
    const value=loadDirectionForExercise(memory?.exerciseId||null,memory);
    return value==='higher-is-better'||value==='lower-is-better'?value:'unknown';
  }catch{
    return 'unknown';
  }
}
function trendEvidence(memories=[],{loadDirectionForExercise=null}={}){
  const rows=memories
    .filter((memory)=>Number(memory?.exposureCount||0)>=2)
    .map((memory)=>({
      memory,
      trend:buildExercisePerformanceTrend(memory,{window:12}),
      assessment:assessExercisePerformance(memory,{
        loadDirection:exerciseLoadDirection(memory,loadDirectionForExercise),
      }),
    }));
  const descriptiveComparable=rows.filter(({trend})=>[
    trend?.metrics?.load,
    trend?.metrics?.repsPerSet,
    trend?.metrics?.secondsPerSet,
    trend?.metrics?.volumeKg,
  ].some((metric)=>metric?.comparable===true));
  const comparable=descriptiveComparable.filter(
    ({assessment})=>assessment?.status&&assessment.status!=='indeterminate',
  );
  const improving=comparable.filter(
    ({assessment})=>assessment?.status==='progress',
  );
  return Object.freeze({
    comparable:comparable.length,
    descriptiveComparable:descriptiveComparable.length,
    improving:improving.length,
    ratio:comparable.length?improving.length/comparable.length:null,
    confirmedExposures:memories.reduce((total,memory)=>total+Number(memory?.exposureCount||0),0),
  });
}

// Report evidence is computed only for the declared civil period. Reuse the
// same canonical progress and exercise comparators as the interactive hub.
export function buildPeriodProgressEvidence(state,clientId,{now=new Date(),days}={}){
  const summary=computeProgressSummary(state,clientId,{now,days,civilPeriod:true,reportEvidenceOnly:true});
  if(!summary)return Object.freeze([]);
  // Reconcile the full canonical owner history before restricting the period.
  // A caller-provided subset cannot hide a newer revision or a conflict.
  const strength=trendEvidence(listExercisePerformanceMemories(state,clientId,{
    limit:50,historyLimit:12,now,from:summary.startAt.slice(0,10),civilPeriod:true,
  }));
  const scheduled=confirmedScheduledCompletion(summary);
  const rows=[];
  if(scheduled)rows.push({id:'consistency',label:'Constancia',evidence:`${scheduled.completed} de ${scheduled.planned} citas programadas cumplidas en ${days} días`,source:'appointments+sessionExecutions',quality:summary.dataQuality});
  if(strength.comparable)rows.push({id:'strength',label:'Fuerza',evidence:`${strength.improving} de ${strength.comparable} ejercicios comparables con evolución favorable confirmada en el periodo`,source:'sessionExecutions',quality:strength.comparable>=3?'alta':'media'});
  if(summary.volumeEvidence?.comparableSessions>=2){
    const v=summary.volumeEvidence;
    const variation=Number.isFinite(summary.volumeDelta)?`Variación descriptiva ${summary.volumeDelta>0?'+':''}${summary.volumeDelta}%`:'Variación porcentual no calculable desde una referencia de cero';
    rows.push({id:'volume',label:'Volumen comparable',evidence:`${variation} entre grupos cronológicos de sesiones comparables del mismo periodo (${v.olderSessions} y ${v.recentSessions} sesiones; medias ${v.olderMean} y ${v.recentMean} kg·rep); no equivale a una mejora automática`,source:'sessionExecutions',quality:v.comparableSessions>=3?'media':'limitada'});
  }
  if(summary.checkins>0)rows.push({id:'wellbeing',label:'Bienestar',evidence:`${summary.checkins} registro${summary.checkins===1?'':'s'} en el periodo; último registro ${summary.latestCheckinAt?String(summary.latestCheckinAt).slice(0,10).split('-').reverse().join('/'):'confirmado'}`,source:'checkins',quality:summary.checkins>=8?'alta':summary.checkins>=3?'media':'limitada'});
  return Object.freeze(rows.map(row=>Object.freeze({...row,status:'available'})));
}

export function buildProgressHub(
  state,
  clientId,
  {now=new Date(),loadDirectionForExercise=null,summaries={}}={}
){
  if(!clientId)return null;
  const summary28=reusableConfirmedSummary(summaries?.[28],clientId,28,{now})
    ??computeProgressSummary(state,clientId,{now,days:28});
  if(!summary28)return null;
  const windows=buildAdherenceWindows(state,clientId,{
    now,
    windows:[7,28,90],
    summaries:{...summaries,28:summary28},
  });
  const byDays=new Map(windows.map((window)=>[window.days,window]));
  const memories=listExercisePerformanceMemories(state,clientId,{limit:50,historyLimit:12,now,from:new Date(new Date(now).getTime()-28*86400000)});
  const strength=trendEvidence(memories,{loadDirectionForExercise});
  const scheduled28=confirmedScheduledCompletion(summary28);
  const adherence28=scheduled28?.adherence??null;
  const adherence90=byDays.get(90)?.adherence??null;
  const wearableDecision=summary28?.wearable?.decision||{};
  const wearableSignal=currentWearableEvidence(summary28?.wearable);
  const wearableDays=wearableSignal.days;
  const wearableHistoricalDays=count(wearableDecision.historicalContextDays)??0;
  const wearableAvailableDays=wearableSignal.availableDays;
  const wearableEligible=wearableSignal.eligible;
  const checkins=count(summary28.checkins)??0;
  const iriCoverage=finite(summary28.iriCurrent);

  const wearableEvidence=wearableEligible
    ?`${wearableDays} día${wearableDays===1?'':'s'} con datos actuales de dispositivo`
    :wearableAvailableDays
      ?`${wearableAvailableDays} día${wearableAvailableDays===1?'':'s'} con datos disponibles, pero sin evidencia suficientemente reciente`
      :'Sin datos recientes de dispositivo';
  const wearableContext=wearableAvailableDays
    ?`Frescura · ${labelForQuality(summary28?.wearable?.freshness)} · Calidad actual · ${labelForQuality(wearableDecision.quality)}${wearableHistoricalDays?` · ${wearableHistoricalDays} día${wearableHistoricalDays===1?'':'s'} solo como contexto histórico`:''}`
    :`Frescura · ${labelForQuality(summary28?.wearable?.freshness)}`;

  const pillars=Object.freeze([
    Object.freeze({
      id:'consistency',
      label:'Constancia',
      status:status(adherence28),
      value:percent(adherence28),
      unit:'%',
      evidence:adherence28===null?'Sin planificación comparable en 28 días':`${scheduled28.completed} de ${scheduled28.planned} citas programadas cumplidas en 28 días`,
      context:adherence90===null?'Sin ventana comparable de 90 días':`90 días · ${percent(adherence90)}%`,
      source:'appointments+sessionExecutions',
      quality:summary28.dataQuality,
    }),
    Object.freeze({
      id:'strength',
      label:'Fuerza',
      status:strength.comparable?status(strength.ratio,{positive:0.6,watch:0.3}):'insufficient',
      value:strength.comparable||null,
      unit:'ejercicios comparables',
      evidence:strength.comparable?`${strength.improving} con evolución favorable confirmada`:'Se necesitan exposiciones repetidas y semántica comparable del ejercicio',
      context:`Ventana de 28 días · ${memories.length} ejercicios con historial · ${strength.confirmedExposures} exposiciones confirmadas · ${strength.descriptiveComparable} tendencia${strength.descriptiveComparable===1?'':'s'} descriptiva${strength.descriptiveComparable===1?'':'s'}`,
      source:'sessionExecutions',
      quality:strength.comparable>=3?'alta':strength.comparable>=1?'media':'limitada',
    }),
    Object.freeze({
      id:'volume',
      label:'Volumen',
      // Volume is descriptive. Increasing or decreasing it may be intentional.
      status:Number.isFinite(summary28.volume)?'building':'insufficient',
      value:Number.isFinite(summary28.volume)?summary28.volume:null,
      unit:'kg·rep medio registrado',
      evidence:Number.isFinite(summary28.volumeDelta)?`Cambio reciente ${summary28.volumeDelta>0?'+':''}${summary28.volumeDelta}% entre grupos cronológicos de sesiones comparables de la ventana de 28 días (${summary28.volumeEvidence?.comparableSessions??'número no disponible'} sesiones)`
        :summary28.volumeEvidence?.comparableSessions>=2?'Volumen comparable; no se puede calcular un porcentaje desde una referencia de cero.'
        :Number.isFinite(summary28.volume)?'Trabajo registrado; sin suficiente volumen comparable':'Sin suficiente volumen comparable',
      context:'Solo carga × repeticiones en kg; exige ejercicios, variantes y series comparables. Más volumen no equivale a mejor rendimiento.'+(summary28.volumeEvidence?.partialSessions?` Incluye ${summary28.volumeEvidence.partialSessions} sesión(es) con registro parcial.`:''),
      source:'sessionExecutions',
      quality:summary28.volumeEvidence?.comparableSessions>=3?'media':'limitada',
    }),
    Object.freeze({
      id:'wellbeing',
      label:'Bienestar',
      status:checkins>=4?'strong':checkins>=1?'building':'insufficient',
      value:checkins||null,
      unit:'registros / 28 días',
      evidence:checkins?`Último registro ${summary28.latestCheckinAt||'confirmado'}`:'Sin registros confirmados de bienestar',
      context:'Energía, sueño, estrés, dolor, fatiga y motivación se mantienen como señales separadas',
      source:'checkins',
      quality:checkins>=8?'alta':checkins>=3?'media':'limitada',
    }),
    Object.freeze({
      id:'activity',
      label:'Actividad',
      status:wearableEligible?(wearableDays>=2?'strong':'building'):'insufficient',
      value:wearableEligible?wearableDays:null,
      unit:'días con evidencia actual',
      evidence:wearableEvidence,
      context:wearableContext,
      source:'wearableDailySummaries',
      quality:wearableEligible?wearableDecision.quality||'limitada':'limitada',
    }),
  ]);

  const diagnosticBaseline=Object.freeze({
    id:'iri-diagnosis',
    label:'Diagnóstico IRI',
    role:'initial-diagnostic',
    contributesToEvolution:false,
    available:Number(summary28.iriAssessmentCount||0)>0,
    reassessmentAvailable:false,
    coverage:iriCoverage,
    unit:'de 3 dominios',
    assessments:summary28.iriAssessmentCount?1:0,
    evidence:summary28.iriAssessmentCount
      ?'Diagnóstico IRI inicial confirmado'
      :'Sin diagnóstico IRI confirmado',
    context:'El IRI establece el punto de partida; las reevaluaciones y la evolución se registran fuera del Diagnóstico IRI.',
    source:'iriAssessments',
    quality:iriCoverage===3?'alta':iriCoverage?'media':'limitada',
  });
  const actionable=pillars.filter((pillar)=>pillar.status==='review');
  const evidenceCount=pillars.filter((pillar)=>pillar.status!=='insufficient').length;
  return Object.freeze({
    clientId,
    generatedAt:new Date(now).toISOString(),
    pillars,
    diagnosticBaseline,
    evidenceCount,
    totalPillars:pillars.length,
    actionable:Object.freeze(actionable.map((pillar)=>pillar.id)),
    headline:evidenceCount
      ?`${evidenceCount} de ${pillars.length} áreas con evidencia reciente`
      :'Construyendo tu seguimiento',
    note:'Evolución reúne señales confirmadas del proceso sin convertirlas en una puntuación global ni modificar automáticamente la planificación. El Diagnóstico IRI se conserva aparte como punto de partida; el seguimiento posterior utiliza mediciones propias.',
  });
}