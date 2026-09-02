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

function finite(value){
  return value!==null&&
    value!==''&&
    Number.isFinite(Number(value));
}

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
  const quality=String(summary?.dataQuality||'')
    .trim()
    .toLowerCase();

  if(quality==='alta')return CONFIDENCE.HIGH;
  if(quality==='media')return CONFIDENCE.MEDIUM;
  if(quality==='limitada')return CONFIDENCE.LIMITED;

  return evidenceCount>=4
    ?CONFIDENCE.HIGH
    :evidenceCount>=2
      ?CONFIDENCE.MEDIUM
      :CONFIDENCE.LIMITED;
}

export function buildIberfitDecisionBrief({
  summary=null,
  alerts=[],
}={}){
  const safeSummary=
    summary&&typeof summary==='object'
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

  if(finite(safeSummary.adherence)){
    const adherence=Math.max(
      0,
      Math.min(
        1,
        Number(safeSummary.adherence)
      )
    );

    signals.push(
      `Adherencia confirmada: ${Math.round(adherence*100)}% (${number(safeSummary.completedSessions)} de ${number(safeSummary.plannedSessions)} sesiones).`
    );

    evidenceCount+=1;
  }else{
    limitations.push(
      'Adherencia no calculable con los datos actuales.'
    );
  }

  if(finite(safeSummary.averageRpe)){
    signals.push(
      `RPE medio confirmado: ${Number(safeSummary.averageRpe).toFixed(1)}.`
    );

    evidenceCount+=1;
  }else{
    limitations.push(
      'RPE medio no disponible.'
    );
  }

  if(safeSummary.lastExecutionAt){
    signals.push(
      'Existe una sesión confirmada reciente para contextualizar la siguiente decisión.'
    );

    evidenceCount+=1;
  }

  const checkins=number(safeSummary.checkins);

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

  const wearableDays=number(
    safeSummary?.wearable?.daysWithData
  );

  if(wearableDays>0){
    signals.push(
      `Hay ${wearableDays} día${wearableDays===1?'':'s'} con datos de dispositivo como contexto complementario.`
    );

    evidenceCount+=1;
  }else{
    limitations.push(
      'Sin datos de dispositivo confirmados; no se infieren valores.'
    );
  }

  const unconfirmed=number(
    safeSummary.unconfirmedExecutions
  );

  if(unconfirmed>0){
    limitations.push(
      `${unconfirmed} ejecución${unconfirmed===1?'':'es'} queda${unconfirmed===1?'':'n'} fuera del análisis por no estar confirmada${unconfirmed===1?'':'s'}.`
    );
  }

  if(!signals.length){
    signals.push(
      'Todavía no hay suficientes señales confirmadas para resumir la evolución.'
    );
  }

  const planned=number(
    safeSummary.plannedSessions
  );

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