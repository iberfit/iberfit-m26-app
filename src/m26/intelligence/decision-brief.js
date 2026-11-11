const PRIORITY=Object.freeze({
  critical:0,
  warning:1,
  info:2,
  neutral:3,
});

const CONFIDENCE=Object.freeze({
  HIGH:'alta',
  MEDIUM:'media',
  LIMITED:'limitada',
});

function measured(value,min=-Infinity,max=Infinity){
  // Boolean, blank, arrays and objects cannot become numeric evidence.
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'&&!value.trim())return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}
function validCount(value){
  const n=measured(value,0);
  return n!==null&&Number.isSafeInteger(n)?n:null;
}
function finite(value){return measured(value)!==null;}

function number(value,fallback=0){
  const parsed=Number(value);
  return Number.isFinite(parsed)
    ?parsed
    :fallback;
}

function sortedAlerts(alerts=[]){
  return [...(Array.isArray(alerts)?alerts:[])]
    .filter(Boolean)
    .sort(
      (a,b)=>
        (PRIORITY[a?.severity]??9)-
        (PRIORITY[b?.severity]??9)
    );
}

function confidenceFor(summary={},evidenceCount=0){
  // Qualitative cache flags alone do not establish actual evidence.
  if(evidenceCount<=0)return CONFIDENCE.LIMITED;
  const quality=String(summary?.dataQuality||'')
    .trim()
    .toLowerCase();

  if(quality==='alta')return evidenceCount>=3?CONFIDENCE.HIGH:
    evidenceCount>=2?CONFIDENCE.MEDIUM:CONFIDENCE.LIMITED;
  if(quality==='media')return evidenceCount>=2?CONFIDENCE.MEDIUM:CONFIDENCE.LIMITED;
  if(quality==='limitada')return CONFIDENCE.LIMITED;

  return evidenceCount>=4
    ?CONFIDENCE.HIGH
    :evidenceCount>=2
      ?CONFIDENCE.MEDIUM
      :CONFIDENCE.LIMITED;
}

function recentCompletedDate(value,{now,days}){
  if(typeof value!=='string'||!value.trim())return false;
  const date=new Date(value),end=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(date.getTime())||!Number.isFinite(end.getTime()))return false;
  const age=end.getTime()-date.getTime();
  const span=Number.isInteger(days)&&days>=1&&days<=365?days:28;
  return age>=0&&age<=span*86400000;
}
export function buildIberfitDecisionBrief({
  summary=null,
  alerts=[],
  now=new Date(),
}={}){
  const safeSummary=
    summary&&typeof summary==='object'&&!Array.isArray(summary)
      ?summary
      :{};

  const orderedAlerts=sortedAlerts(alerts);
  const topAlert=orderedAlerts[0]||null;

  const signals=[];
  const limitations=[];
  let evidenceCount=0;

  if(topAlert?.title){
    signals.push(
      `Señal prioritaria: ${String(topAlert.title)}.`
    );
    evidenceCount+=1;
  }

  const plannedCount=validCount(safeSummary.plannedSessions);
  const completedCount=validCount(safeSummary.completedSessions);
  const reportedAdherence=measured(safeSummary.adherence,0,1);
  const measuredAdherence=plannedCount!==null&&plannedCount>0
    &&completedCount!==null&&completedCount<=plannedCount
    ?completedCount/plannedCount:null;
  const adherence=measuredAdherence!==null
    &&(reportedAdherence===null||Math.abs(reportedAdherence-measuredAdherence)<=0.01)
    ?measuredAdherence:null;
  if(adherence!==null){
    signals.push(
      `Adherencia confirmada: ${Math.round(adherence*100)}% (${completedCount} de ${plannedCount} sesiones).`
    );

    evidenceCount+=1;
  }else{
    limitations.push(
      'Adherencia no calculable con los datos actuales.'
    );
  }

  const meanRpe=measured(safeSummary.averageRpe,1,10);
  if(meanRpe!==null){
    signals.push(
      `RPE medio confirmado: ${meanRpe.toFixed(1)}.`
    );

    evidenceCount+=1;
  }else{
    limitations.push(
      'RPE medio no disponible.'
    );
  }

  const recentExecution=recentCompletedDate(safeSummary.lastExecutionAt,{now,days:safeSummary.days});
  if(recentExecution){
    signals.push(
      'Existe una sesión confirmada reciente para contextualizar la siguiente decisión.'
    );
    evidenceCount+=1;
  }

  const checkins=validCount(safeSummary.checkins)??0;

  if(checkins>0){
    signals.push(
      `Hay ${checkins} registro${checkins===1?'':'s'} de bienestar confirmado${checkins===1?'':'s'} en la ventana actual.`
    );

    evidenceCount+=1;
  }else{
    limitations.push(
      'Sin registro de bienestar confirmado en la ventana actual.'
    );
  }

  const wearable=safeSummary?.wearable||{};
  const wearableDecision=wearable?.decision||{};
  const wearableDays=validCount(wearableDecision.currentEvidenceDays)??0;
  const wearableAvailableDays=validCount(wearable.daysWithData)??0;
  const providers=Array.isArray(wearableDecision.providers)?wearableDecision.providers:[];
  const wearableEligible=wearableDecision.eligible===true&&wearableDays>0
    &&wearableDays<=wearableAvailableDays&&providers.length===1
    &&typeof providers[0]==='string'&&providers[0].trim().length>0;

  if(wearableEligible){
    signals.push(
      `Hay ${wearableDays} día${wearableDays===1?'':'s'} con datos actuales de dispositivo como contexto complementario.`
    );

    evidenceCount+=1;
  }else if(wearableAvailableDays>0){
    limitations.push(
      `Hay ${wearableAvailableDays} día${wearableAvailableDays===1?'':'s'} con datos de dispositivo, pero su frescura (${String(wearable.freshness||'no confirmada')}) no permite tratarlos como evidencia actual.`
    );
  }else{
    limitations.push(
      'Sin datos de dispositivo confirmados; no se infieren valores.'
    );
  }

  const unconfirmed=validCount(
    safeSummary.unconfirmedExecutions
  )??0;

  if(unconfirmed>0){
    limitations.push(
      `${unconfirmed} ejecución${unconfirmed===1?'':'es'} queda${unconfirmed===1?'':'n'} fuera del análisis por no estar confirmada${unconfirmed===1?'':'s'}.`
    );
  }
  // Do not displace higher-priority missing check-in or device evidence in
  // the Coach cockpit; the old date still remains an explicit limitation.
  if(safeSummary.lastExecutionAt&&!recentExecution){
    limitations.push(
      'La última ejecución conocida no acredita una sesión reciente.'
    );
  }

  if(!signals.length){
    signals.push(
      'Todavía no hay suficientes señales confirmadas para resumir la evolución.'
    );
  }

  const planned=plannedCount??0;

  const nextStep=
    String(topAlert?.action||'').trim()||
    (
      planned===0
        ?'Revisar la planificación y confirmar el siguiente objetivo operativo.'
        :'Revisar la última ejecución, el bienestar y la planificación antes de modificar la carga.'
    );

  return Object.freeze({
    mode:'deterministic-explainable',
    headline:String(
      topAlert?.title||
      'Seguimiento listo para revisión profesional'
    ),
    confidence:confidenceFor(
      safeSummary,
      evidenceCount
    ),
    signals:Object.freeze(
      signals.slice(0,6)
    ),
    limitations:Object.freeze(
      limitations.slice(0,5)
    ),
    nextStep,
    evidenceCount,
    safetyNote:'Apoyo a la decisión: no diagnostica, no modifica cargas, no publica sesiones y no sustituye el criterio profesional.',
  });
}