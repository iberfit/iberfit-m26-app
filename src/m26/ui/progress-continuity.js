import {buildAdherenceWindows} from '../engagement/progress-continuity.js';

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
.m27-session-feedback-premium{position:relative;overflow:hidden}
.m27-session-feedback-explainer{margin:.3rem 0 .95rem;padding:.72rem .8rem;border-left:3px solid rgba(216,185,111,.65);border-radius:.2rem .7rem .7rem .2rem;background:rgba(216,185,111,.055);color:var(--m26-text-muted,#6b675f);font-size:.78rem;line-height:1.5}
.m27-session-continuity{display:grid;gap:.22rem;margin:.85rem 0;padding:.82rem .88rem;border:1px solid rgba(216,185,111,.2);border-radius:.82rem;background:rgba(216,185,111,.055)}
.m27-session-continuity>span{color:var(--m26-gold,#a98534);font-size:.63rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.m27-session-continuity>strong{color:var(--m26-text,#17231d);font-size:.94rem;letter-spacing:-.015em}
.m27-session-continuity>p{margin:0;color:var(--m26-text-muted,#6b675f);font-size:.76rem;line-height:1.48}
@media (max-width:560px){.m27-constancia{padding:.78rem}.m27-constancia-head{display:grid;gap:.28rem}.m27-constancia-head p{text-align:left}.m27-constancia-grid{grid-template-columns:1fr}.m27-constancia-window{min-height:0}}
@media (prefers-reduced-motion:reduce){.m27-constancia-window,.m27-session-continuity{scroll-behavior:auto}}
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
  const constancy=enhanceConstancy({root,viewModel,state,now});
  const feedback=enhanceFeedbackClosure({root,viewModel});
  const completed=enhanceCompletedClosure({root});
  return Boolean(constancy||feedback||completed);
}
