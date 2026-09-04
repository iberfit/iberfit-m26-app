import {computeProgressSummary} from '../engagement/progress-engine.js';
import {adherenceSignal,deriveAdherenceAlerts} from '../engagement/adherence-engine.js';
import {buildAdherenceWindows} from '../engagement/progress-continuity.js';
import {formatIberfitDate} from '../domain/civil-date.js';

const STYLE_ID='m27-session-readiness-styles';
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
@media (max-width:820px){.m27-session-readiness-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.m27-session-readiness-head{display:grid;gap:.3rem}.m27-session-readiness-head p{text-align:left}.m27-session-readiness-grid{grid-template-columns:1fr}}
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

function buildReadinessSection(document,snapshot,role){
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
  return section;
}

export function enhanceSessionReadiness({root,viewModel,state,now=new Date()}={}){
  if(!root?.querySelector||!root.ownerDocument)return false;
  if(String(viewModel?.activeArea||'')!=='sesion')return false;
  const role=String(viewModel?.identity?.role||'').trim().toLowerCase();
  if(!['client','coach'].includes(role))return false;
  const ready=root.querySelector?.('[data-session-live-state="ready"]');
  if(!ready)return false;
  const clientId=clientIdFor(viewModel,state);
  if(!clientId)return false;

  installStyles(root.ownerDocument);
  ready.querySelector?.('[data-m27-session-readiness]')?.remove?.();
  const snapshot=buildSessionReadinessSnapshot(state,clientId,{now});
  if(!snapshot)return false;
  const section=buildReadinessSection(root.ownerDocument,snapshot,role);
  const hero=ready.querySelector?.('.m26-session-live-hero');
  if(hero?.nextSibling)ready.insertBefore(section,hero.nextSibling);
  else if(hero)ready.append(section);
  else ready.prepend(section);
  return true;
}
