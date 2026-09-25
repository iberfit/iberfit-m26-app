import { computeProgressSummary, progressWindow } from './progress-engine.js';
function clone(value){return value==null?value:structuredClone(value);}
function arr(value){return Array.isArray(value)?value:[];}
function first(record,...keys){for(const key of keys){const value=record?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function clientIdOf(record){return first(record,'clientId','client_id','clienteId','cliente_id');}
function safeDate(value){const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date:null;}
function endDateOf(record){return first(record,'endAt','end_at','endDate','end_date','fechaFin','fecha_fin');}
function statusOf(record){return String(first(record,'status','estado')||'').toLowerCase();}
function daysBetween(a,b){return Math.ceil((b.getTime()-a.getTime())/86400000);}
function makeSignal(id,severity,title,detail,action,source){return Object.freeze({id,severity,title,detail,action,source});}
function unwrap(record){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?{...record,...record.body}:record;}
function executionDate(record){return first(record,'completedAt','completed_at','endedAt','ended_at','recordedAt','recorded_at','createdAt','created_at','date','fecha');}
function blockedCompletionIds(state){
  const ids=new Set();
  for(const key of ['pendingOperations','conflicts','rejectedOperations']){
    for(const operation of arr(state?.[key])){
      const item=unwrap(operation)||{};
      const type=String(first(item,'type','commandType','command_type')||'').trim().toUpperCase();
      if(type!=='EJECUCION_COMPLETAR')continue;
      const entityId=first(item,'entityId','entity_id','executionId','execution_id');
      if(entityId)ids.add(String(entityId));
    }
  }
  return ids;
}
function latestConfirmedExecution(state,clientId,{now=new Date()}={}){
  const {start,end}=progressWindow({now,days:28});
  const blocked=blockedCompletionIds(state);
  return arr(state?.collections?.sessionExecutions)
    .map(unwrap)
    .filter((item)=>clientIdOf(item)===clientId)
    .filter((item)=>['completed','complete','completado'].includes(statusOf(item)))
    .filter((item)=>{
      const id=String(first(item,'id','executionId','execution_id')||'');
      const sync=String(first(item,'syncStatus','sync_status')||'').trim().toLowerCase();
      return (!sync||sync==='clean')&&!blocked.has(id);
    })
    .filter((item)=>{
      const date=safeDate(executionDate(item));
      return date&&date.getTime()>=start.getTime()&&date.getTime()<=end.getTime();
    })
    .sort((a,b)=>(safeDate(executionDate(b))?.getTime()||0)-(safeDate(executionDate(a))?.getTime()||0))[0]||null;
}
function postSessionFeedbackSignal(state,clientId,{now=new Date()}={}){
  const execution=latestConfirmedExecution(state,clientId,{now});
  const feedback=execution?.feedback&&typeof execution.feedback==='object'?execution.feedback:null;
  if(!feedback||feedback.pain!==true)return null;
  return makeSignal(
    'post-session-discomfort',
    'warning',
    'Molestia informada tras la última sesión',
    'El cierre de la última sesión confirmada incluye dolor o molestia. Es contexto de seguimiento y no un diagnóstico.',
    'Revisar el cierre con el cliente antes de decidir cualquier ajuste del siguiente entrenamiento.',
    'feedback_sesion',
  );
}

const ADHERENCE_TRAJECTORY_DELTA=0.15;
const ADHERENCE_TRAJECTORY_EVIDENCE=Object.freeze({d7:1,d28:3,d90:6});
function round(value,digits=3){if(!Number.isFinite(value))return null;const power=10**digits;return Math.round(value*power)/power;}
function percentText(value){return Number.isFinite(value)?`${Math.round(value*100)}%`:'—';}
function trajectoryWindow(summary,days){
  const planned=Number(summary?.plannedSessions||0);
  const completed=Number(summary?.completedSessions||0);
  const adherence=Number.isFinite(summary?.adherence)?summary.adherence:null;
  return Object.freeze({
    days,
    adherence,
    plannedSessions:Number.isFinite(planned)?planned:0,
    completedSessions:Number.isFinite(completed)?completed:0,
    dataQuality:summary?.dataQuality||null,
    evidence:adherence!==null&&planned>=ADHERENCE_TRAJECTORY_EVIDENCE[`d${days}`],
  });
}
function trajectoryCopy(status){
  if(status==='slipping')return Object.freeze({
    label:'Continuidad reciente en descenso',
    tone:'warning',
    clientMessage:'Esta semana tu continuidad está por debajo de tu referencia de las últimas cuatro semanas. Retomar el próximo paso previsto aporta más que intentar compensar lo anterior.',
    coachAction:'Revisar qué cambió recientemente —agenda, fricción, comprensión o tolerancia— antes de modificar carga o planificación.',
  });
  if(status==='recovering')return Object.freeze({
    label:'Recuperando continuidad',
    tone:'success',
    clientMessage:'Esta semana recuperaste continuidad respecto a tus últimas cuatro semanas. Mantener el siguiente entrenamiento previsto es la señal útil ahora.',
    coachAction:'Consolidar el patrón que facilitó la recuperación y evitar aumentar carga solo por un rebote reciente de adherencia.',
  });
  if(status==='sustained-low')return Object.freeze({
    label:'Continuidad baja sostenida',
    tone:'warning',
    clientMessage:'La continuidad lleva varias semanas por debajo de lo previsto. El objetivo es identificar qué está dificultando sostener el plan y ajustarlo contigo, no compensar sesiones.',
    coachAction:'Diferenciar barreras persistentes de una planificación poco sostenible y acordar un ajuste que mejore continuidad sin prescribir automáticamente.',
  });
  if(status==='below-plan')return Object.freeze({
    label:'Continuidad por debajo de lo previsto',
    tone:'attention',
    clientMessage:'En las últimas semanas completaste menos sesiones de las previstas. Aún no hay suficiente horizonte para llamarlo una tendencia sostenida.',
    coachAction:'Revisar barreras y contexto antes de interpretar el dato como una tendencia o cambiar el plan.',
  });
  if(status==='stable')return Object.freeze({
    label:'Continuidad estable',
    tone:'neutral',
    clientMessage:'Tu continuidad reciente está alineada con tus últimas semanas. Mantén el siguiente paso previsto sin necesidad de compensar.',
    coachAction:'Mantener seguimiento; la adherencia por sí sola no exige una intervención ni un cambio de carga.',
  });
  return Object.freeze({
    label:'Aún sin trayectoria fiable',
    tone:'neutral',
    clientMessage:'Aún faltan sesiones planificadas y confirmadas para comparar 7, 28 y 90 días con suficiente contexto.',
    coachAction:'No interpretar una tendencia todavía; completar datos confirmados y revisar de nuevo cuando exista evidencia mínima.',
  });
}

export function deriveAdherenceTrajectoryFromSummaries({d7=null,d28=null,d90=null}={}){
  const windows=Object.freeze({
    d7:trajectoryWindow(d7,7),
    d28:trajectoryWindow(d28,28),
    d90:trajectoryWindow(d90,90),
  });
  const delta7Vs28=
    Number.isFinite(windows.d7.adherence)&&Number.isFinite(windows.d28.adherence)
      ?round(windows.d7.adherence-windows.d28.adherence)
      :null;
  const delta28Vs90=
    Number.isFinite(windows.d28.adherence)&&Number.isFinite(windows.d90.adherence)
      ?round(windows.d28.adherence-windows.d90.adherence)
      :null;
  const comparableShortMid=windows.d7.evidence&&windows.d28.evidence;
  const comparableLong=windows.d90.evidence;
  let status='insufficient';
  if(comparableShortMid&&delta7Vs28<=-ADHERENCE_TRAJECTORY_DELTA){
    status='slipping';
  }else if(comparableShortMid&&delta7Vs28>=ADHERENCE_TRAJECTORY_DELTA){
    status='recovering';
  }else if(
    windows.d28.evidence&&
    comparableLong&&
    windows.d28.adherence<0.6&&
    windows.d90.adherence<0.6
  ){
    status='sustained-low';
  }else if(windows.d28.evidence&&windows.d28.adherence<0.6){
    status='below-plan';
  }else if(windows.d28.evidence){
    status='stable';
  }
  const copy=trajectoryCopy(status);
  const evidence=comparableShortMid?(comparableLong?'high':'medium'):'limited';
  return Object.freeze({
    status,
    label:copy.label,
    tone:copy.tone,
    clientMessage:copy.clientMessage,
    coachAction:copy.coachAction,
    evidence,
    delta7Vs28,
    delta28Vs90,
    windows,
    summary:`7 días ${percentText(windows.d7.adherence)} · 28 días ${percentText(windows.d28.adherence)} · 90 días ${percentText(windows.d90.adherence)}`,
    semantics:Object.freeze({
      overlappingWindows:true,
      meaningfulDelta:ADHERENCE_TRAJECTORY_DELTA,
      evidenceRules:ADHERENCE_TRAJECTORY_EVIDENCE,
      interpretation:'Las ventanas 7/28/90 son referencias solapadas de continuidad; describen señal temporal y no causalidad.',
      automaticPrescription:false,
    }),
  });
}

export function deriveAdherenceTrajectory(state,clientId,{now=new Date(),summaries=null,summary:providedSummary=null}={}){
  if(!clientId)return deriveAdherenceTrajectoryFromSummaries();
  const d28=
    summaries?.d28?.clientId===clientId&&Number(summaries?.d28?.days)===28
      ?summaries.d28
      :providedSummary?.clientId===clientId&&Number(providedSummary?.days)===28
        ?providedSummary
        :computeProgressSummary(state,clientId,{now,days:28});
  const d7=
    summaries?.d7?.clientId===clientId&&Number(summaries?.d7?.days)===7
      ?summaries.d7
      :computeProgressSummary(state,clientId,{now,days:7});
  const d90=
    summaries?.d90?.clientId===clientId&&Number(summaries?.d90?.days)===90
      ?summaries.d90
      :computeProgressSummary(state,clientId,{now,days:90});
  return deriveAdherenceTrajectoryFromSummaries({d7,d28,d90});
}

export function deriveAdherenceAlerts(state,clientId,{now=new Date(),summary:providedSummary=null,trajectory:providedTrajectory=null,summaries=null}={}){
  const summary=
    providedSummary?.clientId===clientId&&Number(providedSummary?.days)===28
      ?providedSummary
      :computeProgressSummary(state,clientId,{now,days:28});
  if(!summary)return [];
  const trajectory=providedTrajectory||deriveAdherenceTrajectory(state,clientId,{now,summaries,summary});
  const alerts=[];
  const checkin=summary.latestCheckin||{};
  if(Number.isFinite(checkin.pain)&&checkin.pain>=6)alerts.push(makeSignal('pain-high','critical','Dolor elevado informado','El último registro de bienestar indica dolor igual o superior a 6/10. No corresponde progresar automáticamente la carga.','Revisar con el cliente antes de la próxima sesión.','registro_bienestar'));
  if((Number.isFinite(checkin.sleep)&&checkin.sleep<=4)||(Number.isFinite(checkin.energy)&&checkin.energy<=4)||(Number.isFinite(checkin.stress)&&checkin.stress>=8))alerts.push(makeSignal('recovery-context','warning','Recuperación condicionada','Sueño, energía o estrés sugieren adaptar el contexto de la sesión, sin asumir una causa clínica.','Valorar mantener, descargar o priorizar técnica.','registro_bienestar'));
  const postSession=postSessionFeedbackSignal(state,clientId,{now});
  if(postSession)alerts.push(postSession);
  if(trajectory.status==='slipping')alerts.push(makeSignal('adherence-slipping','warning','Caída reciente de continuidad',`${trajectory.summary}. La referencia de 7 días está al menos 15 puntos porcentuales por debajo de la de 28 días; las ventanas se solapan y se usa como señal temprana, no como explicación causal.`,trajectory.coachAction,'sessions'));
  if(Number.isFinite(summary.adherence)&&summary.plannedSessions>=3&&summary.adherence<0.6)alerts.push(makeSignal('adherence-low','warning','Adherencia por debajo de lo previsto',`Se completó el ${Math.round(summary.adherence*100)}% de las sesiones planificadas en 28 días.`,'Revisar barreras de agenda, comprensión o tolerancia.','sessions'));
  if(summary.plannedSessions>0&&summary.completedSessions===0)alerts.push(makeSignal('no-completions','critical','Sin sesiones completadas en el periodo','Existen sesiones planificadas, pero ninguna ejecución confirmada durante la ventana analizada.','Contactar y verificar continuidad del plan.','sessions'));
  if(!summary.lastExecutionAt)alerts.push(makeSignal('execution-missing','info','Sin historial suficiente de ejecución','Todavía no hay una ejecución confirmada para interpretar progreso o carga.','Mantener el dato como ausente; no convertirlo en cero.','data-quality'));
  const cycles=arr(state?.collections?.trainingCycles).filter((item)=>clientIdOf(item)===clientId&&!['archivado','archived','cancelado','cancelled'].includes(statusOf(item)));
  for(const cycle of cycles){const end=safeDate(endDateOf(cycle));if(!end)continue;const remaining=daysBetween(now,end);if(remaining>=0&&remaining<=7){alerts.push(makeSignal(`cycle-ending-${first(cycle,'id')||remaining}`,'info','Ciclo próximo a finalizar',`El ciclo activo termina en ${remaining} día${remaining===1?'':'s'}.`,'Preparar revisión, informe o siguiente ciclo.','planning'));break;}}
  if(summary.dataQuality==='limitada')alerts.push(makeSignal('data-limited','info','Datos todavía limitados','La interpretación se basa en pocos registros confirmados.','Mostrar tendencias con cautela y priorizar recolección consistente.','data-quality'));
  const priority={critical:0,warning:1,info:2};
  return alerts.sort((a,b)=>priority[a.severity]-priority[b.severity]).map(clone);
}

// RC70_4_FOLLOWUP_PLAN_BEGIN
const followUpPriority=Object.freeze({
  critical:0,
  warning:1,
  info:2,
});

function followUpTopAlert(alerts=[]){
  return [...(Array.isArray(alerts)?alerts:[])]
    .filter(Boolean)
    .sort(
      (a,b)=>
        (followUpPriority[a?.severity]??9)-
        (followUpPriority[b?.severity]??9)
    )[0]||null;
}

function followUpActionFor(alert){
  const id=String(alert?.id||'');
  const source=String(alert?.source||'');

  if(id==='pain-high'){
    return Object.freeze({
      title:'Revisar antes de la próxima sesión',
      detail:'Hay un registro de dolor que requiere contexto humano antes de decidir sobre la sesión.',
      primaryArea:'actividad',
      primaryLabel:'Revisar bienestar',
      secondaryArea:'agenda',
      secondaryLabel:'Revisar agenda',
    });
  }

  if(id==='post-session-discomfort'){
    return Object.freeze({
      title:'Revisar el cierre de la última sesión',
      detail:'La última sesión confirmada terminó con una molestia informada. El dato aporta contexto, pero no prescribe cambios por sí solo.',
      primaryArea:'progreso',
      primaryLabel:'Abrir Cliente 360',
      secondaryArea:'sesion',
      secondaryLabel:'Revisar sesiones',
    });
  }

  if(id==='recovery-context'){
    return Object.freeze({
      title:'Revisar contexto de recuperación',
      detail:'Conviene revisar sueño, energía o estrés antes de decidir cualquier ajuste.',
      primaryArea:'actividad',
      primaryLabel:'Ver registros',
      secondaryArea:'sesion',
      secondaryLabel:'Revisar sesión',
    });
  }

  if(
    id==='adherence-low'||
    id==='adherence-slipping'||
    id==='no-completions'
  ){
    return Object.freeze({
      title:'Recuperar continuidad',
      detail:'La prioridad es entender barreras reales de agenda, ejecución o comprensión antes de modificar el plan.',
      primaryArea:'agenda',
      primaryLabel:'Revisar agenda',
      secondaryArea:'progreso',
      secondaryLabel:'Ver adherencia',
    });
  }

  if(
    id.startsWith('cycle-ending-')||
    source==='planning'
  ){
    return Object.freeze({
      title:'Preparar el siguiente ciclo',
      detail:'El ciclo está próximo a finalizar y requiere revisión profesional antes de publicar cambios.',
      primaryArea:'planificacion',
      primaryLabel:'Abrir planificación',
      secondaryArea:'informes',
      secondaryLabel:'Revisar informe',
    });
  }

  if(
    id==='execution-missing'||
    id==='data-limited'||
    source==='data-quality'
  ){
    return Object.freeze({
      title:'Mejorar la calidad del seguimiento',
      detail:'Faltan datos confirmados suficientes para interpretar progreso con confianza.',
      primaryArea:'progreso',
      primaryLabel:'Ver progreso',
      secondaryArea:'actividad',
      secondaryLabel:'Revisar registros',
    });
  }

  return Object.freeze({
    title:'Seguimiento al día',
    detail:'No hay una señal prioritaria que obligue a cambiar el plan con los datos confirmados disponibles.',
    primaryArea:'progreso',
    primaryLabel:'Ver progreso',
    secondaryArea:'agenda',
    secondaryLabel:'Revisar agenda',
  });
}

export function buildCoachFollowUpPlan(alerts=[]){
  const topAlert=followUpTopAlert(alerts);
  const action=followUpActionFor(topAlert);
  const severity=topAlert?.severity||'clear';

  return Object.freeze({
    level:severity,
    signalId:topAlert?.id||null,
    source:topAlert?.source||null,
    signalTitle:topAlert?.title||'Sin señales prioritarias',
    signalDetail:topAlert?.detail||'No hay señales que requieran una acción adicional con los datos confirmados disponibles.',
    actionTitle:action.title,
    actionDetail:action.detail,
    primaryArea:action.primaryArea,
    primaryLabel:action.primaryLabel,
    secondaryArea:action.secondaryArea,
    secondaryLabel:action.secondaryLabel,
    requiresCoachDecision:true,
    autoPrescription:false,
    autoMessage:false,
    provenance:'deterministic-confirmed-data',
  });
}
// RC70_4_FOLLOWUP_PLAN_END

export function adherenceSignal(alerts=[]){
  const list=arr(alerts);if(list.some((item)=>item.severity==='critical'))return {level:'critical',label:'Revisión prioritaria'};
  if(list.some((item)=>item.severity==='warning'))return {level:'warning',label:'Requiere contexto'};
  if(list.length)return {level:'info',label:'Seguimiento activo'};
  return {level:'clear',label:'Sin alertas'};
}