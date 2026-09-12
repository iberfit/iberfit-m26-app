import {buildAdherenceWindows} from './progress-continuity.js';
import {computeProgressSummary} from './progress-engine.js';
import {
  buildExercisePerformanceTrend,
  listExercisePerformanceMemories,
} from './exercise-performance-engine.js';

function finite(value){if(value===null||value===undefined||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null;}
function percent(value){const number=finite(value);return number===null?null:Math.round(number*100);}
function labelForQuality(value){
  const quality=String(value||'').toLowerCase();
  return ({alta:'Alta',media:'Media',limitada:'Limitada',reciente:'Reciente'})[quality]||'Sin evidencia suficiente';
}
function status(value,{positive=0.8,watch=0.6}={}){
  const number=finite(value);
  if(number===null)return 'insufficient';
  if(number>=positive)return 'strong';
  if(number>=watch)return 'building';
  return 'review';
}
function trendEvidence(memories=[]){
  const rows=memories
    .filter((memory)=>Number(memory?.exposureCount||0)>=2)
    .map((memory)=>({
      memory,
      trend:buildExercisePerformanceTrend(memory,{window:12}),
    }));
  const comparable=rows.filter(({trend})=>[
    trend?.metrics?.load,
    trend?.metrics?.repsPerSet,
    trend?.metrics?.secondsPerSet,
    trend?.metrics?.volumeKg,
  ].some((metric)=>metric?.comparable===true));
  const improving=comparable.filter(({trend})=>[
    trend?.metrics?.load?.direction,
    trend?.metrics?.repsPerSet?.direction,
    trend?.metrics?.secondsPerSet?.direction,
    trend?.metrics?.volumeKg?.direction,
  ].includes('up'));
  return Object.freeze({
    comparable:comparable.length,
    improving:improving.length,
    ratio:comparable.length?improving.length/comparable.length:null,
    confirmedExposures:memories.reduce((total,memory)=>total+Number(memory?.exposureCount||0),0),
  });
}

export function buildProgressHub(state,clientId,{now=new Date()}={}){
  if(!clientId)return null;
  const summary28=computeProgressSummary(state,clientId,{now,days:28});
  if(!summary28)return null;
  const windows=buildAdherenceWindows(state,clientId,{now,windows:[7,28,90]});
  const byDays=new Map(windows.map((window)=>[window.days,window]));
  const memories=listExercisePerformanceMemories(state,clientId,{limit:50,historyLimit:12});
  const strength=trendEvidence(memories);
  const adherence28=byDays.get(28)?.adherence??summary28.adherence;
  const adherence90=byDays.get(90)?.adherence??null;
  const wearableDays=finite(summary28?.wearable?.daysWithData);
  const checkins=finite(summary28.checkins)??0;
  const iriCoverage=finite(summary28.iriCurrent);

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
      evidence:strength.comparable?`${strength.improving} con al menos una señal ascendente confirmada`:'Se necesitan exposiciones repetidas del mismo ejercicio',
      context:`${memories.length} ejercicios con historial · ${strength.confirmedExposures} exposiciones confirmadas`,
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
      status:wearableDays>=5?'strong':wearableDays>=1?'building':'insufficient',
      value:wearableDays||null,
      unit:'días con datos',
      evidence:wearableDays?`${wearableDays} día${wearableDays===1?'':'s'} con datos recientes de dispositivo`:'Sin datos recientes de dispositivo',
      context:`Calidad · ${labelForQuality(summary28?.wearable?.freshness)}`,
      source:'wearableDailySummaries',
      quality:wearableDays>=5?'alta':wearableDays?'media':'limitada',
    }),
  ]);

  const diagnosticBaseline=Object.freeze({
    id:'iri-diagnosis',
    label:'Diagnóstico IRI',
    role:'initial-diagnostic',
    contributesToEvolution:false,
    available:Number(summary28.iriAssessmentCount||0)>0,
    reassessmentAvailable:Number(summary28.iriAssessmentCount||0)>1,
    coverage:iriCoverage,
    unit:'de 3 dominios',
    assessments:Number(summary28.iriAssessmentCount||0),
    evidence:summary28.iriAssessmentCount
      ?`${summary28.iriAssessmentCount} hito${summary28.iriAssessmentCount===1?'':'s'} IRI confirmado${summary28.iriAssessmentCount===1?'':'s'}`
      :'Sin diagnóstico IRI confirmado',
    context:Number.isFinite(summary28.iriDelta)
      ?`Reevaluación disponible · diferencia de cobertura ${summary28.iriDelta>0?'+':''}${summary28.iriDelta}`
      :'El IRI establece el punto de partida; la evolución cotidiana se sigue por separado.',
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
