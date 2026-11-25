import {
  renderLongitudinalDataExperience as renderLongitudinalDataExperienceBase,
} from './longitudinal-ui.js';

const STATUS_META=Object.freeze({
  strong:Object.freeze({label:'Evidencia sólida',kind:'success'}),
  building:Object.freeze({label:'Construyendo',kind:'neutral'}),
  review:Object.freeze({label:'Revisar',kind:'warning'}),
  insufficient:Object.freeze({label:'Datos insuficientes',kind:'neutral'}),
});

const CLIENT_DECISION_PORTAL_TAG='m26-progress-decision-portal';
const CLIENT_DECISION_MOUNTED='progressDecisionMounted';

function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function roleKey(role){
  const value=String(role||'client').trim().toLowerCase();
  return ['coach','admin'].includes(value)?value:'client';
}

function statusMeta(status){
  return STATUS_META[String(status||'insufficient').toLowerCase()]
    ||STATUS_META.insufficient;
}

const NUMBER_FORMAT=new Intl.NumberFormat('es-CL',{maximumFractionDigits:2});
function measuredPillarValue(pillar){
  const value=pillar?.value;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)return null;
  if(pillar.id==='consistency'&&value>100)return null;
  return value;
}
function pillarValue(pillar){
  const value=measuredPillarValue(pillar);
  return value===null?'—':NUMBER_FORMAT.format(value);
}
function meaningfulPillar(pillar){
  return ['strong','building','review'].includes(pillar?.status)&&measuredPillarValue(pillar)!==null;
}
const CLIENT_MEANING=Object.freeze({
  consistency:'Citas cumplidas respecto de las programadas; no incluye todos tus entrenamientos autónomos.',
  strength:'Solo ejercicios con registros comparables. No es una valoración general de tu fuerza.',
  volume:'La cantidad de trabajo no equivale por sí sola a una mejora del rendimiento.',
  wellbeing:'Frecuencia de registros, no una puntuación de tu bienestar.',
  activity:'Información complementaria del dispositivo, no entrenamientos IBERFIT confirmados.',
});

function clientHasMeaningfulEvidence(hub){
  const pillars=Array.isArray(hub?.pillars)?hub.pillars:[];
  return pillars.some(meaningfulPillar)
    ||hub?.diagnosticBaseline?.available===true;
}

function prioritizedPillars(hub,role){
  const pillars=Array.isArray(hub?.pillars)?hub.pillars:[];
  if(role==='client'){
    return pillars.filter(meaningfulPillar);
  }

  const rank=Object.freeze({review:0,building:1,strong:2,insufficient:3});
  return [...pillars]
    .sort((a,b)=>(rank[a?.status]??4)-(rank[b?.status]??4))
    .slice(0,4);
}

function renderPillar(pillar,{professional=false}={}){
  const available=meaningfulPillar(pillar);
  const meta=statusMeta(available?pillar.status:'insufficient');
  const context=professional?pillar?.context:CLIENT_MEANING[pillar?.id];
  const reading=available?pillarValue(pillar):'—';
  const unit=available&&pillar?.unit?pillar.unit:'';
  return `<article class="m26-list-card m26-progress-signal" data-progress-pillar="${escapeHtml(pillar?.id||'unknown')}" data-progress-signal-status="${escapeHtml(available?pillar.status:'insufficient')}"><div class="m26-progress-signal-main"><p class="m26-eyebrow">${escapeHtml(pillar?.label||'Señal')}</p><h3 class="m26-progress-reading">${escapeHtml(reading)}${unit?`<span>${escapeHtml(unit)}</span>`:''}</h3><p>${escapeHtml(available?pillar.evidence||'Registro confirmado.':pillar?.status==='insufficient'?pillar.evidence||'Sin evidencia confirmada suficiente.':'Medición no disponible.')}</p>${context?`<small class="m26-progress-context">${escapeHtml(context)}</small>`:''}</div><div class="m26-appointment-state"><span class="m26-badge is-${escapeHtml(meta.kind)}">${escapeHtml(meta.label)}</span></div></article>`;
}

function renderDiagnosticBaseline(hub){
  const baseline=hub?.diagnosticBaseline;
  if(!baseline)return '';
  const detail=[baseline.evidence,baseline.context]
    .filter(Boolean)
    .join(' · ');
  return `<aside class="m26-panel m26-panel-soft" data-progress-baseline="iri"><p class="m26-eyebrow">Diagnóstico IRI · punto de partida</p><h3>${escapeHtml(baseline.available?'Diagnóstico inicial disponible':'Diagnóstico inicial pendiente')}</h3><p>${escapeHtml(detail||'El IRI se conserva como diagnóstico inicial.')}</p><p class="m26-data-next-step"><small>El Diagnóstico IRI no se mezcla con las señales de evolución cotidiana.</small></p></aside>`;
}

function reviewPriority(hub){
  const actionable=Array.isArray(hub?.actionable)?hub.actionable:[];
  if(!actionable.length)return '';
  const labels=new Map(
    (Array.isArray(hub?.pillars)?hub.pillars:[])
      .filter(meaningfulPillar)
      .filter(pillar=>pillar.status==='review')
      .map((pillar)=>[pillar?.id,pillar?.label])
  );
  const copy=actionable
    .map((id)=>labels.get(id))
    .filter(Boolean)
    .join(' · ');
  return copy
    ?`<p class="m26-data-next-step"><strong>Prioridad de revisión:</strong> ${escapeHtml(copy)}. El dato orienta la revisión; no modifica la planificación automáticamente.</p>`
    :'';
}

export function renderProgressDecisionLayer(hub,{role='client'}={}){
  const normalizedRole=roleKey(role);
  const professional=normalizedRole!=='client';
  const title=professional?'Evidencia de progreso':'¿Estoy progresando?';

  if(!hub){
    if(!professional)return '';
    return `<section class="m26-card" data-progress-decision-layer="true" aria-label="${escapeHtml(title)}"><div class="m26-card-header"><p class="m26-eyebrow">Progreso con criterio</p><h2>${escapeHtml(title)}</h2><p>IBERFIT todavía no tiene evidencia confirmada suficiente para resumir la evolución. El detalle longitudinal permanece disponible mientras se construye historial comparable.</p></div></section>`;
  }

  if(!professional&&!clientHasMeaningfulEvidence(hub))return '';

  const pillars=prioritizedPillars(hub,normalizedRole);
  const intro=professional
    ?`${hub.headline||'Evidencia reciente disponible'}. Señales ordenadas para decidir qué revisar primero.`
    :hub.headline||'Tu seguimiento se construye con datos confirmados.';
  const primary=professional?pillars:pillars.slice(0,3);
  const additional=professional?[]:pillars.slice(3);
  const cards=primary.length
    ?`<div class="m26-list m26-progress-signal-list">${primary.map((pillar)=>renderPillar(pillar,{professional})).join('')}</div>${additional.length?`<details class="m26-progress-additional"><summary>Ver ${additional.length} ${additional.length===1?'área adicional':'áreas adicionales'} con registros</summary><div class="m26-list m26-progress-signal-list">${additional.map((pillar)=>renderPillar(pillar,{professional})).join('')}</div></details>`:''}`
    :'<p class="m26-empty-copy">Aún no hay señales comparables suficientes.</p>';

  return `<section class="m26-card m26-progress-decision-signature" data-progress-decision-layer="true" data-progress-decision-role="${escapeHtml(normalizedRole)}" aria-label="${escapeHtml(title)}"><div class="m26-card-header"><p class="m26-eyebrow">Progreso con criterio</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(intro)}</p></div>${cards}${professional?reviewPriority(hub):''}${renderDiagnosticBaseline(hub)}</section>`;
}

export function mountClientProgressDecisionLayer(node){
  if(!node||node?.dataset?.[CLIENT_DECISION_MOUNTED]==='true')return false;
  const details=node.closest?.('details.m26-client-progress-detail');
  const children=Array.from(node.childNodes||[]);
  if(!details||typeof details.before!=='function'||!children.length)return false;
  if(node.dataset)node.dataset[CLIENT_DECISION_MOUNTED]='true';
  details.before(...children);
  node.remove?.();
  return true;
}

function registerClientDecisionPortal(){
  const registry=globalThis.customElements;
  const ElementBase=globalThis.HTMLElement;
  if(
    !registry||
    typeof registry.define!=='function'||
    typeof ElementBase!=='function'||
    registry.get?.(CLIENT_DECISION_PORTAL_TAG)
  )return;

  registry.define(
    CLIENT_DECISION_PORTAL_TAG,
    class extends ElementBase{
      connectedCallback(){
        queueMicrotask(()=>mountClientProgressDecisionLayer(this));
      }
    },
  );
}

registerClientDecisionPortal();

export function renderLongitudinalDataExperience(
  aggregate,
  options={}
){
  const base=renderLongitudinalDataExperienceBase(aggregate,options);
  const normalizedRole=roleKey(options?.role);
  const decision=renderProgressDecisionLayer(
    aggregate?.progressHub,
    {role:normalizedRole}
  );

  if(normalizedRole==='client'){
    return decision
      ?`<${CLIENT_DECISION_PORTAL_TAG} data-progress-decision-portal="true">${decision}</${CLIENT_DECISION_PORTAL_TAG}>${base}`
      :base;
  }

  return `${decision}${base}`;
}
