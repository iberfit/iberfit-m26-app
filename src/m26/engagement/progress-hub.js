import {buildAdherenceWindows} from './progress-continuity.js';
import {computeProgressSummary} from './progress-engine.js';
import {buildExerciseLongitudinalProgress} from './exercise-performance-engine.js';

function finite(value){const number=Number(value);return Number.isFinite(number)?number:null;}
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
function trendEvidence(exercises=[]){
  const comparable=exercises.filter((exercise)=>
    ['up','down','stable'].includes(exercise?.loadTrend?.direction)||
    ['up','down','stable'].includes(exercise?.repsTrend?.direction)||
    ['up','down','stable'].includes(exercise?.volumeTrend?.direction)
  );
  const improving=comparable.filter((exercise)=>
    [exercise?.loadTrend?.direction,exercise?.repsTrend?.direction,exercise?.volumeTrend?.direction].includes('up')
  );
  return Object.freeze({
    comparable:comparable.length,
    improving:improving.length,
    ratio:comparable.length?improving.length/comparable.length:null,
  });
}

export function buildProgressHub(state,clientId,{now=new Date()}={}){
  if(!clientId)return null;
  const summary28=computeProgressSummary(state,clientId,{now,days:28});
  if(!summary28)return null;
  const windows=buildAdherenceWindows(state,clientId,{now,windows:[7,28,90]});
  const byDays=new Map(windows.map((window)=>[window.days,window]));
  const longitudinal=buildExerciseLongitudinalProgress(state,clientId,{limitPerExercise:12});
  const strength=trendEvidence(longitudinal.exercises||[]);
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
      context:`${longitudinal.totalExercises} ejercicios con historial · ${longitudinal.totalExecutions} ejecuciones aceptadas`,
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
      id:'iri',
      label:'IRI',
      status:iriCoverage===null?'insufficient':iriCoverage>=3?'strong':iriCoverage>=1?'building':'review',
      value:iriCoverage,
      unit:'de 3 dominios',
      evidence:summary28.iriAssessmentCount?`${summary28.iriAssessmentCount} evaluación${summary28.iriAssessmentCount===1?'':'es'} registrada${summary28.iriAssessmentCount===1?'':'s'}`:'Sin evaluación IRI comparable',
      context:Number.isFinite(summary28.iriDelta)?`Cambio de cobertura ${summary28.iriDelta>0?'+':''}${summary28.iriDelta}`:'Sin comparación suficiente',
      source:'iriAssessments',
      quality:iriCoverage===3?'alta':iriCoverage?'media':'limitada',
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

  const actionable=pillars.filter((pillar)=>pillar.status==='review');
  const evidenceCount=pillars.filter((pillar)=>pillar.status!=='insufficient').length;
  return Object.freeze({
    clientId,
    generatedAt:new Date(now).toISOString(),
    pillars,
    evidenceCount,
    totalPillars:pillars.length,
    actionable:Object.freeze(actionable.map((pillar)=>pillar.id)),
    headline:evidenceCount
      ?`${evidenceCount} de ${pillars.length} áreas con evidencia reciente`
      :'Construyendo tu línea base de progreso',
    note:'Progress Hub reúne señales confirmadas sin convertirlas en una puntuación global ni modificar automáticamente la planificación.',
  });
}
