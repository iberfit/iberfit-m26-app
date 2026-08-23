import { computeProgressSummary } from './progress-engine.js';
function clone(value){return value==null?value:structuredClone(value);}
function arr(value){return Array.isArray(value)?value:[];}
function first(record,...keys){for(const key of keys){const value=record?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function clientIdOf(record){return first(record,'clientId','client_id','clienteId','cliente_id');}
function safeDate(value){const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date:null;}
function endDateOf(record){return first(record,'endAt','end_at','endDate','end_date','fechaFin','fecha_fin');}
function statusOf(record){return String(first(record,'status','estado')||'').toLowerCase();}
function daysBetween(a,b){return Math.ceil((b.getTime()-a.getTime())/86400000);}
function makeSignal(id,severity,title,detail,action,source){return Object.freeze({id,severity,title,detail,action,source});}

export function deriveAdherenceAlerts(state,clientId,{now=new Date()}={}){
  const summary=computeProgressSummary(state,clientId,{now,days:28});
  if(!summary)return [];
  const alerts=[];
  const checkin=summary.latestCheckin||{};
  if(Number.isFinite(checkin.pain)&&checkin.pain>=6)alerts.push(makeSignal('pain-high','critical','Dolor elevado informado','El último registro de bienestar indica dolor igual o superior a 6/10. No corresponde progresar automáticamente la carga.','Revisar con el cliente antes de la próxima sesión.','registro_bienestar'));
  if((Number.isFinite(checkin.sleep)&&checkin.sleep<=4)||(Number.isFinite(checkin.energy)&&checkin.energy<=4)||(Number.isFinite(checkin.stress)&&checkin.stress>=8))alerts.push(makeSignal('recovery-context','warning','Recuperación condicionada','Sueño, energía o estrés sugieren adaptar el contexto de la sesión, sin asumir una causa clínica.','Valorar mantener, descargar o priorizar técnica.','registro_bienestar'));
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
