import {buildAdherenceWindows} from '../engagement/progress-continuity.js';
import {computeProgressSummary} from '../engagement/progress-engine.js';
import {adherenceSignal,deriveAdherenceAlerts} from '../engagement/adherence-engine.js';
import {recordsForClient,upcomingAppointments} from '../modules/domain-selectors.js';
import {isClientVisibleAppointment,normalizeAppointmentRecord} from '../domain/appointment.js';
import {civilDateInTimeZone,formatIberfitDate} from '../domain/civil-date.js';
import {buildWearableViewModel} from '../wearables/view-model.js';
import {buildAdaptiveSessionContext} from '../intelligence/adaptive-context.js';
import {buildSessionEntryDecision} from '../intelligence/session-entry-policy.js';

const STYLE_ID='m27-progress-continuity-styles';

const STYLES=`
.m27-constancia{display:grid;gap:.72rem;padding:.9rem;border:1px solid rgba(216,185,111,.13);border-radius:.95rem;background:rgba(255,255,255,.018)}
.m27-constancia-head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem}
.m27-constancia-head>div{display:grid;gap:.16rem}
.m27-constancia-kicker{color:#d8b96f;font-size:.62rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
.m27-constancia-head h4{margin:0;color:#f0e6d2;font-size:.92rem;letter-spacing:-.015em}
.m27-constancia-head p{max-width:34rem;margin:0;color:#9f998f;font-size:.68rem;line-height:1.45;text-align:right}
.m27-constancia-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.55rem}
.m27-constancia-window{display:grid;align-content:start;gap:.22rem;min-height:6.4rem;padding:.72rem;border:1px solid rgba(216,185,111,.1);border-radius:.78rem;background:rgba(0,0,0,.09)}
.m27-constancia-window>span{color:#9f998f;font-size:.62rem;font-weight:750;letter-spacing:.045em;text-transform:uppercase}
.m27-constancia-window>strong{color:#f8f2e7;font-size:clamp(1.22rem,2.6vw,1.7rem);font-variant-numeric:tabular-nums;letter-spacing:-.035em;line-height:1.05}
.m27-constancia-window>small{color:#a9a397;font-size:.66rem;line-height:1.4}
.m27-constancia-window[data-has-plan="false"]>strong{font-size:.9rem;line-height:1.25;letter-spacing:-.01em}
.m27-client-home{display:grid;gap:.62rem;padding:.72rem .78rem;border:1px solid rgba(216,185,111,.12);border-radius:.9rem;background:rgba(255,255,255,.015)}
.m27-client-home-head{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.m27-client-home-head>div{display:flex;align-items:baseline;gap:.55rem;min-width:0}
.m27-client-home-head h3{margin:0;color:var(--m26-text,#17231d);font-size:.88rem;letter-spacing:-.015em}
.m27-client-home-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(13.5rem,1fr));gap:.5rem}
.m27-client-home-card{display:grid;align-content:start;gap:.24rem;min-height:0;padding:.68rem .72rem;border:1px solid rgba(216,185,111,.1);border-radius:.72rem;background:rgba(255,255,255,.025)}
.m27-client-home-card>span{color:var(--m26-gold,#a98534);font-size:.58rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.m27-client-home-card>strong{color:var(--m26-text,#17231d);font-size:.88rem;letter-spacing:-.012em;line-height:1.22}
.m27-client-home-card>small{color:var(--m26-text-muted,#6b675f);font-size:.66rem;line-height:1.4}
.m27-client-home-card>button{justify-self:start;margin-top:.18rem;padding:0;border:0;background:transparent;color:var(--m26-gold,#8f7028);font:inherit;font-size:.68rem;font-weight:800;cursor:pointer}
.m27-client-home-card>button:hover,.m27-client-home-card>button:focus-visible{text-decoration:underline;text-underline-offset:.18rem}
.m27-client-home-card[data-attention-level="critical"]{border-color:rgba(149,67,54,.28)}
.m27-client-home-card[data-attention-level="warning"],.m27-client-home-card[data-home-kind="communication"]{border-color:rgba(169,133,52,.24)}
.m27-session-feedback-premium{position:relative;overflow:hidden}
.m27-session-feedback-explainer{margin:.3rem 0 .95rem;padding:.72rem .8rem;border-left:3px solid rgba(216,185,111,.65);border-radius:.2rem .7rem .7rem .2rem;background:rgba(216,185,111,.055);color:var(--m26-text-muted,#6b675f);font-size:.78rem;line-height:1.5}
.m27-session-continuity{display:grid;gap:.22rem;margin:.85rem 0;padding:.82rem .88rem;border:1px solid rgba(216,185,111,.2);border-radius:.82rem;background:rgba(216,185,111,.055)}
.m27-session-continuity>span{color:var(--m26-gold,#a98534);font-size:.63rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.m27-session-continuity>strong{color:var(--m26-text,#17231d);font-size:.94rem;letter-spacing:-.015em}
.m27-session-continuity>p{margin:0;color:var(--m26-text-muted,#6b675f);font-size:.76rem;line-height:1.48}
@media (max-width:980px){.m27-client-home-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.m27-constancia{padding:.78rem}.m27-constancia-head{display:grid;gap:.28rem}.m27-constancia-head p{text-align:left}.m27-constancia-grid,.m27-client-home-grid{grid-template-columns:1fr}.m27-constancia-window,.m27-client-home-card{min-height:0}.m27-client-home{padding:.68rem}.m27-client-home-head>div{display:grid;gap:.1rem}}
@media (prefers-reduced-motion:reduce){.m27-constancia-window,.m27-session-continuity,.m27-client-home-card{scroll-behavior:auto}}
.m27-exercise-focus{display:grid;gap:1rem;margin-top:1rem}
.m27-exercise-focus-tools{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;padding:.8rem 0;border-top:1px solid rgba(169,133,52,.18);border-bottom:1px solid rgba(169,133,52,.18)}
.m27-exercise-focus-search{display:grid;gap:.35rem;min-width:min(22rem,100%)}
.m27-exercise-focus-search>span{color:var(--m26-gold,#9a782d);font-size:.67rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.m27-exercise-focus-search input{width:100%;min-height:2.7rem;padding:.64rem .74rem;border:1px solid var(--m26-border,rgba(169,133,52,.22));border-radius:.68rem;background:var(--m26-surface,#fffdf8);color:var(--m26-text,#17231d);font:inherit}
.m27-exercise-focus-grid{display:grid;grid-template-columns:minmax(13.5rem,18rem) minmax(0,1fr);gap:1.1rem;align-items:start}
.m27-exercise-focus-list{display:grid;align-content:start;max-height:min(72vh,46rem);overflow:auto;border-right:1px solid rgba(169,133,52,.18)}
.m27-exercise-focus-option{display:grid;gap:.18rem;width:100%;padding:.7rem .76rem .7rem .66rem;border:0;border-left:3px solid transparent;border-bottom:1px solid rgba(169,133,52,.12);background:transparent;color:inherit;text-align:left;cursor:pointer}
.m27-exercise-focus-option:hover,.m27-exercise-focus-option:focus-visible{background:color-mix(in srgb,var(--m26-gold,#9a782d) 6%,transparent)}
.m27-exercise-focus-option[aria-pressed="true"]{border-left-color:var(--m26-gold,#9a782d);background:color-mix(in srgb,var(--m26-gold,#9a782d) 8%,transparent)}
.m27-exercise-focus-option strong{color:var(--m26-text,#17231d);font-size:.82rem;line-height:1.25}
.m27-exercise-focus-option small{color:var(--m26-text-muted,#6b675f);font-size:.64rem;line-height:1.38}
.m27-exercise-focus-empty{margin:.7rem;color:var(--m26-text-muted,#6b675f);font-size:.71rem}
.m27-exercise-focus-active{min-width:0}
.m27-exercise-focus-active>.m26-exercise-progress-card{margin:0}
@media (max-width:980px){.m27-exercise-focus-grid{grid-template-columns:minmax(11.5rem,14rem) minmax(0,1fr)}}
@media (max-width:720px){.m27-exercise-focus-tools{display:grid}.m27-exercise-focus-grid{grid-template-columns:1fr}.m27-exercise-focus-list{grid-template-columns:repeat(auto-fit,minmax(10.5rem,1fr));max-height:13rem;border-right:0;border-bottom:1px solid rgba(169,133,52,.18)}.m27-exercise-focus-option{border-left:0;border-top:3px solid transparent}.m27-exercise-focus-option[aria-pressed="true"]{border-top-color:var(--m26-gold,#9a782d)}}
@media (forced-colors:active){.m27-exercise-focus-option[aria-pressed="true"]{outline:2px solid CanvasText}}
@media print{.m27-exercise-focus-tools,.m27-exercise-focus-list{display:none}.m27-exercise-focus-grid{display:block}}
`;

function create(document,tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined&&text!==null)node.textContent=String(text);
  return node;
}

function installStyles(document){
  if(!document?.head||document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=STYLES;
  document.head.appendChild(style);
}

function clientIdFor(viewModel,state){
  const role=String(viewModel?.identity?.role||'').trim().toLowerCase();
  if(!['client','coach'].includes(role))return '';
  return role==='client'
    ?String(state?.identity?.clientId||'').trim()
    :String(state?.selectedClientId||'').trim();
}

function adherenceValue(item){
  return Number.isFinite(item?.adherence)
    ?`${Math.round(item.adherence*100)}%`
    :'Sin plan en ventana';
}

function adherenceDetail(item){
  if(!item?.hasPlan){
    return 'No hay sesiones planificadas o confirmadas para calcular constancia.';
  }
  const pending=Number(item?.unconfirmedExecutions||0);
  const base=`${item.completedSessions} de ${item.plannedSessions} sesiones confirmadas`;
  return pending
    ?`${base} · ${pending} pendiente${pending===1?'':'s'} fuera del cálculo`
    :base;
}

function appointmentDetail(appointment){
  if(!appointment)return 'No hay una próxima cita confirmada. Cuando se confirme, aparecerá aquí.';
  return [appointment.title,appointment.modalityLabel,appointment.location]
    .filter(Boolean)
    .filter((value,index,list)=>list.indexOf(value)===index)
    .join(' · ');
}

function trainingTodaySnapshot(state,clientId,{now=new Date()}={}){
  const today=civilDateInTimeZone(now);
  if(!today)return null;
  const candidates=recordsForClient(state,'appointments',clientId)
    .filter((record)=>isClientVisibleAppointment(record))
    .map((record)=>normalizeAppointmentRecord(record))
    .filter((appointment)=>appointment.status==='confirmada')
    .filter((appointment)=>civilDateInTimeZone(appointment.startAt)===today)
    .sort((a,b)=>(new Date(a.startAt).getTime()||0)-(new Date(b.startAt).getTime()||0));
  const appointment=candidates.find((item)=>item.sessionId)||candidates[0]||null;
  if(!appointment)return null;
  const ready=Boolean(appointment.sessionId);
  const entry=ready
    ?buildSessionEntryDecision(buildAdaptiveSessionContext(state,clientId,{now}))
    :null;
  const date=formatIberfitDate(appointment.startAt,{locale:'es-CL',includeTime:true})||'Hoy';
  const readinessCopy=ready
    ?entry?.directStartAllowed
      ?' · La sesión vinculada está lista para empezar desde IBERFIT.'
      :' · Antes de empezar revisaremos tu contexto de hoy; el plan no se modifica automáticamente.'
    :'';
  return Object.freeze({
    appointment,
    ready,
    sessionId:ready?String(appointment.sessionId||''):null,
    area:ready?'sesion':'agenda',
    workflowAction:ready?'start-published-session':null,
    actionLabel:ready?(entry?.actionLabel||'Revisar antes de entrenar'):'Ver agenda',
    title:ready?'Entrenamiento listo para hoy':'Sesión confirmada para hoy',
    copy:`${date} · ${appointmentDetail(appointment)}${readinessCopy}`,
    entry,
  });
}

function wellbeingDetail(summary){
  const latest=summary?.latestCheckin;
  if(!latest)return 'Registra energía, sueño, estrés o dolor para mantener tu contexto de seguimiento actualizado.';
  const values=[
    ['Energía',latest.energy],
    ['Sueño',latest.sleep],
    ['Estrés',latest.stress],
    ['Dolor',latest.pain],
  ]
    .filter(([,value])=>Number.isFinite(value))
    .map(([label,value])=>`${label} ${value}`);
  const date=formatIberfitDate(summary.latestCheckinAt,{locale:'es-CL',includeTime:true});
  const metrics=values.length?values.join(' · '):'Registro disponible sin métricas comparables';
  return date?`${metrics} · ${date}`:metrics;
}

function attentionCopy(level,topAlert){
  if(level==='critical')return 'Hay un dato confirmado que conviene revisar con tu Entrenador antes de la próxima sesión.';
  if(level==='warning')return 'Tu seguimiento contiene contexto reciente para revisar con tu Entrenador; la app no cambia tu plan automáticamente.';
  if(topAlert)return 'Hay información de seguimiento disponible. Se muestra como contexto y no implica un cambio automático de tu plan.';
  return 'No hay señales prioritarias en los datos confirmados disponibles.';
}

function attentionArea(topAlert){
  const source=String(topAlert?.source||'');
  return source==='registro_bienestar'?'actividad':'progreso';
}

function communicationSnapshot(state){
  if(state?.communication?.available!==true)return null;
  const threads=Array.isArray(state.communication.threads)?state.communication.threads:[];
  const notifications=Array.isArray(state.communication.notifications)?state.communication.notifications:[];
  const unreadThreads=threads.reduce((total,thread)=>total+Math.max(0,Number(thread?.unreadCount||0)),0);
  const closedStatuses=new Set(['read','leida','leido','archived','archivada','archivado','dismissed','descartada','descartado']);
  const unreadNotifications=notifications.filter((item)=>{
    const status=String(item?.status||'').trim().toLowerCase();
    return !item?.readAt&&!closedStatuses.has(status);
  }).length;
  const unread=unreadThreads+unreadNotifications;
  if(unread<=0)return null;
  return Object.freeze({
    unread,
    unreadThreads,
    unreadNotifications,
    title:unread===1?'1 comunicación por revisar':`${unread} comunicaciones por revisar`,
    copy:'Tienes mensajes o avisos pendientes. Ábrelos desde Mensajes para mantener el seguimiento al día.',
    area:'mensajes',
  });
}

function deviceSnapshot(state,clientId,{now=new Date()}={}){
  try{
    const records=recordsForClient(state,'wearableDailySummaries',clientId);
    const connections=recordsForClient(state,'wearableConnections',clientId);
    if(!records.length&&!connections.length)return null;
    const view=buildWearableViewModel({records,connections,role:'client',now});
    const primary=
      view.connections.find((item)=>item.health?.actionRequired)||
      view.connections.find((item)=>['atrasada','obsoleta'].includes(item.health?.freshness))||
      view.connections.find((item)=>['connected','syncing'].includes(item.state))||
      view.connections[0]||null;
    const hasData=Boolean(view.summary?.records?.length||view.dailyRecords?.length);
    if(!primary&&!hasData)return null;

    if(primary?.health?.actionRequired){
      return Object.freeze({
        kind:'device-action',
        title:'Revisar Dispositivos',
        copy:`${primary.label}: la conexión requiere revisión. Los datos confirmados existentes no se alteran.`,
        area:'actividad',
      });
    }

    if(primary&&['atrasada','obsoleta'].includes(primary.health?.freshness)){
      return Object.freeze({
        kind:'device-stale',
        title:'Sincronización por actualizar',
        copy:`${primary.label}: la última sincronización está ${primary.health.freshness}. Revisa Dispositivos si quieres actualizar el contexto.`,
        area:'actividad',
      });
    }

    if(primary){
      const synced=formatIberfitDate(primary.lastSyncedAt,{locale:'es-CL',includeTime:true});
      return Object.freeze({
        kind:'device-ok',
        title:'Dispositivo conectado',
        copy:`${primary.label}${synced?' · última sincronización '+synced:''}. Solo se usan datos confirmados como contexto.`,
        area:'actividad',
      });
    }

    return Object.freeze({
      kind:'device-data',
      title:'Datos de actividad disponibles',
      copy:'Hay datos confirmados de actividad disponibles como contexto. Puedes revisarlos desde Dispositivos.',
      area:'actividad',
    });
  }catch{
    return null;
  }
}

export function buildClientHomeSnapshot(state,clientId,{now=new Date()}={}){
  const id=String(clientId||'').trim();
  if(!id)return null;
  const windows=buildAdherenceWindows(state,id,{now});
  const constancy=windows.find((item)=>item.days===28)||windows[0]||null;
  const progress=computeProgressSummary(state,id,{now,days:28});
  const nextRecord=upcomingAppointments(state,{
    clientId:id,
    now,
    limit:1,
    clientVisibleOnly:true,
    confirmedOnly:true,
  })[0]||null;
  const nextAppointment=nextRecord?normalizeAppointmentRecord(nextRecord):null;
  const alerts=deriveAdherenceAlerts(state,id,{now});
  const signal=adherenceSignal(alerts);
  const topAlert=alerts[0]||null;
  const wellbeing=progress?.latestCheckin
    ?Object.freeze({...progress.latestCheckin})
    :null;

  return Object.freeze({
    clientId:id,
    todayTraining:trainingTodaySnapshot(state,id,{now}),
    constancy,
    nextAppointment,
    wellbeing,
    latestCheckinAt:progress?.latestCheckinAt||null,
    dataQuality:progress?.dataQuality||'limitada',
    communication:communicationSnapshot(state),
    device:deviceSnapshot(state,id,{now}),
    attention:Object.freeze({
      level:signal.level,
      label:signal.label,
      title:topAlert?.title||'Sin señales prioritarias',
      copy:attentionCopy(signal.level,topAlert),
      area:attentionArea(topAlert),
      source:topAlert?.source||null,
    }),
  });
}

function createAreaButton(document,label,area){
  const button=create(document,'button','',label);
  button.type='button';
  button.setAttribute('data-m26-area',area);
  return button;
}

function createTrainingButton(document,snapshot){
  if(!snapshot?.workflowAction)return createAreaButton(document,snapshot?.actionLabel||'Ver agenda',snapshot?.area||'agenda');
  const button=create(document,'button','',snapshot.actionLabel||'Revisar antes de entrenar');
  button.type='button';
  button.setAttribute('data-workflow-action',snapshot.workflowAction);
  button.setAttribute('data-entity-id',String(snapshot.sessionId||''));
  button.setAttribute('data-session-entry-level',String(snapshot.entry?.level||'unknown'));
  return button;
}

function clientHomeContextItems(snapshot){
  const items=[];
  const constancy=snapshot?.constancy;
  if(constancy?.hasPlan&&Number.isFinite(constancy.adherence)){
    items.push(Object.freeze({
      kind:'constancy',
      kicker:'Constancia · 28 días',
      title:`${Math.round(constancy.adherence*100)}% confirmado`,
      copy:adherenceDetail(constancy),
      action:'Ver progreso',
      area:'progreso',
      level:'normal',
    }));
  }

  const attention=snapshot?.attention;
  if(['critical','warning'].includes(String(attention?.level||''))){
    items.push(Object.freeze({
      kind:'attention',
      kicker:attention.level==='critical'?'Atención prioritaria':'Conviene revisar',
      title:attention.title,
      copy:attention.copy,
      action:attention.area==='actividad'?'Revisar bienestar':'Revisar seguimiento',
      area:attention.area,
      level:attention.level,
    }));
  }

  if(snapshot?.communication){
    items.push(Object.freeze({
      kind:'communication',
      kicker:'Mensajes',
      title:snapshot.communication.title,
      copy:snapshot.communication.copy,
      action:'Abrir Mensajes',
      area:snapshot.communication.area,
      level:'normal',
    }));
  }

  if(['device-action','device-stale'].includes(String(snapshot?.device?.kind||''))){
    items.push(Object.freeze({
      kind:'device',
      kicker:'Dispositivos',
      title:snapshot.device.title,
      copy:snapshot.device.copy,
      action:'Revisar Dispositivos',
      area:snapshot.device.area,
      level:snapshot.device.kind==='device-action'?'warning':'normal',
    }));
  }

  return Object.freeze(items.slice(0,3));
}

function buildClientHomeSection(document,snapshot){
  const items=clientHomeContextItems(snapshot);
  if(!items.length)return null;

  const section=create(document,'section','m27-client-home');
  section.setAttribute('data-m27-client-home','true');
  section.setAttribute('aria-label','Contexto útil de hoy');

  const head=create(document,'div','m27-client-home-head');
  const titles=create(document,'div');
  titles.append(
    create(document,'span','m27-constancia-kicker','Para tener en cuenta'),
    create(document,'h3','','Contexto útil de hoy'),
  );
  head.append(titles);

  const grid=create(document,'div','m27-client-home-grid');
  for(const item of items){
    const card=create(document,'article','m27-client-home-card');
    card.setAttribute('data-home-kind',item.kind);
    if(item.level&&item.level!=='normal')card.setAttribute('data-attention-level',item.level);
    card.append(
      create(document,'span','',item.kicker),
      create(document,'strong','',item.title),
      create(document,'small','',item.copy),
      createAreaButton(document,item.action,item.area),
    );
    grid.append(card);
  }

  section.append(head,grid);
  return section;
}

function enhanceClientHome({root,viewModel,state,now}){
  if(String(viewModel?.activeArea||'')!=='hoy')return false;
  if(String(viewModel?.identity?.role||'').trim().toLowerCase()!=='client')return false;
  const clientId=clientIdFor(viewModel,state);
  if(!clientId)return false;
  const host=root.querySelector?.('.m26-hoy-route');
  if(!host)return false;

  host.querySelector?.('[data-m27-client-home]')?.remove?.();
  const snapshot=buildClientHomeSnapshot(state,clientId,{now});
  if(!snapshot)return false;
  const section=buildClientHomeSection(root.ownerDocument,snapshot);
  if(!section)return false;
  const primary=host.querySelector?.('.m26-client-home-primary-zone');
  if(primary?.nextSibling)host.insertBefore(section,primary.nextSibling);
  else if(primary)host.append(section);
  else host.prepend(section);
  return true;
}

function buildConstancySection(document,windows,role){
  const section=create(document,'section','m27-constancia');
  section.setAttribute('data-m27-constancia','true');
  section.setAttribute('aria-label','Constancia de entrenamiento en 7, 28 y 90 días');

  const head=create(document,'div','m27-constancia-head');
  const titles=create(document,'div');
  titles.append(
    create(document,'span','m27-constancia-kicker','Constancia'),
    create(document,'h4','','Ritmo de entrenamiento'),
  );
  const explanation=create(
    document,
    'p',
    '',
    role==='client'
      ?'Tres ventanas para entender tu continuidad. Solo cuentan sesiones confirmadas; un dato pendiente nunca se convierte en progreso.'
      :'Tres ventanas para leer continuidad sin mezclar pendientes. El dato aporta contexto y no modifica el plan automáticamente.',
  );
  head.append(titles,explanation);

  const grid=create(document,'div','m27-constancia-grid');
  for(const item of windows){
    const card=create(document,'article','m27-constancia-window');
    card.setAttribute('data-m27-adherence-window',String(item.days));
    card.setAttribute('data-has-plan',item.hasPlan?'true':'false');
    card.append(
      create(document,'span','',item.label),
      create(document,'strong','',adherenceValue(item)),
      create(document,'small','',adherenceDetail(item)),
    );
    grid.append(card);
  }

  section.append(head,grid);
  return section;
}

function enhanceConstancy({root,viewModel,state,now}){
  if(String(viewModel?.activeArea||'')!=='progreso')return false;
  const clientId=clientIdFor(viewModel,state);
  if(!clientId)return false;
  const host=root.querySelector?.('[data-m27-cliente-360]');
  if(!host)return false;

  host.querySelector?.('[data-m27-constancia]')?.remove?.();
  const windows=buildAdherenceWindows(state,clientId,{now});
  const section=buildConstancySection(root.ownerDocument,windows,String(viewModel?.identity?.role||''));
  const header=host.querySelector?.('.m27-cliente-360-header');
  if(header?.nextSibling)host.insertBefore(section,header.nextSibling);
  else if(header)host.append(section);
  else host.prepend(section);
  return true;
}

const EXERCISE_FOCUS_STATE=new WeakMap();
const EXERCISE_FOCUS_BOUND=new WeakSet();

function exerciseFocusText(value){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu,'')
    .toLocaleLowerCase('es');
}

function exerciseFocusTitle(card){
  return String(
    card?.querySelector?.(':scope > summary strong')
      ?.textContent||''
  ).trim();
}

function exerciseFocusSubtitle(card){
  return String(
    card?.querySelector?.(':scope > summary small')
      ?.textContent||''
  ).replace(/\s+/gu,' ').trim();
}

function exerciseFocusSelect(state,key){
  if(!state?.cards?.has(key)||!state.active){
    return false;
  }

  const next=state.cards.get(key);
  const current=
    state.active.querySelector?.(
      '.m26-exercise-progress-card'
    );

  if(current!==next){
    current?.remove?.();
  }

  next.open=true;
  next.setAttribute('open','');

  if(next.parentNode!==state.active){
    state.active.replaceChildren(next);
  }

  state.selectedKey=key;
  state.selectedSignature=
    exerciseFocusTitle(next)+
    '\n'+
    exerciseFocusSubtitle(next);

  for(
    const button of
      state.workspace.querySelectorAll?.(
        '[data-m27-exercise-select]'
      )||[]
  ){
    button.setAttribute(
      'aria-pressed',
      String(
        button.getAttribute(
          'data-m27-exercise-select'
        )
      )===key
        ?'true'
        :'false',
    );
  }

  return true;
}

function exerciseFocusFilter(state,query){
  const needle=
    exerciseFocusText(query);
  let visible=0;

  for(
    const button of
      state.workspace?.querySelectorAll?.(
        '[data-m27-exercise-select]'
      )||[]
  ){
    const show=
      !needle||
      exerciseFocusText(
        button.textContent
      ).includes(needle);

    button.hidden=!show;
    if(show)visible+=1;
  }

  const empty=
    state.workspace?.querySelector?.(
      '[data-m27-exercise-empty]'
    );

  if(empty){
    empty.hidden=visible>0;
  }

  return visible;
}

function exerciseFocusStateForTarget(
  root,
  target,
){
  const state=
    EXERCISE_FOCUS_STATE.get(root);

  if(!state?.workspace?.isConnected){
    return null;
  }

  return (
    target?.closest?.(
      '[data-m27-exercise-focus]'
    )===state.workspace
  )
    ?state
    :null;
}

function bindExerciseFocus(root){
  if(EXERCISE_FOCUS_BOUND.has(root)){
    return;
  }

  EXERCISE_FOCUS_BOUND.add(root);

  root.addEventListener(
    'click',
    (event)=>{
      const state=
        exerciseFocusStateForTarget(
          root,
          event.target,
        );

      if(!state)return;

      const select=
        event.target.closest?.(
          '[data-m27-exercise-select]'
        );

      if(!select)return;

      exerciseFocusSelect(
        state,
        String(
          select.getAttribute(
            'data-m27-exercise-select'
          )||''
        ),
      );
    },
  );

  root.addEventListener(
    'input',
    (event)=>{
      const state=
        exerciseFocusStateForTarget(
          root,
          event.target,
        );

      if(!state)return;

      const search=
        event.target.closest?.(
          '[data-m27-exercise-search]'
        );

      if(search){
        exerciseFocusFilter(
          state,
          search.value,
        );
      }
    },
  );
}

function buildExerciseFocusWorkspace(
  root,
  list,
  previous={},
){
  const documentLike=root.ownerDocument;
  const cards=[
    ...(
      list?.querySelectorAll?.(
        ':scope > .m26-exercise-progress-card'
      )||[]
    ),
  ];

  if(!cards.length){
    return null;
  }

  const state={
    cards:new Map(),
    selectedKey:'',
    selectedSignature:
      String(
        previous.selectedSignature||
        ''
      ),
    workspace:null,
    active:null,
  };

  const items=cards.map(
    (card,index)=>{
      const key=
        'exercise-'+index;
      const title=
        exerciseFocusTitle(card)||
        'Ejercicio '+(index+1);
      const subtitle=
        exerciseFocusSubtitle(card);
      const signature=
        title+'\n'+subtitle;

      state.cards.set(
        key,
        card,
      );

      return {
        key,
        title,
        subtitle,
        signature,
        card,
      };
    },
  );

  const selected=
    items.find(
      (item)=>
        item.signature===
        state.selectedSignature
    )||
    items[0];

  const workspace=
    create(
      documentLike,
      'section',
      'm27-exercise-focus',
    );

  workspace.setAttribute(
    'data-m27-exercise-focus',
    'true',
  );
  workspace.setAttribute(
    'aria-label',
    'Estudio por ejercicio',
  );

  const tools=
    create(
      documentLike,
      'div',
      'm27-exercise-focus-tools',
    );

  const searchLabel=
    create(
      documentLike,
      'label',
      'm27-exercise-focus-search',
    );
  const searchTitle=
    create(
      documentLike,
      'span',
      '',
      'Buscar ejercicio',
    );
  const search=
    create(
      documentLike,
      'input',
    );

  search.type='search';
  search.autocomplete='off';
  search.placeholder=
    'Nombre del ejercicio';
  search.setAttribute(
    'data-m27-exercise-search',
    'true',
  );

  searchLabel.append(
    searchTitle,
    search,
  );
  tools.append(searchLabel);

  const grid=
    create(
      documentLike,
      'div',
      'm27-exercise-focus-grid',
    );
  const nav=
    create(
      documentLike,
      'nav',
      'm27-exercise-focus-list',
    );

  nav.setAttribute(
    'aria-label',
    'Ejercicios con historial confirmado',
  );

  for(const item of items){
    const button=
      create(
        documentLike,
        'button',
        'm27-exercise-focus-option',
      );

    button.type='button';
    button.setAttribute(
      'data-m27-exercise-select',
      item.key,
    );
    button.setAttribute(
      'aria-pressed',
      item.key===selected.key
        ?'true'
        :'false',
    );

    button.append(
      create(
        documentLike,
        'strong',
        '',
        item.title,
      ),
      create(
        documentLike,
        'small',
        '',
        item.subtitle||
        'Historial confirmado',
      ),
    );

    nav.appendChild(button);
  }

  const empty=
    create(
      documentLike,
      'p',
      'm27-exercise-focus-empty',
      'No hay ejercicios que coincidan con la búsqueda.',
    );

  empty.hidden=true;
  empty.setAttribute(
    'data-m27-exercise-empty',
    'true',
  );
  nav.appendChild(empty);

  const active=
    create(
      documentLike,
      'div',
      'm27-exercise-focus-active',
    );

  active.setAttribute(
    'data-m27-exercise-active',
    'true',
  );

  for(const item of items){
    item.card.remove();
  }

  grid.append(
    nav,
    active,
  );
  workspace.append(
    tools,
    grid,
  );
  list.replaceWith(workspace);

  state.workspace=workspace;
  state.active=active;
  exerciseFocusSelect(
    state,
    selected.key,
  );

  return state;
}

function enhanceCoachExerciseFocus({
  root,
  viewModel,
}){
  const role=
    String(
      viewModel?.identity?.role||
      ''
    ).trim().toLowerCase();
  const area=
    String(
      viewModel?.activeArea||
      ''
    ).trim().toLowerCase();

  if(
    !['coach','admin'].includes(role)||
    area!=='progreso'
  ){
    return false;
  }

  if(
    root.querySelector?.(
      '[data-m27-exercise-focus]'
    )
  ){
    return true;
  }

  if(
    !root.querySelector?.(
      '[data-m26-coach-exercise-study-summary]'
    )
  ){
    return false;
  }

  const list=
    root.querySelector?.(
      '.m26-exercise-progress-panel .m26-exercise-progress-list'
    );

  if(!list){
    return false;
  }

  bindExerciseFocus(root);

  const previous=
    EXERCISE_FOCUS_STATE.get(root)||
    {};

  const state=
    buildExerciseFocusWorkspace(
      root,
      list,
      previous,
    );

  if(!state){
    return false;
  }

  EXERCISE_FOCUS_STATE.set(
    root,
    state,
  );

  return true;
}

function enhanceFeedbackClosure({root,viewModel}){
  const panel=root.querySelector?.('[data-session-live-state="feedback"] [data-session-live-feedback]');
  if(!panel)return false;
  panel.classList?.add?.('m27-session-feedback-premium');
  const eyebrow=panel.querySelector?.('.m26-eyebrow');
  const title=panel.querySelector?.('h2');
  if(eyebrow)eyebrow.textContent='Cierre post-sesión';
  if(title)title.textContent='Cierra el entrenamiento con contexto';

  if(!panel.querySelector?.('[data-m27-feedback-explainer]')){
    const role=String(viewModel?.identity?.role||'').trim().toLowerCase();
    const text=role==='client'
      ?'Tu RPE y cualquier dolor o molestia quedarán disponibles para el Entrenador como contexto de seguimiento. La app no cambia el plan automáticamente.'
      :'El RPE y cualquier molestia quedan como contexto trazable del cierre. Cualquier ajuste sigue requiriendo criterio del Entrenador.';
    const explainer=create(root.ownerDocument,'p','m27-session-feedback-explainer',text);
    explainer.setAttribute('data-m27-feedback-explainer','true');
    if(title?.nextSibling)panel.insertBefore(explainer,title.nextSibling);
    else panel.prepend(explainer);
  }

  const finish=panel.querySelector?.('[data-session-action="finish"]');
  if(finish)finish.textContent='Guardar cierre y continuar';
  return true;
}

function enhanceCompletedClosure({root}){
  const completed=root.querySelector?.('[data-session-live-state="completed"]');
  if(!completed)return false;
  const hero=completed.querySelector?.('.m26-session-live-hero');
  if(!hero)return false;

  const progressAction=completed.querySelector?.('[data-m26-area="progreso"]');
  const confirmed=Boolean(progressAction);
  if(progressAction)progressAction.textContent='Ver Cliente 360';

  hero.querySelector?.('[data-m27-session-continuity]')?.remove?.();
  const continuity=create(root.ownerDocument,'section','m27-session-continuity');
  continuity.setAttribute('data-m27-session-continuity',confirmed?'confirmed':'pending');
  continuity.setAttribute('aria-label','Continuidad después de la sesión');
  continuity.append(
    create(root.ownerDocument,'span','','Continuidad'),
    create(root.ownerDocument,'strong','',confirmed?'Tu seguimiento ya está actualizado':'Tu progreso está guardado'),
    create(
      root.ownerDocument,
      'p',
      '',
      confirmed
        ?'Esta sesión ya forma parte de Cliente 360. Allí puedes revisar constancia, progreso por ejercicio y evolución confirmada desde una sola vista.'
        :'La sesión aparecerá en Cliente 360 cuando la sincronización quede confirmada. Hasta entonces no se contabiliza como progreso confirmado.',
    ),
  );

  const actions=hero.querySelector?.('.m26-session-live-actions');
  if(actions)hero.insertBefore(continuity,actions);
  else hero.append(continuity);
  return true;
}

export function enhanceProgressContinuity({root,viewModel,state,now=new Date()}={}){
  if(!root?.querySelector||!root.ownerDocument)return false;
  installStyles(root.ownerDocument);
  const home=enhanceClientHome({root,viewModel,state,now});
  const constancy=enhanceConstancy({root,viewModel,state,now});
  const exerciseFocus=enhanceCoachExerciseFocus({root,viewModel});
  const feedback=enhanceFeedbackClosure({root,viewModel});
  const completed=enhanceCompletedClosure({root});
  return Boolean(home||constancy||exerciseFocus||feedback||completed);
}
export const __progressContinuityInternals=Object.freeze({
  clientHomeContextItems,
  exerciseFocusText,
  exerciseFocusFilter,
});
