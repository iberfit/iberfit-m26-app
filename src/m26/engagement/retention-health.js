import {normalizeAppointmentRecord} from '../domain/appointment.js';
import {parseDateValue} from '../domain/civil-date.js';
import {deriveAdherenceAlerts} from './adherence-engine.js';
import {computeProgressSummary,progressWindow} from './progress-engine.js';
import {buildProgressHub} from './progress-hub.js';
import {buildCrmRenewalSummary} from './crm-renewals.js';

function arr(value){return Array.isArray(value)?value:[];}
function finite(value){if(value===null||value===undefined||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null;}
function percent(value){return Number.isFinite(value)?Math.round(value*100):null;}
function bodyOf(record){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};}
function rawClientId(record){const body=bodyOf(record);return String(record?.clientId??record?.client_id??record?.clienteId??record?.cliente_id??body?.clientId??body?.client_id??body?.clienteId??body?.cliente_id??'').trim();}
function within(value,start,end){const date=parseDateValue(value);return Boolean(date&&date.getTime()>=start.getTime()&&date.getTime()<=end.getTime());}
function factor(id,label,status,evidence,source,quality='media',detail=null){return Object.freeze({id,label,status,evidence,detail,source,quality});}

function adherenceFactor(summary){
  const planned=Number(summary?.plannedSessions||0);
  const completed=Number(summary?.completedSessions||0);
  const adherence=finite(summary?.adherence);
  if(planned<3||adherence===null){
    return factor('adherence','Adherencia','insufficient','Se necesitan al menos 3 sesiones planificadas comparables en 28 días.','appointments+sessionExecutions','limitada');
  }
  const status=completed===0||adherence<0.4?'red':adherence<0.7?'yellow':'green';
  return factor(
    'adherence',
    'Adherencia',
    status,
    `${completed} de ${planned} sesiones confirmadas · ${percent(adherence)}%`,
    'appointments+sessionExecutions',
    summary?.dataQuality||'media',
    status==='green'?'Continuidad dentro del rango de seguimiento.':'La señal describe continuidad observada; no explica por sí sola la causa.',
  );
}

function cancellationFactor(state,clientId,{now}){
  const {start,end}=progressWindow({now,days:28});
  const resolved=[];
  for(const raw of arr(state?.collections?.appointments)){
    if(rawClientId(raw)!==clientId)continue;
    const appointment=normalizeAppointmentRecord(raw);
    if(!appointment.startAt||!within(appointment.startAt,start,end))continue;
    if(['realizada','cancelada','ausencia_cliente'].includes(appointment.status))resolved.push(appointment);
  }
  if(!resolved.length){
    return factor('cancellations','Cancelaciones','insufficient','No hay citas resueltas suficientes para valorar cancelaciones en 28 días.','appointments','limitada');
  }
  const cancelled=resolved.filter((item)=>item.status==='cancelada').length;
  const noShows=resolved.filter((item)=>item.status==='ausencia_cliente').length;
  const disruptions=cancelled+noShows;
  const ratio=disruptions/resolved.length;
  const status=noShows>=2||(resolved.length>=3&&ratio>=0.5)
    ?'red'
    :noShows>=1||cancelled>=2||(resolved.length>=3&&ratio>=0.25)
      ?'yellow'
      :'green';
  return factor(
    'cancellations',
    'Cancelaciones',
    status,
    `${cancelled} cancelación${cancelled===1?'':'es'} · ${noShows} ausencia${noShows===1?'':'s'} del cliente · ${resolved.length} citas resueltas`,
    'appointments',
    resolved.length>=4?'alta':resolved.length>=2?'media':'limitada',
    'Las reprogramaciones y citas todavía no resueltas no se penalizan como abandono.',
  );
}

function feedbackFactor(summary,alerts){
  const feedbackAlerts=arr(alerts).filter((alert)=>['pain-high','recovery-context','post-session-discomfort'].includes(String(alert?.id||'')));
  if(feedbackAlerts.length){
    return factor(
      'feedback',
      'Feedback',
      'yellow',
      feedbackAlerts.map((alert)=>alert.title).join(' · '),
      'checkins+sessionExecutions',
      summary?.dataQuality||'media',
      'Es contexto de seguimiento y retención; no es un diagnóstico ni prescribe cambios automáticamente.',
    );
  }
  if(Number(summary?.checkins||0)>0){
    return factor('feedback','Feedback','green',`${summary.checkins} registro${summary.checkins===1?'':'s'} de bienestar en 28 días sin alerta contextual prioritaria.`,'checkins','media');
  }
  return factor('feedback','Feedback','insufficient','Sin feedback reciente suficiente para clasificar esta dimensión.','checkins+sessionExecutions','limitada');
}

function activityFactor(summary){
  const wearable=summary?.wearable||{};
  const days=Number(wearable?.daysWithData||0);
  if(days<2){
    return factor('activity','Actividad','insufficient','Menos de 2 días con datos de actividad recientes; no se interpreta como inactividad.','wearableDailySummaries','limitada');
  }
  const freshness=String(wearable?.freshness||'sin_datos');
  const status=freshness==='reciente'?'green':'yellow';
  return factor(
    'activity',
    'Actividad',
    status,
    `${days} días con datos · ${freshness}`,
    'wearableDailySummaries',
    wearable?.quality||'media',
    status==='green'?'Cobertura reciente disponible.':'Los datos están atrasados; esto puede ser sincronización y no implica menor actividad.',
  );
}

function evolutionFactor(hub){
  const relevant=arr(hub?.pillars).filter((pillar)=>['strength','volume','iri'].includes(String(pillar?.id||'')));
  const available=relevant.filter((pillar)=>pillar.status!=='insufficient');
  if(!available.length){
    return factor('evolution','Evolución','insufficient','Sin fuerza, volumen o IRI comparables suficientes para valorar evolución.','progressHub','limitada');
  }
  const reviews=available.filter((pillar)=>pillar.status==='review');
  const status=reviews.length?'yellow':'green';
  return factor(
    'evolution',
    'Evolución',
    status,
    reviews.length?`${reviews.map((pillar)=>pillar.label).join(', ')} requiere revisión contextual.`:`${available.length} área${available.length===1?'':'s'} de progreso con evidencia sin señal de revisión.`,
    'progressHub',
    available.length>=2?'alta':'media',
    'La evolución se apoya en señales canónicas y no presume causalidad.',
  );
}

function renewalFactor(crm){
  const renewal=crm?.renewal;
  if(!renewal||renewal.status==='insufficient'){
    return factor(
      'renewal',
      'Renovación',
      'insufficient',
      renewal?.evidence||'No existe evidencia comercial canónica suficiente para clasificar renovación.',
      'crmRenewals',
      'limitada',
      'La ausencia de datos comerciales no se convierte en riesgo de abandono.',
    );
  }
  if(renewal.status==='overdue'){
    const days=finite(renewal.daysToRenewal);
    const elapsed=days===null?null:Math.abs(days);
    return factor(
      'renewal',
      'Renovación',
      'yellow',
      elapsed===null?'Existe una renovación explícitamente vencida.':`Renovación explícita vencida hace ${elapsed} día${elapsed===1?'':'s'}.`,
      'crmRenewals',
      'alta',
      'Requiere revisión humana de continuidad comercial; no implica impago, abandono ni autoriza un mensaje automático.',
    );
  }
  const days=finite(renewal.daysToRenewal);
  const evidence=renewal.status==='upcoming'
    ?days===null?'Existe una renovación próxima registrada explícitamente.':`Renovación explícita prevista en ${Math.max(0,days)} día${days===1?'':'s'}.`
    :renewal.status==='completed'
      ?'La renovación figura explícitamente como confirmada.'
      :'Existe evidencia explícita de renovación vigente.';
  return factor(
    'renewal',
    'Renovación',
    'green',
    evidence,
    'crmRenewals',
    renewal.date?'alta':'media',
    renewal.status==='upcoming'?'Es una señal operativa para seguimiento, no un riesgo automático.':'Sin señal comercial vencida en la evidencia disponible.',
  );
}

function bandFor(factors){
  const byId=new Map(factors.map((item)=>[item.id,item]));
  const adherence=byId.get('adherence')?.status;
  const cancellations=byId.get('cancellations')?.status;
  if(adherence==='red'||cancellations==='red'||(adherence==='yellow'&&cancellations==='yellow'))return 'red';
  if(factors.some((item)=>item.status==='yellow'))return 'yellow';
  if(factors.filter((item)=>item.status!=='insufficient').length>=2)return 'green';
  return 'insufficient';
}

function actionFor(band,factors){
  const risky=factors.filter((item)=>['red','yellow'].includes(item.status));
  const ids=new Set(risky.map((item)=>item.id));
  if(band==='red')return Object.freeze({title:'Recuperar continuidad',detail:'Contactar al cliente y revisar barreras de agenda, asistencia y continuidad antes de modificar el plan.',primaryArea:'agenda',primaryLabel:'Revisar agenda y contacto'});
  if(ids.has('adherence')||ids.has('cancellations'))return Object.freeze({title:'Intervenir antes de perder continuidad',detail:'Revisar barreras reales y acordar el siguiente paso con el cliente.',primaryArea:'agenda',primaryLabel:'Revisar continuidad'});
  if(ids.has('renewal'))return Object.freeze({title:'Revisar renovación pendiente',detail:'Confirmar continuidad comercial con el cliente. Una fecha vencida no implica impago ni abandono.',primaryArea:'clientes',primaryLabel:'Abrir clientes'});
  if(ids.has('feedback'))return Object.freeze({title:'Revisar feedback reciente',detail:'Dar contexto humano al feedback antes de decidir cualquier ajuste.',primaryArea:'progreso',primaryLabel:'Abrir Cliente 360'});
  if(ids.has('evolution'))return Object.freeze({title:'Revisar evolución y objetivos',detail:'Contrastar la señal con el cliente y la planificación vigente.',primaryArea:'progreso',primaryLabel:'Revisar progreso'});
  if(ids.has('activity'))return Object.freeze({title:'Comprobar actividad y sincronización',detail:'Verificar si el dato atrasado corresponde a falta de sincronización antes de interpretarlo.',primaryArea:'actividad',primaryLabel:'Revisar actividad'});
  if(band==='green')return Object.freeze({title:'Mantener seguimiento',detail:'No hay señales de riesgo confirmadas con la evidencia disponible. Mantener la cadencia de seguimiento.',primaryArea:'progreso',primaryLabel:'Ver progreso'});
  return Object.freeze({title:'Completar evidencia',detail:'Registrar más sesiones, feedback o actividad antes de clasificar riesgo.',primaryArea:'progreso',primaryLabel:'Completar seguimiento'});
}

export function buildRetentionHealth(state,clientId,{now=new Date()}={}){
  if(!clientId)return null;
  const summary=computeProgressSummary(state,clientId,{now,days:28});
  if(!summary)return null;
  const alerts=deriveAdherenceAlerts(state,clientId,{now});
  const hub=buildProgressHub(state,clientId,{now});
  const crm=buildCrmRenewalSummary(state,clientId,{now});
  const factors=Object.freeze([
    adherenceFactor(summary),
    activityFactor(summary),
    feedbackFactor(summary,alerts),
    cancellationFactor(state,clientId,{now}),
    evolutionFactor(hub),
    renewalFactor(crm),
  ]);
  const band=bandFor(factors);
  const evidenceCount=factors.filter((item)=>item.status!=='insufficient').length;
  const riskSignals=Object.freeze(factors.filter((item)=>['red','yellow'].includes(item.status)).map((item)=>item.id));
  const labels={green:'Verde',yellow:'Amarillo',red:'Rojo',insufficient:'Evidencia insuficiente'};
  return Object.freeze({
    clientId,
    generatedAt:parseDateValue(now)?.toISOString()||new Date(now).toISOString(),
    band,
    label:labels[band],
    evidenceCount,
    totalDomains:factors.length,
    riskSignals,
    factors,
    nextAction:actionFor(band,factors),
    requiresCoachDecision:true,
    autoPrescription:false,
    autoMessage:false,
    provenance:'deterministic-confirmed-data',
    note:'Retention Engine prioriza continuidad observable y señales comerciales explícitas, manteniendo la evidencia ausente como insuficiente. No calcula un score numérico, no presume impago y no realiza inferencias clínicas.',
  });
}

export const __retentionHealthInternals=Object.freeze({adherenceFactor,cancellationFactor,feedbackFactor,activityFactor,evolutionFactor,renewalFactor,bandFor,actionFor});
