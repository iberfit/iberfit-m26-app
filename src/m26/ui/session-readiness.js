import {buildAdaptiveSessionContext} from '../intelligence/adaptive-context.js';
import {buildClientHomeSnapshot} from './progress-continuity.js';

const STYLE_ID='m27-session-readiness-styles';
const REVIEW_LEVELS=new Set(['hold','reduced','simplified']);

const STYLES=`
.m27-session-readiness{display:grid;gap:.72rem;margin:.8rem 0;padding:.9rem;border:1px solid rgba(216,185,111,.18);border-radius:.95rem;background:linear-gradient(145deg,rgba(216,185,111,.065),rgba(255,255,255,.02))}
.m27-session-readiness[data-level="hold"]{border-color:rgba(149,67,54,.32);background:rgba(149,67,54,.045)}
.m27-session-readiness[data-level="reduced"],.m27-session-readiness[data-level="simplified"]{border-color:rgba(169,133,52,.32)}
.m27-session-readiness-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
.m27-session-readiness-head>div{display:grid;gap:.18rem}
.m27-session-readiness-head span{color:var(--m26-gold,#a98534);font-size:.62rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase}
.m27-session-readiness-head h3{margin:0;color:var(--m26-text,#17231d);font-size:1rem;letter-spacing:-.018em}
.m27-session-readiness-head p{max-width:42rem;margin:0;color:var(--m26-text-muted,#6b675f);font-size:.73rem;line-height:1.48}
.m27-session-readiness-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.52rem}
.m27-session-readiness-metric{display:grid;gap:.16rem;padding:.62rem .68rem;border:1px solid rgba(216,185,111,.1);border-radius:.72rem;background:rgba(255,255,255,.025)}
.m27-session-readiness-metric span{color:var(--m26-text-muted,#6b675f);font-size:.61rem}
.m27-session-readiness-metric strong{color:var(--m26-text,#17231d);font-size:.88rem;font-variant-numeric:tabular-nums}
.m27-session-readiness-note{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:.7rem .75rem;border-left:3px solid rgba(216,185,111,.58);border-radius:.18rem .68rem .68rem .18rem;background:rgba(216,185,111,.055)}
.m27-session-readiness-note>div{display:grid;gap:.14rem}
.m27-session-readiness-note strong{color:var(--m26-text,#17231d);font-size:.78rem}
.m27-session-readiness-note p{margin:0;color:var(--m26-text-muted,#6b675f);font-size:.69rem;line-height:1.45}
.m27-session-readiness-note button{flex:0 0 auto;border:0;background:transparent;color:var(--m26-gold,#8f7028);font:inherit;font-size:.7rem;font-weight:800;cursor:pointer}
@media (max-width:780px){.m27-session-readiness-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.m27-session-readiness-note{display:grid}}
@media (max-width:520px){.m27-session-readiness-head{display:grid}.m27-session-readiness-grid{grid-template-columns:1fr}}
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
  if(String(viewModel?.identity?.role||'').trim().toLowerCase()!=='client')return '';
  return String(state?.identity?.clientId||'').trim();
}

function metricValue(value){
  return Number.isFinite(Number(value))?String(Number(value)):'Sin dato';
}

function readinessCopy(level,reviewRequired,dataQuality){
  if(level==='hold')return 'Tu contexto confirmado requiere revisión antes de decidir cualquier ajuste del entrenamiento.';
  if(level==='reduced')return 'Hay contexto reciente que conviene revisar antes de entrenar. El plan publicado no cambia automáticamente.';
  if(level==='simplified')return 'La continuidad reciente aconseja revisar el contexto de la sesión. La decisión final sigue siendo del Entrenador.';
  if(dataQuality==='limitada')return 'No hay una señal prioritaria confirmada, pero todavía hay pocos datos para interpretar el contexto con alta confianza.';
  return reviewRequired
    ?'Hay contexto reciente que requiere revisión del Entrenador.'
    :'No hay señales prioritarias confirmadas que obliguen a modificar la sesión publicada.';
}

export function buildSessionReadinessSnapshot(state,clientId,{now=new Date()}={}){
  const id=String(clientId||'').trim();
  if(!id)return null;
  const adaptive=buildAdaptiveSessionContext(state,id,{now});
  const level=String(adaptive?.decision?.level||'normal');
  const reviewRequired=REVIEW_LEVELS.has(level);
  const importantAlerts=(adaptive?.alerts||[]).filter((item)=>['critical','warning'].includes(item?.severity));
  const topAlert=importantAlerts[0]||null;
  const checkin=adaptive?.evidence?.latestCheckin||null;
  const home=buildClientHomeSnapshot(state,id,{now});
  const todayTraining=home?.todayTraining||null;
  const sessionId=String(todayTraining?.appointment?.sessionId||'').trim()||null;

  return Object.freeze({
    clientId:id,
    level,
    reviewRequired,
    directStartAllowed:Boolean(todayTraining?.ready&&sessionId&&!reviewRequired),
    sessionId,
    dataQuality:String(adaptive?.evidence?.dataQuality||'limitada'),
    checkin:checkin?Object.freeze({...checkin}):null,
    topAlert:topAlert?Object.freeze({...topAlert}):null,
    title:level==='hold'
      ?'Revisión antes de entrenar'
      :reviewRequired
        ?'Contexto para revisar antes de la sesión'
        :'Preparación de la sesión',
    copy:readinessCopy(level,reviewRequired,String(adaptive?.evidence?.dataQuality||'limitada')),
  });
}

function wireHomeDirectStart({root,snapshot}){
  const button=root.querySelector?.('[data-m27-client-home] [data-home-kind="train-now"] button');
  if(!button||!snapshot?.sessionId)return false;
  if(!snapshot.directStartAllowed){
    button.removeAttribute?.('data-workflow-action');
    button.removeAttribute?.('data-entity-id');
    button.setAttribute?.('data-m26-area','sesion');
    button.textContent='Revisar sesión';
    button.setAttribute?.('aria-label','Revisar el contexto antes de entrenar');
    return true;
  }
  button.removeAttribute?.('data-m26-area');
  button.setAttribute?.('data-workflow-action','start-published-session');
  button.setAttribute?.('data-entity-id',snapshot.sessionId);
  button.textContent='Iniciar entrenamiento';
  button.setAttribute?.('aria-label','Iniciar el entrenamiento confirmado de hoy');
  return true;
}

function metric(document,label,value){
  const item=create(document,'div','m27-session-readiness-metric');
  item.append(create(document,'span','',label),create(document,'strong','',metricValue(value)));
  return item;
}

function buildReadinessPanel(document,snapshot){
  const section=create(document,'section','m27-session-readiness');
  section.setAttribute('data-m27-session-readiness','true');
  section.setAttribute('data-level',snapshot.level);
  section.setAttribute('aria-label','Contexto antes de entrenar');

  const head=create(document,'div','m27-session-readiness-head');
  const copy=create(document,'div');
  copy.append(
    create(document,'span','','Antes de entrenar'),
    create(document,'h3','',snapshot.title),
    create(document,'p','',snapshot.copy),
  );
  head.append(copy);

  const grid=create(document,'div','m27-session-readiness-grid');
  const checkin=snapshot.checkin||{};
  grid.append(
    metric(document,'Energía',checkin.energy),
    metric(document,'Sueño',checkin.sleep),
    metric(document,'Estrés',checkin.stress),
    metric(document,'Dolor',checkin.pain),
  );

  const note=create(document,'div','m27-session-readiness-note');
  const noteCopy=create(document,'div');
  noteCopy.append(
    create(document,'strong','',snapshot.topAlert?.title||'Decisión protegida'),
    create(document,'p','',snapshot.topAlert?.detail||'Los datos se muestran como contexto. El plan, las cargas, las series y los ejercicios no se modifican automáticamente.'),
  );
  const action=create(document,'button','',snapshot.checkin?'Revisar bienestar':'Registrar cómo estás');
  action.type='button';
  action.setAttribute('data-m26-area','actividad');
  note.append(noteCopy,action);

  section.append(head,grid,note);
  return section;
}

function enhanceSessionRoute({root,viewModel,snapshot}){
  if(String(viewModel?.activeArea||'')!=='sesion')return false;
  const route=root.querySelector?.('.m26-route');
  const intro=route?.querySelector?.('.m26-route-intro');
  if(!route||!intro)return false;
  route.querySelector?.('[data-m27-session-readiness]')?.remove?.();
  const panel=buildReadinessPanel(root.ownerDocument,snapshot);
  if(intro.nextSibling)route.insertBefore(panel,intro.nextSibling);
  else route.append(panel);
  return true;
}

export function enhanceSessionReadiness({root,viewModel,state,now=new Date()}={}){
  if(!root?.querySelector||!root.ownerDocument)return false;
  const clientId=clientIdFor(viewModel,state);
  if(!clientId)return false;
  installStyles(root.ownerDocument);
  const snapshot=buildSessionReadinessSnapshot(state,clientId,{now});
  if(!snapshot)return false;
  const home=String(viewModel?.activeArea||'')==='hoy'
    ?wireHomeDirectStart({root,snapshot})
    :false;
  const session=enhanceSessionRoute({root,viewModel,snapshot});
  return Boolean(home||session);
}
