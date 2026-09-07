import {buildProgressHub} from '../engagement/progress-hub.js';

const DAY_MS=86_400_000;
const REPORT_TYPES=Object.freeze([
  Object.freeze({id:'iri',label:'Diagnóstico IRI',cadence:'evaluación'}),
  Object.freeze({id:'post-session',label:'Informe post-sesión',cadence:'sesión'}),
  Object.freeze({id:'monthly',label:'Informe mensual',cadence:'mensual'}),
  Object.freeze({id:'reassessment',label:'Informe de reevaluación',cadence:'reevaluación'}),
  Object.freeze({id:'quarterly',label:'Informe trimestral',cadence:'trimestral'}),
  Object.freeze({id:'year-in-iberfit',label:'Year in IBERFIT',cadence:'anual'}),
]);

function body(record={}){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:record||{};}
function value(record,...keys){const source=body(record);for(const key of keys){const candidate=record?.[key]??source?.[key];if(candidate!==undefined&&candidate!==null&&candidate!=='')return candidate;}return null;}
function clientOf(record){return String(value(record,'clientId','client_id')||'').trim();}
function forClient(state,key,clientId){return (state?.collections?.[key]||[]).filter((record)=>clientOf(record)===String(clientId||''));}
function civil(value){const text=String(value||'').trim();const match=text.match(/^(\d{4}-\d{2}-\d{2})/);if(!match)return null;const date=new Date(`${match[1]}T00:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===match[1]?match[1]:null;}
function recordDate(record){return civil(value(record,'completedAt','completed_at','executedAt','executed_at','assessmentDate','assessment_date','evaluatedAt','evaluated_at','startAt','start_at','date','createdAt','created_at'));}
function timestamp(date){return date?new Date(`${date}T00:00:00Z`).getTime():NaN;}
function sortNewest(records){return [...records].sort((a,b)=>(timestamp(recordDate(b))||0)-(timestamp(recordDate(a))||0));}
function dateOffset(endDate,days){const time=timestamp(endDate);if(!Number.isFinite(time))return null;return new Date(time-(Math.max(1,days)-1)*DAY_MS).toISOString().slice(0,10);}
function inWindow(record,start,end){const date=recordDate(record);return Boolean(date&&date>=start&&date<=end);}
function text(value,max=700){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max);}
function confirmedIri(record){const status=String(value(record,'status','estado')||'').toLowerCase();return Boolean(value(record,'firstSessionCompletedAt','first_session_completed_at'))||/(?:complet|confirmad|approved|aprob)/i.test(status);}
function objectiveMeasurement(candidate){if(candidate===null||candidate===undefined||candidate==='')return false;if(Number.isFinite(Number(candidate)))return true;if(Array.isArray(candidate))return candidate.some(objectiveMeasurement);if(typeof candidate==='object')return Object.values(candidate).some(objectiveMeasurement);return false;}
function iriCoverage(record){if(!record)return 0;const cardio=Number.isFinite(Number(value(record,'stepFinalHr','step_final_hr')))&&Number.isFinite(Number(value(record,'stepOneMinuteHr','step_one_minute_hr')));const composition=objectiveMeasurement(value(record,'bodyComposition','body_composition'));const strength=objectiveMeasurement(value(record,'strengthPatterns','strength_patterns'));return [cardio,composition,strength].filter(Boolean).length;}
function evidence(label,value,source,quality='confirmada'){return Object.freeze({label,text:text(value,500),source,quality});}
function base({id,label,ready,reason,periodStart,periodEnd,title,summary,conclusions,recommendations,evidenceRows=[],assessmentId=null}){
  return Object.freeze({
    id,label,status:ready?'ready':'insufficient-data',ready:Boolean(ready),reason:ready?null:text(reason,500),
    periodStart:periodStart||null,periodEnd:periodEnd||null,title:text(title,140),summary:text(summary,2500),conclusions:text(conclusions,2500),recommendations:text(recommendations,2500),
    evidence:Object.freeze(evidenceRows),assessmentId:assessmentId?String(assessmentId):null,
    coachComment:'',coachCommentLabel:'Comentario del coach',dataPolicy:'canonical-only',
  });
}
function iriId(record){return value(record,'id');}
function sessionLabel(record){return text(value(record,'title','name','nombre')||'Sesión IBERFIT',120);}
function readyNarrative(parts){return parts.filter(Boolean).join(' ');}

export const PREMIUM_REPORT_TYPES=REPORT_TYPES;

export function buildPremiumReportPortfolio(state,clientId,{now=new Date()}={}){
  if(!clientId)return Object.freeze([]);
  const end=new Date(now).toISOString().slice(0,10);
  const iris=sortNewest(forClient(state,'iriAssessments',clientId).filter(confirmedIri));
  const executions=sortNewest(forClient(state,'sessionExecutions',clientId).filter((record)=>recordDate(record)));
  const latestIri=iris[0]||null;
  const latestExecution=executions[0]||null;
  const progress=buildProgressHub(state,clientId,{now});
  const progressEvidence=(progress?.pillars||[]).filter((pillar)=>pillar.status!=='insufficient');
  const latestIriDate=recordDate(latestIri);
  const latestSessionDate=recordDate(latestExecution);
  const assessmentId=iriId(latestIri);
  const coverage=iriCoverage(latestIri);

  const monthlyStart=dateOffset(end,30);
  const quarterlyStart=dateOffset(end,90);
  const yearlyStart=dateOffset(end,365);
  const monthlySessions=executions.filter((record)=>inWindow(record,monthlyStart,end));
  const quarterlySessions=executions.filter((record)=>inWindow(record,quarterlyStart,end));
  const yearlySessions=executions.filter((record)=>inWindow(record,yearlyStart,end));
  const datedHistory=[...executions,...iris].map(recordDate).filter(Boolean).sort();
  const historyDays=datedHistory.length?Math.floor((timestamp(end)-timestamp(datedHistory[0]))/DAY_MS)+1:0;

  const iriReady=Boolean(latestIri&&latestIriDate);
  const iriReport=base({
    id:'iri',label:'Diagnóstico IRI',ready:iriReady,
    reason:'Se necesita una evaluación IRI confirmada para generar este documento.',
    periodStart:latestIriDate,periodEnd:latestIriDate,assessmentId,
    title:'Diagnóstico IRI',
    summary:iriReady?`Evaluación IRI confirmada el ${latestIriDate}, con evidencia objetiva registrada en ${coverage} de 3 dominios.`:'',
    conclusions:iriReady?`El informe conserva únicamente los dominios medidos y mantiene como no evaluado cualquier dominio sin evidencia confirmada.`:'',
    recommendations:iriReady?'Revisar el diagnóstico IRI confirmado y definir los próximos pasos de entrenamiento según los resultados registrados.':'',
    evidenceRows:iriReady?[evidence('Cobertura objetiva',`${coverage} de 3 dominios registrados`,'iriAssessments')]:[],
  });

  const postReady=Boolean(latestExecution&&latestSessionDate&&assessmentId);
  const postReport=base({
    id:'post-session',label:'Informe post-sesión',ready:postReady,
    reason:assessmentId?'Se necesita al menos una ejecución de sesión confirmada.':'Se necesita un IRI confirmado y una ejecución de sesión confirmada.',
    periodStart:latestSessionDate,periodEnd:latestSessionDate,assessmentId,
    title:latestExecution?`Post-sesión · ${sessionLabel(latestExecution)}`:'Informe post-sesión',
    summary:postReady?`Sesión confirmada el ${latestSessionDate}: ${sessionLabel(latestExecution)}. El documento se limita a la evidencia registrada en la ejecución.`:'',
    conclusions:postReady?'La sesión consta como ejecutada en el historial canónico del cliente; no se añaden métricas que no estén registradas.':'',
    recommendations:postReady?'Añadir la interpretación profesional del coach y utilizarla para orientar la siguiente sesión sin modificar automáticamente la planificación.':'',
    evidenceRows:postReady?[evidence('Sesión confirmada',`${sessionLabel(latestExecution)} · ${latestSessionDate}`,'sessionExecutions')]:[],
  });

  const monthlyReady=Boolean(assessmentId&&monthlySessions.length>0&&progressEvidence.length>0);
  const monthlyReport=base({
    id:'monthly',label:'Informe mensual',ready:monthlyReady,
    reason:assessmentId?'Se necesita al menos una sesión confirmada y una señal de progreso con evidencia en los últimos 30 días.':'Se necesita un IRI confirmado antes de preparar el informe mensual.',
    periodStart:monthlyStart,periodEnd:end,assessmentId,title:'Informe mensual IBERFIT',
    summary:monthlyReady?`En los últimos 30 días constan ${monthlySessions.length} sesión${monthlySessions.length===1?'':'es'} ejecutada${monthlySessions.length===1?'':'s'} y ${progressEvidence.length} área${progressEvidence.length===1?'':'s'} del Progress Hub con evidencia reciente.`:'',
    conclusions:monthlyReady?readyNarrative(progressEvidence.slice(0,3).map((pillar)=>`${pillar.label}: ${pillar.evidence}.`)):'',
    recommendations:monthlyReady?'Revisar con el cliente la evolución del periodo y registrar el comentario profesional antes de aprobar o publicar el informe.':'',
    evidenceRows:monthlyReady?[evidence('Sesiones ejecutadas',String(monthlySessions.length),'sessionExecutions'),...progressEvidence.slice(0,4).map((pillar)=>evidence(pillar.label,pillar.evidence,pillar.source,pillar.quality))]:[],
  });

  const previousIri=iris[1]||null;
  const previousDate=recordDate(previousIri);
  const reassessmentReady=Boolean(assessmentId&&previousIri&&latestIriDate&&previousDate);
  const previousCoverage=iriCoverage(previousIri);
  const reassessmentReport=base({
    id:'reassessment',label:'Informe de reevaluación',ready:reassessmentReady,
    reason:'Se necesitan al menos dos evaluaciones IRI confirmadas y fechadas para comparar sin inventar resultados.',
    periodStart:previousDate,periodEnd:latestIriDate,assessmentId,title:'Reevaluación IBERFIT',
    summary:reassessmentReady?`Comparación entre evaluaciones IRI confirmadas del ${previousDate} y ${latestIriDate}. Cobertura objetiva registrada: ${previousCoverage} de 3 dominios en la evaluación anterior y ${coverage} de 3 en la actual.`:'',
    conclusions:reassessmentReady?'La comparación se limita a la cobertura y a los resultados realmente registrados en ambas evaluaciones; los dominios ausentes no se estiman.':'',
    recommendations:reassessmentReady?'Interpretar los cambios con criterio profesional y decidir si corresponde mantener, progresar o revisar la planificación.':'',
    evidenceRows:reassessmentReady?[evidence('IRI anterior',`${previousDate} · ${previousCoverage}/3 dominios`,'iriAssessments'),evidence('IRI actual',`${latestIriDate} · ${coverage}/3 dominios`,'iriAssessments')]:[],
  });

  const quarterlyReady=Boolean(assessmentId&&quarterlySessions.length>0&&progressEvidence.length>=2);
  const quarterlyReport=base({
    id:'quarterly',label:'Informe trimestral',ready:quarterlyReady,
    reason:assessmentId?'Se necesita al menos una sesión confirmada y dos áreas de progreso con evidencia suficiente en el seguimiento reciente.':'Se necesita un IRI confirmado antes de preparar el informe trimestral.',
    periodStart:quarterlyStart,periodEnd:end,assessmentId,title:'Informe trimestral IBERFIT',
    summary:quarterlyReady?`En la ventana de 90 días constan ${quarterlySessions.length} sesiones ejecutadas y ${progressEvidence.length} áreas de progreso con evidencia confirmada.`:'',
    conclusions:quarterlyReady?readyNarrative(progressEvidence.slice(0,4).map((pillar)=>`${pillar.label}: ${pillar.evidence}.`)):'',
    recommendations:quarterlyReady?'Revisar objetivos, continuidad y próximos hitos con el cliente antes de aprobar el informe trimestral.':'',
    evidenceRows:quarterlyReady?[evidence('Sesiones ejecutadas',String(quarterlySessions.length),'sessionExecutions'),...progressEvidence.slice(0,5).map((pillar)=>evidence(pillar.label,pillar.evidence,pillar.source,pillar.quality))]:[],
  });

  const yearReady=Boolean(assessmentId&&historyDays>=300&&yearlySessions.length>0&&progressEvidence.length>0);
  const yearReport=base({
    id:'year-in-iberfit',label:'Year in IBERFIT',ready:yearReady,
    reason:assessmentId?'Se necesitan al menos 300 días de historial canónico, una sesión ejecutada en el último año y evidencia reciente de progreso.':'Se necesita un IRI confirmado antes de construir Year in IBERFIT.',
    periodStart:yearlyStart,periodEnd:end,assessmentId,title:'Year in IBERFIT',
    summary:yearReady?`El historial canónico cubre ${historyDays} días y registra ${yearlySessions.length} sesiones ejecutadas en los últimos 365 días.`:'',
    conclusions:yearReady?readyNarrative(progressEvidence.slice(0,4).map((pillar)=>`${pillar.label}: ${pillar.evidence}.`)):'',
    recommendations:yearReady?'Cerrar el año con la interpretación del coach, reconocer los hitos confirmados y acordar el siguiente ciclo de objetivos.':'',
    evidenceRows:yearReady?[evidence('Historial disponible',`${historyDays} días`,'canonical-store'),evidence('Sesiones del último año',String(yearlySessions.length),'sessionExecutions'),...progressEvidence.slice(0,4).map((pillar)=>evidence(pillar.label,pillar.evidence,pillar.source,pillar.quality))]:[],
  });

  return Object.freeze([iriReport,postReport,monthlyReport,reassessmentReport,quarterlyReport,yearReport]);
}

export function premiumReportByType(state,clientId,type,options={}){
  return buildPremiumReportPortfolio(state,clientId,options).find((report)=>report.id===String(type||''))||null;
}
