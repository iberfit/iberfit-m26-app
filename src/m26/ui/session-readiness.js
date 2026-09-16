import {computeProgressSummary} from '../engagement/progress-engine.js';
import {adherenceSignal,deriveAdherenceAlerts} from '../engagement/adherence-engine.js';
import {buildAdherenceWindows} from '../engagement/progress-continuity.js';
import {formatIberfitDate} from '../domain/civil-date.js';
import {
  confirmedSessionExecutionsForClient,
  sessionExecutionDate,
} from '../domain/session-execution-truth.js';
import {summarizeActionOutcomes} from '../intelligence/action-outcome.js';

const STYLE_ID='m27-session-readiness-styles';
const ACTIVE_WAKE_STATES=new Set(['active','rest']);
const ROOT_STATE=new WeakMap();

const STYLES=`
.m27-session-readiness{display:grid;gap:.72rem;margin:.85rem 0;padding:.86rem;border:1px solid rgba(216,185,111,.2);border-radius:.9rem;background:rgba(216,185,111,.045)}
.m27-session-readiness-head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem}
.m27-session-readiness-head>div{display:grid;gap:.15rem}
.m27-session-readiness-head span{color:var(--m26-gold,#a98534);font-size:.62rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.m27-session-readiness-head h3{margin:0;color:var(--m26-text,#17231d);font-size:1rem;letter-spacing:-.02em}
.m27-session-readiness-head p{max-width:34rem;margin:0;color:var(--m26-text-muted,#6b675f);font-size:.7rem;line-height:1.45;text-align:right}
.m27-session-readiness-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.55rem}
.m27-session-readiness-card{display:grid;align-content:start;gap:.22rem;padding:.7rem;border:1px solid rgba(216,185,111,.12);border-radius:.72rem;background:rgba(255,255,255,.035)}
.m27-session-readiness-card>span{color:var(--m26-text-muted,#6b675f);font-size:.59rem;font-weight:750;letter-spacing:.06em;text-transform:uppercase}
.m27-session-readiness-card>strong{color:var(--m26-text,#17231d);font-size:.88rem;line-height:1.25}
.m27-session-readiness-card>small{color:var(--m26-text-muted,#6b675f);font-size:.65rem;line-height:1.4}
.m27-session-readiness-card[data-level="critical"]{border-color:rgba(149,67,54,.3)}
.m27-session-readiness-card[data-level="warning"]{border-color:rgba(169,133,52,.3)}
.m27-session-readiness-coach-brief{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:.75rem;padding:.68rem .15rem .08rem;border-top:1px solid rgba(216,185,111,.18)}
.m27-session-readiness-coach-item{display:grid;align-content:start;gap:.18rem;min-width:0;padding:.08rem .6rem}
.m27-session-readiness-coach-item+ .m27-session-readiness-coach-item{border-left:1px solid rgba(216,185,111,.16)}
.m27-session-readiness-coach-item>span{color:var(--m26-gold,#a98534);font-size:.58rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.m27-session-readiness-coach-item>strong{color:var(--m26-text,#17231d);font-size:.84rem;line-height:1.3}
.m27-session-readiness-coach-item>small{color:var(--m26-text-muted,#6b675f);font-size:.65rem;line-height:1.45}
.m27-session-live-context-flag{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:.65rem;margin:.62rem 0 .18rem;padding:.58rem .7rem;border:1px solid rgba(169,133,52,.24);border-left:3px solid var(--m26-gold,#a98534);border-radius:.72rem;background:rgba(216,185,111,.045)}
.m27-session-live-context-flag[data-level="critical"]{border-left-color:#8f4339;background:rgba(143,67,57,.055)}
.m27-session-live-context-flag>span{color:var(--m26-gold,#a98534);font-size:.57rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.m27-session-live-context-copy{display:grid;gap:.08rem;min-width:0}
.m27-session-live-context-copy>strong{color:var(--m26-text,#17231d);font-size:.78rem;line-height:1.25}
.m27-session-live-context-copy>small{overflow:hidden;color:var(--m26-text-muted,#6b675f);font-size:.64rem;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
.m27-session-focus-dock{display:none}
.m27-session-focus-meta{min-width:0;display:grid;gap:.08rem}
.m27-session-focus-meta>span{color:var(--m26-gold,#a98534);font-size:.58rem;font-weight:850;letter-spacing:.1em;text-transform:uppercase}
.m27-session-focus-meta>strong{overflow:hidden;color:var(--m26-text,#17231d);font-size:.82rem;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
.m27-session-focus-meta>small{overflow:hidden;color:var(--m26-text-muted,#6b675f);font-size:.64rem;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
.m27-session-focus-wake{display:inline-flex;align-items:center;gap:.3rem;width:max-content;margin-top:.08rem;color:var(--m26-text-muted,#6b675f);font-size:.58rem;font-weight:750}
.m27-session-focus-wake[hidden]{display:none}
.m27-session-focus-wake::before{content:'';width:.42rem;height:.42rem;border-radius:50%;background:var(--m26-gold,#a98534);box-shadow:0 0 0 .2rem rgba(169,133,52,.12)}
.m27-session-focus-actions{display:flex;align-items:center;justify-content:flex-end;gap:.42rem;flex:0 0 auto}
.m27-session-focus-primary,
.m27-session-focus-secondary{min-height:3.15rem;border-radius:.86rem;font:inherit;font-weight:850;cursor:pointer;touch-action:manipulation}
.m27-session-focus-primary{min-width:8.6rem;padding:.72rem 1rem;border:1px solid rgba(216,185,111,.48);background:linear-gradient(135deg,var(--m26-green,#153328),#0f271f);color:#fff;font-size:.78rem;letter-spacing:-.01em;box-shadow:0 10px 26px rgba(8,25,19,.18)}
.m27-session-focus-secondary{min-width:3.15rem;padding:.65rem .72rem;border:1px solid rgba(216,185,111,.28);background:color-mix(in srgb,var(--m26-surface,#f7f1e7) 88%,var(--m26-green,#153328) 12%);color:var(--m26-text,#17231d);font-size:.72rem;box-shadow:none}
.m27-session-focus-primary:disabled,
.m27-session-focus-secondary:disabled{cursor:not-allowed;opacity:.58}
.m27-session-focus-primary:focus-visible,
.m27-session-focus-secondary:focus-visible{outline:3px solid rgba(216,185,111,.42);outline-offset:3px}
@media (min-width:761px) and (max-width:1180px){
  .m27-session-focus-active.m27-session-focus-coach{padding-bottom:6rem}
  .m27-session-focus-dock.is-coach{position:fixed;z-index:78;right:max(1rem,env(safe-area-inset-right));bottom:max(1rem,env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:space-between;gap:1rem;max-width:min(46rem,calc(100vw - 2rem));padding:.72rem .78rem;border:1px solid rgba(216,185,111,.28);border-radius:1rem;background:color-mix(in srgb,var(--m26-surface,#f7f1e7) 93%,transparent);box-shadow:0 18px 48px rgba(9,25,19,.2);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
}
@media (max-width:820px){.m27-session-readiness-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:760px){
  .m27-session-focus-active{padding-bottom:6.7rem}
  .m27-session-focus-dock{position:fixed;z-index:80;left:max(.72rem,env(safe-area-inset-left));right:max(.72rem,env(safe-area-inset-right));bottom:calc(max(.65rem,env(safe-area-inset-bottom)) + 4.55rem);display:flex;align-items:center;justify-content:space-between;gap:.8rem;padding:.68rem .72rem;border:1px solid rgba(216,185,111,.28);border-radius:1rem;background:color-mix(in srgb,var(--m26-surface,#f7f1e7) 91%,transparent);box-shadow:0 18px 48px rgba(9,25,19,.2);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
}
@media (max-width:560px){.m27-session-readiness-head{display:grid;gap:.3rem}.m27-session-readiness-head p{text-align:left}.m27-session-readiness-grid{grid-template-columns:1fr}.m27-session-readiness-coach-brief{grid-template-columns:1fr}.m27-session-readiness-coach-item+ .m27-session-readiness-coach-item{padding-top:.62rem;border-top:1px solid rgba(216,185,111,.14);border-left:0}.m27-session-live-context-flag{grid-template-columns:1fr;gap:.2rem}.m27-session-live-context-flag>span{white-space:normal}.m27-session-live-context-copy>small{white-space:normal}}
@media (max-width:430px){
  .m27-session-focus-dock:not(.is-coach){gap:.58rem;padding:.62rem}
  .m27-session-focus-dock:not(.is-coach) .m27-session-focus-actions{max-width:48%}
  .m27-session-focus-dock:not(.is-coach) .m27-session-focus-primary{min-width:7.6rem;max-width:100%;padding:.7rem .78rem}
  .m27-session-focus-dock.is-coach{align-items:stretch;flex-direction:column;gap:.48rem;padding:.62rem}
  .m27-session-focus-dock.is-coach .m27-session-focus-actions{width:100%}
  .m27-session-focus-dock.is-coach .m27-session-focus-primary{flex:1 1 auto;min-width:0;padding:.7rem .78rem}
  .m27-session-focus-dock.is-coach .m27-session-focus-secondary{flex:0 0 3.15rem;padding:.62rem .55rem}
  .m27-session-focus-meta>strong{font-size:.76rem}
}
@media (forced-colors:active){.m27-session-focus-dock,.m27-session-focus-primary,.m27-session-focus-secondary{border-color:ButtonText}.m27-session-focus-primary,.m27-session-focus-secondary{forced-color-adjust:auto}}
@media (prefers-reduced-motion:reduce){.m27-session-focus-primary,.m27-session-focus-secondary{scroll-behavior:auto}}
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

function wellbeingHeadline(checkin){
  if(!checkin)return 'Sin registro reciente';
  const parts=[];
  if(Number.isFinite(checkin.energy))parts.push(`Energía ${checkin.energy}`);
  if(Number.isFinite(checkin.sleep))parts.push(`Sueño ${checkin.sleep}`);
  if(Number.isFinite(checkin.stress))parts.push(`Estrés ${checkin.stress}`);
  if(Number.isFinite(checkin.pain))parts.push(`Dolor ${checkin.pain}`);
  return parts.join(' · ')||'Contexto disponible';
}

function constancyHeadline(window){
  return Number.isFinite(window?.adherence)
    ?`${Math.round(window.adherence*100)}%`
    :'Sin plan comparable';
}

export function buildSessionReadinessSnapshot(state,clientId,{now=new Date()}={}){
  const id=String(clientId||'').trim();
  if(!id)return null;
  const progress=computeProgressSummary(state,id,{now,days:28});
  const constancy=buildAdherenceWindows(state,id,{now}).find((item)=>item.days===28)||null;
  const alerts=deriveAdherenceAlerts(state,id,{now});
  const signal=adherenceSignal(alerts);
  const topAlert=alerts[0]||null;
  const latestCheckin=progress?.latestCheckin?Object.freeze({...progress.latestCheckin}):null;

  return Object.freeze({
    clientId:id,
    constancy,
    latestCheckin,
    latestCheckinAt:progress?.latestCheckinAt||null,
    lastExecutionAt:progress?.lastExecutionAt||null,
    lastExecutionRpe:Number.isFinite(progress?.lastExecutionRpe)?progress.lastExecutionRpe:null,
    dataQuality:progress?.dataQuality||'limitada',
    attention:Object.freeze({
      level:signal.level,
      title:topAlert?.title||'Sin señales prioritarias',
      detail:topAlert?.detail||'No hay señales prioritarias en los datos confirmados disponibles.',
      source:topAlert?.source||null,
    }),
  });
}

function coachBriefText(value,max=240){
  return String(value??'').trim().slice(0,max);
}

function coachReadinessRecord(record){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?{...record,...record.body}
    :record||{};
}

function coachReadinessFeedback(execution){
  const item=coachReadinessRecord(execution);
  const feedback=item?.feedback&&typeof item.feedback==='object'&&!Array.isArray(item.feedback)
    ?item.feedback
    :{};
  const rawRpe=feedback.sessionRpe??feedback.session_rpe;
  const sessionRpe=rawRpe!==null&&rawRpe!==undefined&&rawRpe!==''&&Number.isFinite(Number(rawRpe))
    ?Number(rawRpe)
    :null;
  return Object.freeze({
    sessionRpe,
    comment:coachBriefText(feedback.comment??feedback.comments??feedback.note??feedback.notes,280)||null,
    pain:feedback.pain===true||feedback.pain==='true',
    painNotes:coachBriefText(feedback.painNotes??feedback.pain_notes,220)||null,
  });
}

function latestConfirmedCoachExecution(state,clientId){
  const rows=[...confirmedSessionExecutionsForClient(
    state,
    clientId,
    {requireCompleted:true,requireDate:false},
  )];
  rows.sort((a,b)=>{
    const aTime=new Date(sessionExecutionDate(a)||0).getTime();
    const bTime=new Date(sessionExecutionDate(b)||0).getTime();
    return (Number.isFinite(bTime)?bTime:0)-(Number.isFinite(aTime)?aTime:0);
  });
  return rows[0]||null;
}

export function buildCoachSessionReadinessContext(state,clientId,{now=new Date()}={}){
  const id=String(clientId||'').trim();
  if(!id)return null;

  const execution=latestConfirmedCoachExecution(state,id);
  const feedback=execution?coachReadinessFeedback(execution):null;
  const decisions=summarizeActionOutcomes(
    state?.collections?.m26Entities||[],
    id,
    {now},
  );
  const open=Array.isArray(decisions.open)?decisions.open:[];
  const top=decisions.needsReview||open[0]||null;

  return Object.freeze({
    clientId:id,
    feedback:Object.freeze({
      hasExecution:Boolean(execution),
      completedAt:execution?sessionExecutionDate(execution)||null:null,
      sessionRpe:feedback?.sessionRpe??null,
      comment:feedback?.comment??null,
      pain:feedback?.pain===true,
      painNotes:feedback?.painNotes??null,
    }),
    decisions:Object.freeze({
      openCount:Number(decisions.openCount||0),
      overdueCount:Number(decisions.overdueCount||0),
      dueTodayCount:Number(decisions.dueTodayCount||0),
      topSignal:coachBriefText(top?.signalSummary,280)||null,
    }),
  });
}

export function buildCoachLiveContextSignal(snapshot,coachContext){
  const attention=snapshot?.attention||{};
  const feedback=coachContext?.feedback||{};
  const decisions=coachContext?.decisions||{};

  if(String(attention.level||'').toLowerCase()==='critical'){
    return Object.freeze({
      kind:'attention-critical',
      level:'critical',
      title:coachBriefText(attention.title,180)||'Atención prioritaria',
      detail:coachBriefText(attention.detail,320)||'Revisa el contexto confirmado antes de continuar.',
    });
  }

  if(feedback.pain===true){
    return Object.freeze({
      kind:'confirmed-pain',
      level:'warning',
      title:'Dolor o molestia en el último cierre',
      detail:feedback.painNotes||feedback.comment||'Dato confirmado del último cierre; mantén este contexto presente durante la sesión.',
    });
  }

  if(Number(decisions.overdueCount||0)>0){
    return Object.freeze({
      kind:'decision-overdue',
      level:'warning',
      title:'Decisión vencida',
      detail:decisions.topSignal||'Existe una decisión profesional pendiente de revisión.',
    });
  }

  if(Number(decisions.dueTodayCount||0)>0){
    return Object.freeze({
      kind:'decision-due-today',
      level:'warning',
      title:'Decisión para revisar hoy',
      detail:decisions.topSignal||'Existe una decisión profesional prevista para revisión hoy.',
    });
  }

  if(['warning','critical'].includes(String(attention.level||'').toLowerCase())){
    return Object.freeze({
      kind:'attention',
      level:String(attention.level||'warning').toLowerCase(),
      title:coachBriefText(attention.title,180)||'Requiere revisión',
      detail:coachBriefText(attention.detail,320)||'Revisa el contexto confirmado durante la sesión.',
    });
  }

  return null;
}

function card(document,label,headline,detail,{level='clear'}={}){
  const item=create(document,'article','m27-session-readiness-card');
  item.setAttribute('data-level',level);
  item.append(
    create(document,'span','',label),
    create(document,'strong','',headline),
    create(document,'small','',detail),
  );
  return item;
}

function buildCoachReadinessBrief(document,context){
  if(!context)return null;
  const feedback=context.feedback||{};
  const decisions=context.decisions||{};
  const brief=create(document,'div','m27-session-readiness-coach-brief');
  brief.setAttribute('data-m27-coach-session-readiness','true');
  brief.setAttribute('aria-label','Contexto profesional previo a la sesión');

  const feedbackItem=create(document,'div','m27-session-readiness-coach-item');
  const feedbackHeadline=feedback.hasExecution
    ?[
        Number.isFinite(feedback.sessionRpe)?`RPE ${feedback.sessionRpe}`:null,
        feedback.pain?'Dolor o molestia registrado':null,
      ].filter(Boolean).join(' · ')||'Cierre confirmado'
    :'Sin cierre confirmado';
  const feedbackDetail=feedback.hasExecution
    ?[
        feedback.comment||null,
        feedback.painNotes?`Molestia: ${feedback.painNotes}`:null,
      ].filter(Boolean).join(' · ')||'Sin comentario final confirmado.'
    :'No hay una ejecución confirmada anterior para contextualizar esta sesión.';
  feedbackItem.append(
    create(document,'span','','Último cierre confirmado'),
    create(document,'strong','',feedbackHeadline),
    create(document,'small','',feedbackDetail),
  );

  const decisionItem=create(document,'div','m27-session-readiness-coach-item');
  const decisionHeadline=decisions.openCount
    ?`${decisions.openCount} abierta${decisions.openCount===1?'':'s'}${decisions.overdueCount?` · ${decisions.overdueCount} vencida${decisions.overdueCount===1?'':'s'}`:''}`
    :'Sin decisiones abiertas';
  decisionItem.append(
    create(document,'span','','Decisiones del Coach'),
    create(document,'strong','',decisionHeadline),
    create(document,'small','',decisions.topSignal||'No hay seguimientos profesionales pendientes antes de iniciar.'),
  );

  brief.append(feedbackItem,decisionItem);
  return brief;
}

function buildCoachLiveContextFlag(document,signal){
  if(!signal)return null;
  const flag=create(document,'aside','m27-session-live-context-flag');
  flag.setAttribute('data-m27-coach-live-context','true');
  flag.setAttribute('data-level',signal.level||'warning');
  flag.setAttribute('data-kind',signal.kind||'attention');
  flag.setAttribute('aria-label','Contexto profesional activo');

  const copy=create(document,'div','m27-session-live-context-copy');
  copy.append(
    create(document,'strong','',signal.title),
    create(document,'small','',signal.detail),
  );

  flag.append(
    create(document,'span','','Mantener presente'),
    copy,
  );
  return flag;
}

function buildReadinessSection(document,snapshot,role,coachContext=null){
  const section=create(document,'section','m27-session-readiness');
  section.setAttribute('data-m27-session-readiness','true');
  section.setAttribute('aria-label','Contexto previo a la sesión');

  const head=create(document,'div','m27-session-readiness-head');
  const titles=create(document,'div');
  titles.append(
    create(document,'span','','Antes de empezar'),
    create(document,'h3','','Contexto de la sesión'),
  );
  const roleCopy=role==='coach'
    ?'Datos confirmados para orientar tu criterio antes de iniciar. IBERFIT no cambia automáticamente cargas, series ni ejercicios.'
    :'Resumen de tus datos confirmados antes de entrenar. Cualquier ajuste del plan sigue dependiendo de tu Entrenador.';
  head.append(titles,create(document,'p','',roleCopy));

  const grid=create(document,'div','m27-session-readiness-grid');
  const checkinDate=formatIberfitDate(snapshot.latestCheckinAt,{locale:'es-CL',includeTime:true});
  const executionDate=formatIberfitDate(snapshot.lastExecutionAt,{locale:'es-CL',includeTime:true});
  const constancy=snapshot.constancy;
  const constancyDetail=constancy?.hasPlan
    ?`${constancy.completedSessions} de ${constancy.plannedSessions} sesiones confirmadas en 28 días${constancy.unconfirmedExecutions?` · ${constancy.unconfirmedExecutions} pendiente${constancy.unconfirmedExecutions===1?'':'s'} fuera del cálculo`:''}`
    :'No hay sesiones suficientes para calcular constancia sin inventar datos.';

  grid.append(
    card(document,'Bienestar',wellbeingHeadline(snapshot.latestCheckin),checkinDate?`Último registro · ${checkinDate}`:'Sin registro confirmado reciente'),
    card(document,'Constancia · 28 días',constancyHeadline(constancy),constancyDetail),
    card(document,'Última sesión',Number.isFinite(snapshot.lastExecutionRpe)?`RPE medio ${snapshot.lastExecutionRpe}`:'Sin RPE comparable',executionDate?`Sesión confirmada · ${executionDate}`:'Sin ejecución confirmada reciente'),
    card(document,'Atención',snapshot.attention.title,snapshot.attention.level==='clear'?'No requiere una acción adicional antes de iniciar con los datos disponibles.':snapshot.attention.detail,{level:snapshot.attention.level}),
  );

  section.append(head,grid);
  if(role==='coach'){
    const coachBrief=buildCoachReadinessBrief(document,coachContext);
    if(coachBrief)section.append(coachBrief);
  }
  return section;
}

export function enhanceSessionReadiness({root,viewModel,state,now=new Date()}={}){
  if(!root?.querySelector||!root.ownerDocument)return false;
  if(String(viewModel?.activeArea||'')!=='sesion')return false;
  const role=String(viewModel?.identity?.role||'').trim().toLowerCase();
  if(!['client','coach'].includes(role))return false;
  const live=root.querySelector?.('[data-session-live-state]');
  if(!live)return false;
  const liveState=String(live.getAttribute?.('data-session-live-state')||'').trim().toLowerCase();
  const clientId=clientIdFor(viewModel,state);
  if(!clientId)return false;

  installStyles(root.ownerDocument);

  if(liveState==='ready'){
    live.querySelector?.('[data-m27-session-readiness]')?.remove?.();
    const snapshot=buildSessionReadinessSnapshot(state,clientId,{now});
    if(!snapshot)return false;
    const coachContext=role==='coach'
      ?buildCoachSessionReadinessContext(state,clientId,{now})
      :null;
    const section=buildReadinessSection(root.ownerDocument,snapshot,role,coachContext);
    const hero=live.querySelector?.('.m26-session-live-hero');
    if(hero?.nextSibling)live.insertBefore(section,hero.nextSibling);
    else if(hero)live.append(section);
    else live.prepend(section);
    return true;
  }

  if(role!=='coach'||!['active','rest'].includes(liveState))return false;

  live.querySelector?.('[data-m27-coach-live-context]')?.remove?.();
  const snapshot=buildSessionReadinessSnapshot(state,clientId,{now});
  const coachContext=buildCoachSessionReadinessContext(state,clientId,{now});
  const signal=buildCoachLiveContextSignal(snapshot,coachContext);
  if(!signal)return false;

  const flag=buildCoachLiveContextFlag(root.ownerDocument,signal);
  const hero=live.querySelector?.('.m26-session-live-hero');
  if(hero?.nextSibling)live.insertBefore(flag,hero.nextSibling);
  else if(hero)live.append(flag);
  else live.prepend(flag);
  return true;
}

export function sessionFocusPlan({state='',hasCompleteSet=false,hasNext=false}={}){
  const normalized=String(state||'').trim().toLowerCase();
  if(normalized==='ready')return Object.freeze({state:normalized,targetSelector:'[data-session-action="start"]',fallbackLabel:'Iniciar sesión'});
  if(normalized==='feedback')return Object.freeze({state:normalized,targetSelector:'[data-session-action="finish"]',fallbackLabel:'Finalizar y guardar'});
  if(normalized==='paused')return Object.freeze({state:normalized,targetSelector:'[data-session-action="resume"]',fallbackLabel:'Reanudar sesión'});
  if(['active','rest'].includes(normalized)){
    if(hasCompleteSet)return Object.freeze({state:normalized,targetSelector:'[data-session-action="complete-set"]',fallbackLabel:'Completar serie'});
    if(hasNext)return Object.freeze({state:normalized,targetSelector:'[data-session-action="next"]',fallbackLabel:normalized==='rest'?'Continuar ahora':'Continuar'});
  }
  return null;
}

export function sessionFocusSecondarySelectors({
  state='',
  role='',
  hasRepeat=false,
  hasRestMinus=false,
  hasRestPlus=false,
}={}){
  const normalizedState=String(state||'').trim().toLowerCase();
  const normalizedRole=String(role||'').trim().toLowerCase();
  if(normalizedRole!=='coach')return Object.freeze([]);
  if(normalizedState==='active'&&hasRepeat){
    return Object.freeze(['[data-session-action="repeat-previous-set"]']);
  }
  if(normalizedState==='rest'){
    return Object.freeze([
      hasRestMinus?'[data-session-action="rest-minus"]':null,
      hasRestPlus?'[data-session-action="rest-plus"]':null,
    ].filter(Boolean));
  }
  return Object.freeze([]);
}

function focusStateFor(root){
  let state=ROOT_STATE.get(root);
  if(state)return state;
  const document=root.ownerDocument;
  state={wakeLock:null,wakeRequest:null,destroyed:false,enabled:false,role:'',refreshTimer:null,onClick:null,onVisibility:null};
  state.onClick=(event)=>{
    const proxy=event.target?.closest?.('[data-session-focus-proxy]');
    if(proxy&&root.contains?.(proxy)){
      event.preventDefault?.();
      const selector=String(proxy.dataset?.sessionFocusTarget||'').trim();
      const live=proxy.closest?.('[data-session-live-state]');
      const target=selector&&live?.querySelector?.(selector);
      if(target&&!target.disabled){
        target.focus?.({preventScroll:true});
        target.click?.();
      }
      scheduleFocusRefresh(root,state);
      return;
    }
    const sessionAction=event.target?.closest?.('[data-session-action]');
    if(sessionAction&&root.contains?.(sessionAction))scheduleFocusRefresh(root,state);
  };
  state.onVisibility=()=>{
    const live=root.querySelector?.('[data-session-live-state]');
    const liveState=String(live?.getAttribute?.('data-session-live-state')||'').trim().toLowerCase();
    void syncWakeLock(root,state.enabled&&ACTIVE_WAKE_STATES.has(liveState));
  };
  root.addEventListener?.('click',state.onClick);
  document?.addEventListener?.('visibilitychange',state.onVisibility);
  ROOT_STATE.set(root,state);
  return state;
}

function wakeBadge(root,active){
  const badge=root.querySelector?.('[data-session-focus-wake]');
  if(!badge)return;
  badge.hidden=!active;
  badge.textContent=active?'Pantalla activa durante el entrenamiento':'';
}

async function releaseWakeLock(root,state=ROOT_STATE.get(root)){
  if(!state)return;
  const sentinel=state.wakeLock;
  state.wakeLock=null;
  wakeBadge(root,false);
  if(!sentinel?.release)return;
  try{await sentinel.release();}catch{}
}

async function syncWakeLock(root,shouldKeepAwake){
  const state=focusStateFor(root);
  if(state.destroyed)return false;
  const document=root.ownerDocument;
  if(!shouldKeepAwake||document?.visibilityState==='hidden'){
    await releaseWakeLock(root,state);
    return false;
  }
  if(state.wakeLock){
    wakeBadge(root,true);
    return true;
  }
  if(state.wakeRequest)return state.wakeRequest;
  const navigator=document?.defaultView?.navigator||globalThis.navigator;
  if(typeof navigator?.wakeLock?.request!=='function')return false;

  state.wakeRequest=(async()=>{
    try{
      const sentinel=await navigator.wakeLock.request('screen');
      if(state.destroyed){
        try{await sentinel?.release?.();}catch{}
        return false;
      }
      state.wakeLock=sentinel;
      sentinel?.addEventListener?.('release',()=>{
        if(state.wakeLock===sentinel)state.wakeLock=null;
        wakeBadge(root,false);
      },{once:true});
      wakeBadge(root,true);
      return true;
    }catch{
      wakeBadge(root,false);
      return false;
    }finally{
      state.wakeRequest=null;
    }
  })();
  return state.wakeRequest;
}

function focusContext(live,state){
  const progress=live.querySelector?.('[data-session-progress-label]')?.textContent?.trim();
  const rest=live.querySelector?.('[data-session-rest]')?.textContent?.trim();
  const elapsed=live.querySelector?.('[data-session-elapsed]')?.textContent?.trim();
  const headline=progress||({ready:'Preparada para empezar',feedback:'Cierre post-sesión',paused:'Sesión pausada',rest:'Descanso activo',active:'Sesión en curso'})[state]||'Live Workout';
  const detail=state==='rest'&&rest&&rest!=='—'
    ?`Descanso ${rest}${elapsed?` · ${elapsed} activos`:''}`
    :elapsed
      ?`${elapsed} de tiempo activo`
      :'Acción principal siempre al alcance';
  return {headline,detail};
}

function removeFocusDock(root){
  for(const live of root.querySelectorAll?.('[data-session-live-state]')||[]){
    live.classList?.remove?.('m27-session-focus-active');
    live.classList?.remove?.('m27-session-focus-coach');
  }
  root.querySelector?.('[data-session-focus-dock]')?.remove?.();
}

function focusProxyButton(document,live,selector,{primary=false}={}){
  const target=live.querySelector?.(selector);
  if(!target)return null;
  const proxy=create(
    document,
    'button',
    primary?'m27-session-focus-primary':'m27-session-focus-secondary',
    target.textContent?.trim()||target.getAttribute?.('aria-label')||'',
  );
  proxy.type='button';
  proxy.setAttribute('data-session-focus-proxy','true');
  proxy.dataset.sessionFocusTarget=selector;
  const ariaLabel=target.getAttribute?.('aria-label');
  const title=target.getAttribute?.('title');
  if(ariaLabel)proxy.setAttribute('aria-label',ariaLabel);
  if(title)proxy.setAttribute('title',title);
  proxy.disabled=Boolean(target.disabled);
  proxy.setAttribute('aria-disabled',proxy.disabled?'true':'false');
  return proxy;
}

function buildFocusDock(document,live,plan,role='client'){
  const target=live.querySelector?.(plan.targetSelector);
  if(!target)return null;
  const context=focusContext(live,plan.state);
  const isCoach=String(role||'').trim().toLowerCase()==='coach';
  const dock=create(document,'aside',`m27-session-focus-dock${isCoach?' is-coach':''}`);
  dock.setAttribute('data-session-focus-dock','true');
  dock.setAttribute('data-session-focus-role',isCoach?'coach':'client');
  dock.setAttribute('aria-label','Control rápido de la sesión');

  const meta=create(document,'div','m27-session-focus-meta');
  meta.append(
    create(document,'span','',plan.state==='rest'?'Descanso':'Live Workout'),
    create(document,'strong','',context.headline),
    create(document,'small','',context.detail),
  );
  const wake=create(document,'small','m27-session-focus-wake');
  wake.setAttribute('data-session-focus-wake','true');
  wake.hidden=true;
  meta.append(wake);

  const actions=create(document,'div','m27-session-focus-actions');
  const secondarySelectors=sessionFocusSecondarySelectors({
    state:plan.state,
    role,
    hasRepeat:Boolean(live.querySelector?.('[data-session-action="repeat-previous-set"]')),
    hasRestMinus:Boolean(live.querySelector?.('[data-session-action="rest-minus"]')),
    hasRestPlus:Boolean(live.querySelector?.('[data-session-action="rest-plus"]')),
  });
  for(const selector of secondarySelectors){
    const secondary=focusProxyButton(document,live,selector);
    if(secondary)actions.append(secondary);
  }
  const primary=focusProxyButton(
    document,
    live,
    plan.targetSelector,
    {primary:true},
  );
  if(!primary)return null;
  actions.append(primary);
  dock.append(meta,actions);
  return dock;
}

function refreshSessionFocus(root){
  const state=ROOT_STATE.get(root);
  removeFocusDock(root);
  if(!state?.enabled||state.destroyed){
    void releaseWakeLock(root,state);
    return false;
  }
  const live=root.querySelector?.('[data-session-live-state]');
  if(!live){
    void releaseWakeLock(root,state);
    return false;
  }
  const liveState=String(live.getAttribute('data-session-live-state')||'').trim().toLowerCase();
  const plan=sessionFocusPlan({
    state:liveState,
    hasCompleteSet:Boolean(live.querySelector('[data-session-action="complete-set"]')),
    hasNext:Boolean(live.querySelector('[data-session-action="next"]')),
  });
  void syncWakeLock(root,ACTIVE_WAKE_STATES.has(liveState));
  if(!plan)return false;

  installStyles(root.ownerDocument);
  const dock=buildFocusDock(root.ownerDocument,live,plan,state.role);
  if(!dock)return false;
  live.classList.add('m27-session-focus-active');
  if(state.role==='coach')live.classList.add('m27-session-focus-coach');
  live.append(dock);
  wakeBadge(root,Boolean(state.wakeLock));
  return true;
}

function scheduleFocusRefresh(root,state=ROOT_STATE.get(root)){
  if(!state?.enabled||state.destroyed)return;
  queueMicrotask(()=>refreshSessionFocus(root));
  const view=root.ownerDocument?.defaultView||globalThis;
  if(state.refreshTimer)view.clearTimeout?.(state.refreshTimer);
  state.refreshTimer=view.setTimeout?.(()=>{
    state.refreshTimer=null;
    refreshSessionFocus(root);
  },80)||null;
}

export function enhanceSessionFocus({root,viewModel}={}){
  if(!root?.querySelector||!root.ownerDocument)return false;
  const state=focusStateFor(root);
  const role=String(viewModel?.identity?.role||'').trim().toLowerCase();
  const area=String(viewModel?.activeArea||'').trim().toLowerCase();
  state.role=role;
  state.enabled=area==='sesion'&&['client','coach'].includes(role);
  return refreshSessionFocus(root);
}

export function teardownSessionFocus({root}={}){
  const state=root&&ROOT_STATE.get(root);
  if(!state)return false;
  state.destroyed=true;
  state.enabled=false;
  const view=root.ownerDocument?.defaultView||globalThis;
  if(state.refreshTimer)view.clearTimeout?.(state.refreshTimer);
  state.refreshTimer=null;
  root.removeEventListener?.('click',state.onClick);
  root.ownerDocument?.removeEventListener?.('visibilitychange',state.onVisibility);
  void releaseWakeLock(root,state);
  removeFocusDock(root);
  ROOT_STATE.delete(root);
  return true;
}
