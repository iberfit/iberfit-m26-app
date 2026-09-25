import { computeProgressSummary, progressWindow } from './progress-engine.js';
function clone(value){return value==null?value:structuredClone(value);}
function arr(value){return Array.isArray(value)?value:[];}
function first(record,...keys){for(const key of keys){const value=record?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function clientIdOf(record){return first(record,'clientId','client_id','clienteId','cliente_id');}
function safeDate(value){const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date:null;}
function endDateOf(record){return first(record,'endAt','end_at','endDate','end_date','fechaFin','fecha_fin');}
function statusOf(record){return String(first(record,'status','estado')||'').toLowerCase();}
function daysBetween(a,b){return Math.ceil((b.getTime()-a.getTime())/86400000);}
function makeSignal(id,severity,title,detail,action,source,meta=null){return Object.freeze({id,severity,title,detail,action,source,...(meta?{meta:Object.freeze(clone(meta))}:{})});}
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

export const ADHERENCE_TRAJECTORY_WINDOWS=Object.freeze([7,28,90]);
const ADHERENCE_MIN_PLANNED=Object.freeze({7:2,28:3,90:5});
const ADHERENCE_MEANINGFUL_DELTA=0.15;
function adherencePercent(value){return Number.isFinite(value)?`${Math.round(value*100)}%`:'—';}
function adherenceWindowSummary(summary,days){
  const planned=Number(summary?.plannedSessions||0);
  const completed=Number(summary?.completedSessions||0);
  const adherence=Number.isFinite(summary?.adherence)?Number(summary.adherence):null;
  const minimum=ADHERENCE_MIN_PLANNED[days]||1;
  return Object.freeze({days,plannedSessions:planned,completedSessions:completed,adherence,sufficient:planned>=minimum&&Number.isFinite(adherence),minimumPlannedSessions:minimum});
}
function adherenceDelta(a,b){return Number.isFinite(a)&&Number.isFinite(b)?Math.round((a-b)*1000)/1000:null;}
function trajectoryCopy(state,windows){
  const d7=windows.d7,d28=windows.d28,d90=windows.d90;
  const compact=`7d ${adherencePercent(d7.adherence)} · 28d ${adherencePercent(d28.adherence)} · 90d ${adherencePercent(d90.adherence)}`;
  if(state==='sustained_decline')return Object.freeze({title:'Caída sostenida de constancia',detail:`La adherencia reciente está por debajo del nivel de 28 y 90 días (${compact}). No parece un episodio aislado.`,clientMessage:'Tu constancia ha bajado en las últimas semanas. Conviene identificar qué está dificultando mantener el plan.',coachMessage:'La caída aparece en corto y medio plazo frente al histórico de 90 días; prioriza entender la barrera antes de modificar programación.',nextAction:'Revisar barreras de agenda, comprensión, tolerancia o contexto y acordar una acción concreta.'});
  if(state==='recent_decline')return Object.freeze({title:'Caída reciente de constancia',detail:`Los últimos 7 días están por debajo del patrón de 28 días (${compact}), sin evidencia suficiente de una caída sostenida a largo plazo.`,clientMessage:'Esta semana ha sido menos constante que tu patrón reciente. Un tropiezo puntual no define tu proceso.',coachMessage:'Hay deterioro de corto plazo, pero todavía no una tendencia sostenida; revisa el contexto antes de escalar la intervención.',nextAction:'Comprobar si existe una barrera puntual y proteger la siguiente sesión prevista.'});
  if(state==='recovering')return Object.freeze({title:'Constancia en recuperación',detail:`Los últimos 7 días mejoran frente al patrón de 28 días (${compact}).`,clientMessage:'La constancia reciente está mejorando. El objetivo es consolidar este ritmo sin añadir presión innecesaria.',coachMessage:'La señal de corto plazo mejora frente al periodo de 28 días; mantén seguimiento y evita cambios innecesarios si el contexto es estable.',nextAction:'Consolidar el ritmo actual y revisar de nuevo con más datos.'});
  if(state==='stable')return Object.freeze({title:'Constancia estable',detail:`Las ventanas disponibles mantienen un patrón similar (${compact}).`,clientMessage:'Tu constancia se mantiene estable en las ventanas comparables.',coachMessage:'No hay una desviación relevante entre corto, medio y largo plazo con los datos disponibles.',nextAction:'Mantener el plan y seguir observando la trayectoria.'});
  if(state==='low_sustained')return Object.freeze({title:'Adherencia baja mantenida',detail:`La adherencia de 28 y 90 días se mantiene por debajo de lo previsto (${compact}).`,clientMessage:'La continuidad lleva varias semanas por debajo del plan. El objetivo es hacerlo más sostenible, no compensar de golpe.',coachMessage:'La baja adherencia no es sólo reciente; requiere revisar sostenibilidad del plan y barreras estructurales.',nextAction:'Revisar frecuencia, agenda y viabilidad del plan con el cliente antes de progresar.'});
  return Object.freeze({title:'Trayectoria aún sin suficiente evidencia',detail:`Todavía faltan sesiones planificadas suficientes para comparar 7, 28 y 90 días con confianza (${compact}).`,clientMessage:'Aún estamos construyendo una base suficiente para interpretar tu constancia con contexto.',coachMessage:'Evita inferir tendencia hasta reunir una muestra mínima en las ventanas comparables.',nextAction:'Mantener registro consistente y volver a valorar cuando haya más datos.'});
}

export function buildAdherenceTrajectory(state,clientId,{now=new Date(),summaries=null}={}){
  if(!clientId)return null;
  const source=summaries&&typeof summaries==='object'?summaries:{};
  const resolved=Object.fromEntries(ADHERENCE_TRAJECTORY_WINDOWS.map((days)=>{
    const supplied=source[`d${days}`];
    const summary=supplied?.clientId===clientId&&Number(supplied?.days)===days
      ?supplied
      :computeProgressSummary(state,clientId,{now,days});
    return [`d${days}`,adherenceWindowSummary(summary,days)];
  }));
  const {d7,d28,d90}=resolved;
  const delta7Vs28=adherenceDelta(d7.adherence,d28.adherence);
  const delta28Vs90=adherenceDelta(d28.adherence,d90.adherence);
  let stateId='insufficient';
  if(d28.sufficient&&d90.sufficient&&d28.adherence<0.6&&d90.adherence<0.6)stateId='low_sustained';
  if(d7.sufficient&&d28.sufficient&&delta7Vs28<=-ADHERENCE_MEANINGFUL_DELTA)stateId='recent_decline';
  if(d7.sufficient&&d28.sufficient&&d90.sufficient&&delta7Vs28<=-ADHERENCE_MEANINGFUL_DELTA&&delta28Vs90<=-0.1)stateId='sustained_decline';
  if(d7.sufficient&&d28.sufficient&&delta7Vs28>=ADHERENCE_MEANINGFUL_DELTA)stateId='recovering';
  if(d7.sufficient&&d28.sufficient&&d90.sufficient&&Math.abs(delta7Vs28)<ADHERENCE_MEANINGFUL_DELTA&&Math.abs(delta28Vs90)<ADHERENCE_MEANINGFUL_DELTA&&stateId==='insufficient')stateId='stable';
  const copy=trajectoryCopy(stateId,resolved);
  return Object.freeze({
    clientId,
    state:stateId,
    windows:Object.freeze(resolved),
    deltas:Object.freeze({d7VsD28:delta7Vs28,d28VsD90:delta28Vs90}),
    evidence:Object.freeze({
      sufficient7:d7.sufficient,
      sufficient28:d28.sufficient,
      sufficient90:d90.sufficient,
      comparableWindows:[d7,d28,d90].filter((item)=>item.sufficient).map((item)=>item.days),
    }),
    title:copy.title,
    detail:copy.detail,
    clientMessage:copy.clientMessage,
    coachMessage:copy.coachMessage,
    nextAction:copy.nextAction,
    requiresCoachDecision:true,
    autoPrescription:false,
  });
}

export function deriveAdherenceAlerts(state,clientId,{now=new Date(),summary:providedSummary=null}={}){
  const summary=
    providedSummary?.clientId===clientId&&Number(providedSummary?.days)===28
      ?providedSummary
      :computeProgressSummary(state,clientId,{now,days:28});
  if(!summary)return [];
  const alerts=[];
  const checkin=summary.latestCheckin||{};
  if(Number.isFinite(checkin.pain)&&checkin.pain>=6)alerts.push(makeSignal('pain-high','critical','Dolor elevado informado','El último registro de bienestar indica dolor igual o superior a 6/10. No corresponde progresar automáticamente la carga.','Revisar con el cliente antes de la próxima sesión.','registro_bienestar'));
  if((Number.isFinite(checkin.sleep)&&checkin.sleep<=4)||(Number.isFinite(checkin.energy)&&checkin.energy<=4)||(Number.isFinite(checkin.stress)&&checkin.stress>=8))alerts.push(makeSignal('recovery-context','warning','Recuperación condicionada','Sueño, energía o estrés sugieren adaptar el contexto de la sesión, sin asumir una causa clínica.','Valorar mantener, descargar o priorizar técnica.','registro_bienestar'));
  const postSession=postSessionFeedbackSignal(state,clientId,{now});
  if(postSession)alerts.push(postSession);
  const trajectory=buildAdherenceTrajectory(state,clientId,{now,summaries:{d28:summary}});
  if(['recent_decline','sustained_decline','low_sustained'].includes(trajectory?.state)){
    alerts.push(makeSignal('adherence-low','warning',trajectory.title,trajectory.detail,trajectory.nextAction,'sessions',{trajectory}));
  }else if(trajectory?.state==='recovering'){
    alerts.push(makeSignal('adherence-recovering','info',trajectory.title,trajectory.detail,trajectory.nextAction,'sessions',{trajectory}));
  }
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
    id==='no-completions'
  ){
    return Object.freeze({
      title:'Recuperar continuidad',
      detail:alert?.meta?.trajectory?.coachMessage||'La prioridad es entender barreras reales de agenda, ejecución o comprensión antes de modificar el plan.',
      primaryArea:'agenda',
      primaryLabel:'Revisar agenda',
      secondaryArea:'progreso',
      secondaryLabel:'Ver adherencia',
    });
  }

  if(id==='adherence-recovering'){
    return Object.freeze({
      title:'Consolidar la recuperación',
      detail:alert?.meta?.trajectory?.coachMessage||'La constancia reciente mejora; conviene consolidarla antes de introducir cambios.',
      primaryArea:'progreso',
      primaryLabel:'Ver trayectoria',
      secondaryArea:'agenda',
      secondaryLabel:'Revisar agenda',
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