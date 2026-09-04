import {
  adherenceSignal,
  computeProgressSummary,
  deriveAdherenceAlerts,
} from '../engagement/index.js';
import {formatIberfitDate} from '../domain/civil-date.js';
import {IBERFIT_UI_LOCALE} from './castellano.js';

const STYLE_ID='m27-cliente-360-core-styles';

const CLIENTE_360_CSS=`
.m26-cliente-360-activo [data-client-bottom-nav-route="progreso"] > .m26-route > .m26-route-intro::before{display:none!important;content:none!important}
.m26-cliente-360-activo .m26-client-bottom-nav-item[data-m26-area="progreso"] .m26-client-bottom-nav-label{font-size:.66rem!important;font-weight:620!important;letter-spacing:-.025em!important}
.m26-cliente-360-activo .m26-client-bottom-nav-item[data-m26-area="progreso"] .m26-client-bottom-nav-label::after{display:none!important;content:none!important}
.m27-cliente-360{display:grid;gap:.9rem;padding:1.05rem;border:1px solid rgba(216,185,111,.18);border-radius:1.2rem;background:linear-gradient(145deg,rgba(12,45,31,.94),rgba(6,26,17,.96));box-shadow:0 20px 48px rgba(0,0,0,.16)}
.m27-cliente-360-header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:.15rem .1rem .3rem}
.m27-cliente-360-identidad{display:grid;gap:.2rem;min-width:0}
.m27-cliente-360-identidad>span{color:#d8b96f;font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.m27-cliente-360-identidad h3{margin:0;color:#f8f2e7;font-size:clamp(1.25rem,3vw,1.8rem);letter-spacing:-.03em}
.m27-cliente-360-identidad p{margin:0;color:#bdb6aa;font-size:.82rem;line-height:1.45}
.m27-cliente-360-senal{display:grid;gap:.16rem;min-width:10rem;padding:.62rem .75rem;border:1px solid rgba(216,185,111,.14);border-radius:.85rem;background:rgba(255,255,255,.025);text-align:right}
.m27-cliente-360-senal span{color:#a9a397;font-size:.64rem;text-transform:uppercase;letter-spacing:.09em}
.m27-cliente-360-senal strong{color:#f3e8cf;font-size:.82rem}
.m27-cliente-360-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.68rem}
.m27-cliente-360-card{display:grid;align-content:start;gap:.25rem;min-height:7rem;padding:.82rem;border:1px solid rgba(216,185,111,.11);border-radius:.9rem;background:rgba(255,255,255,.022)}
.m27-cliente-360-card span{color:#aaa397;font-size:.65rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
.m27-cliente-360-card strong{color:#f8f2e7;font-size:clamp(1.05rem,2.4vw,1.45rem);line-height:1.1;letter-spacing:-.025em}
.m27-cliente-360-card small{color:#9f998f;font-size:.68rem;line-height:1.38}
.m27-cliente-360-contexto{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.68rem}
.m27-cliente-360-contexto>article{display:grid;gap:.5rem;padding:.86rem;border:1px solid rgba(216,185,111,.1);border-radius:.9rem;background:rgba(0,0,0,.09)}
.m27-cliente-360-contexto h4{margin:0;color:#eee3cb;font-size:.83rem}
.m27-cliente-360-mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.45rem}
.m27-cliente-360-mini>div{display:grid;gap:.1rem;padding:.52rem;border-radius:.65rem;background:rgba(255,255,255,.025)}
.m27-cliente-360-mini span{color:#918c83;font-size:.61rem}
.m27-cliente-360-mini strong{color:#e9dfca;font-size:.79rem}
.m27-cliente-360-actions{display:flex;gap:.5rem;flex-wrap:wrap;padding-top:.1rem}
.m27-cliente-360-actions button{min-height:2.45rem;padding:.48rem .72rem;border:1px solid rgba(216,185,111,.16);border-radius:.72rem;color:#e9dfca;background:rgba(216,185,111,.045);font:inherit;font-size:.75rem;font-weight:700;cursor:pointer}
.m27-cliente-360-actions button:hover{border-color:rgba(216,185,111,.4);background:rgba(216,185,111,.09)}
.m27-cliente-360-note{margin:0;padding:.68rem .75rem;border-left:3px solid rgba(216,185,111,.55);color:#aca69a;background:rgba(216,185,111,.035);font-size:.69rem;line-height:1.45}
@media (max-width:960px){.m27-cliente-360-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.m27-cliente-360-contexto{grid-template-columns:1fr}}
@media (max-width:560px){.m27-cliente-360{padding:.85rem}.m27-cliente-360-header{display:grid}.m27-cliente-360-senal{text-align:left;min-width:0}.m27-cliente-360-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.m27-cliente-360-mini{grid-template-columns:1fr}.m27-cliente-360-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.m27-cliente-360-actions button{width:100%}}
@media (max-width:360px){.m27-cliente-360-grid,.m27-cliente-360-actions{grid-template-columns:1fr}}
`;

function installStyles(document){
  if(!document?.head||document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=CLIENTE_360_CSS;
  document.head.appendChild(style);
}

function createElement(document,tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined&&text!==null)node.textContent=String(text);
  return node;
}

function percent(value){
  return Number.isFinite(value)?`${Math.round(value*100)}%`:'Sin dato';
}

function number(value,suffix=''){
  return Number.isFinite(value)?`${value}${suffix}`:'Sin dato';
}

function dateLabel(value){
  return formatIberfitDate(value,{locale:IBERFIT_UI_LOCALE,includeTime:false})||'Sin fecha';
}

function clientIdFor(viewModel,state){
  return viewModel?.identity?.role==='client'
    ?String(state?.identity?.clientId||'').trim()
    :String(state?.selectedClientId||'').trim();
}

function card(document,label,value,note){
  const item=createElement(document,'article','m27-cliente-360-card');
  item.append(
    createElement(document,'span','',label),
    createElement(document,'strong','',value),
    createElement(document,'small','',note),
  );
  return item;
}

function mini(document,label,value){
  const item=createElement(document,'div');
  item.append(
    createElement(document,'span','',label),
    createElement(document,'strong','',value),
  );
  return item;
}

function action(document,label,area){
  const button=createElement(document,'button','',label);
  button.type='button';
  button.setAttribute('data-m26-area',area);
  return button;
}

function wearableMetric(summary,key,suffix=''){
  return number(Number(summary?.wearable?.metrics?.[key]),suffix);
}

function wellbeingValue(summary,key){
  return number(Number(summary?.checkinAverage?.[key]),'/10');
}

export function enhanceCliente360({root,viewModel,state,now=new Date()}={}){
  const active=
    viewModel?.mode==='authenticated'&&
    viewModel?.activeArea==='progreso'&&
    ['client','coach'].includes(String(viewModel?.identity?.role||''));

  root?.classList?.toggle?.('m26-cliente-360-activo',active);
  if(!active||!root?.querySelector||!state)return false;

  const document=root.ownerDocument;
  installStyles(document);

  const route=root.querySelector('[data-client-bottom-nav-route="progreso"] > .m26-route')
    ||root.querySelector('#m26-main .m26-route');
  if(!route)return false;

  const clientId=clientIdFor(viewModel,state);
  if(!clientId)return false;

  const summary=computeProgressSummary(state,clientId,{now});
  if(!summary)return false;

  const alerts=deriveAdherenceAlerts(state,clientId,{now});
  const signal=adherenceSignal(alerts);
  const client=viewModel.selectedClient||{};
  const clientName=String(client.name||'Cliente IBERFIT').trim();
  const modality=String(client.modality||'Modalidad no informada').trim();
  const status=String(client.status||'Estado por definir').trim();

  const intro=route.querySelector('.m26-route-intro');
  if(intro){
    const eyebrow=intro.querySelector('.m26-eyebrow');
    const title=intro.querySelector('h2');
    const copy=intro.querySelector('p:last-child');
    if(eyebrow)eyebrow.textContent='IBERFIT · Cliente 360';
    if(title)title.textContent=clientName;
    if(copy)copy.textContent=viewModel.identity.role==='client'
      ?'Tu evolución reunida en una sola vista: entrenamiento, recuperación, IRI, actividad y calidad del dato.'
      :'Vista integral del cliente con entrenamiento, recuperación, IRI, actividad y calidad del dato confirmados.';
  }

  const bottomLabel=root.querySelector('.m26-client-bottom-nav-item[data-m26-area="progreso"] .m26-client-bottom-nav-label');
  if(bottomLabel)bottomLabel.textContent='Cliente 360';

  const previous=route.querySelector('[data-m27-cliente-360]');
  previous?.remove?.();

  const section=createElement(document,'section','m27-cliente-360');
  section.setAttribute('data-m27-cliente-360','true');
  section.setAttribute('aria-label','Resumen Cliente 360');

  const header=createElement(document,'header','m27-cliente-360-header');
  const identity=createElement(document,'div','m27-cliente-360-identidad');
  identity.append(
    createElement(document,'span','','Cliente 360'),
    createElement(document,'h3','',clientName),
    createElement(document,'p','',`${modality} · ${status} · ventana de ${summary.days} días`),
  );
  const signalBox=createElement(document,'div','m27-cliente-360-senal');
  signalBox.append(
    createElement(document,'span','','Señal de seguimiento'),
    createElement(document,'strong','',signal?.label||'Seguimiento disponible'),
  );
  header.append(identity,signalBox);

  const grid=createElement(document,'div','m27-cliente-360-grid');
  grid.append(
    card(document,'Adherencia',percent(summary.adherence),`${summary.completedSessions} de ${summary.plannedSessions} sesiones confirmadas`),
    card(document,'Esfuerzo medio',number(summary.averageRpe),'RPE de ejecuciones confirmadas'),
    card(document,'Volumen medio',number(summary.volume),'Carga × repeticiones cuando existe dato comparable'),
    card(document,'Tendencia de volumen',Number.isFinite(summary.volumeDelta)?`${summary.volumeDelta>0?'+':''}${summary.volumeDelta}%`:'Sin comparación','Periodo reciente frente al anterior'),
    card(document,'Evaluación IRI',summary.iriCurrent===null?'Sin evaluación comparable':`${summary.iriCurrent} de 3 dominios`,`${summary.iriAssessmentCount} evaluación${summary.iriAssessmentCount===1?'':'es'} en el historial`),
    card(document,'Bienestar',summary.checkins?`${summary.checkins} registro${summary.checkins===1?'':'s'}`:'Sin registros',summary.latestCheckinAt?`Último: ${dateLabel(summary.latestCheckinAt)}`:'Sin registro confirmado'),
    card(document,'Dispositivos',summary.wearable?.daysWithData?`${summary.wearable.daysWithData} día${summary.wearable.daysWithData===1?'':'s'} con datos`:'Sin datos',summary.wearable?.freshness==='reciente'?'Datos recientes':'No se inventan datos ausentes'),
    card(document,'Calidad del dato',String(summary.dataQuality||'limitada'),summary.unconfirmedExecutions?`${summary.unconfirmedExecutions} sesión${summary.unconfirmedExecutions===1?'':'es'} fuera del cálculo hasta confirmar`:'Solo información confirmada'),
  );

  const context=createElement(document,'div','m27-cliente-360-contexto');
  const wellbeing=createElement(document,'article');
  wellbeing.append(createElement(document,'h4','','Recuperación y bienestar'));
  const wellbeingMini=createElement(document,'div','m27-cliente-360-mini');
  wellbeingMini.append(
    mini(document,'Energía',wellbeingValue(summary,'energy')),
    mini(document,'Sueño',wellbeingValue(summary,'sleep')),
    mini(document,'Estrés',wellbeingValue(summary,'stress')),
    mini(document,'Dolor',wellbeingValue(summary,'pain')),
    mini(document,'Fatiga',wellbeingValue(summary,'fatigue')),
    mini(document,'Motivación',wellbeingValue(summary,'motivation')),
  );
  wellbeing.append(wellbeingMini);

  const devices=createElement(document,'article');
  devices.append(createElement(document,'h4','','Actividad de dispositivos'));
  const deviceMini=createElement(document,'div','m27-cliente-360-mini');
  deviceMini.append(
    mini(document,'Pasos',wearableMetric(summary,'steps')),
    mini(document,'Minutos activos',wearableMetric(summary,'activeMinutes',' min')),
    mini(document,'FC en reposo',wearableMetric(summary,'restingHeartRate',' lpm')),
  );
  devices.append(deviceMini);
  context.append(wellbeing,devices);

  const actions=createElement(document,'div','m27-cliente-360-actions');
  actions.append(
    action(document,'Ver planificación','planificacion'),
    action(document,'Abrir sesiones','sesion'),
    action(document,'Registrar bienestar','actividad'),
    action(document,'Revisar IRI','iri'),
    action(document,'Consultar informes','informes'),
  );

  const note=createElement(
    document,
    'p',
    'm27-cliente-360-note',
    'Cliente 360 no crea una puntuación global ni atribuye causas. Cada área conserva su significado y solo utiliza datos confirmados; el entrenador interpreta el contexto y decide.',
  );

  section.append(header,grid,context,actions,note);
  if(intro?.nextSibling)route.insertBefore(section,intro.nextSibling);
  else route.prepend(section);
  return true;
}
