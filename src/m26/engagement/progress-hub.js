import {buildAdherenceWindows} from './progress-continuity.js';
import {computeProgressSummary} from './progress-engine.js';
import {
  assessExercisePerformance,
  buildExercisePerformanceTrend,
  listExercisePerformanceMemories,
} from './exercise-performance-engine.js';

function finite(value){if(value===null||value===undefined||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null;}
function percent(value){const number=finite(value);return number===null?null:Math.round(number*100);}
function reusableSummary(summary,clientId,days){
  return summary
    &&summary.clientId===clientId
    &&Number(summary.days)===Number(days)
      ?summary
      :null;
}
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

export function buildProgressHub(
  state,
  clientId,
  {now=new Date(),loadDirectionForExercise=null,summaries={}}={}
){
  if(!clientId)return null;
  const summary28=reusableSummary(summaries?.[28],clientId,28)
    ??computeProgressSummary(state,clientId,{now,days:28});
  if(!summary28)return null;
  const windows=buildAdherenceWindows(state,clientId,{
    now,
    windows:[7,28,90],
    summaries:{...summaries,28:summary28},
  });
  const byDays=new Map(windows.map((window)=>[window.days,window]));
  const memories=listExercisePerformanceMemories(state,clientId,{limit:50,historyLimit:12});
  const strength=trendEvidence(memories,{loadDirectionForExercise});
  const adherence28=byDays.get(28)?.adherence??summary28.adherence;
  const adherence90=byDays.get(90)?.adherence??null;
  const wearableDecision=summary28?.wearable?.decision||{};
  const wearableDays=finite(wearableDecision.currentEvidenceDays)??0;
  const wearableHistoricalDays=finite(wearableDecision.historicalContextDays)??0;
  const wearableAvailableDays=finite(summary28?.wearable?.daysWithData)??0;
  const wearableEligible=wearableDecision.eligible===true&&wearableDays>0;
  const checkins=finite(summary28.checkins)??0;
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
      evidence:adherence28===null?'Sin planificación comparable en 28 días':`${summary28.completedSessions} de ${summary28.plannedSessions} sesiones confirmadas en 28 días`,
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
      context:`${memories.length} ejercicios con historial · ${strength.confirmedExposures} exposiciones confirmadas · ${strength.descriptiveComparable} tendencia${strength.descriptiveComparable===1?'':'s'} descriptiva${strength.descriptiveComparable===1?'':'s'}`,
      source:'sessionExecutions',
      quality:strength.comparable>=3?'alta':strength.comparable>=1?'media':'limitada',
    }),
    Object.freeze({
      id:'volume',
      label:'Volumen',
      status:Number.isFinite(summary28.volumeDelta)?(summary28.volumeDelta>5?'strong':summary28.volumeDelta>=-5?'building':'review'):'insufficient',
      value:Number.isFinite(summary28.volume)?summary28.volume:null,
      unit:'kg·rep medio',
      evidence:Number.isFinite(summary28.volumeDelta)?`Cambio reciente ${summary28.volumeDelta>0?'+':''}${summary28.volumeDelta}% frente al periodo anterior`:'Sin suficiente volumen comparable',
      context:'Solo carga × repeticiones cuando la carga en kg es explícita',
      source:'sessionExecutions',
      quality:summary28.dataQuality,
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
    note:'Evolución reúne señales confirmadas del proceso sin convertirlas en una puntuación global ni modificar automáticamente la planificación. El Diagnóstico IRI se conserva aparte como punto de partida y como hito de reevaluación.',
  });
}