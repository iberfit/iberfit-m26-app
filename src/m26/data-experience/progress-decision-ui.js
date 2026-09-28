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

function pillarValue(pillar){
  if(pillar?.value===null||pillar?.value===undefined||pillar?.value===''){
    return '—';
  }
  return `${pillar.value}${pillar.unit?` ${pillar.unit}`:''}`;
}

function clientHasMeaningfulEvidence(hub){
  const pillars=Array.isArray(hub?.pillars)?hub.pillars:[];
  return pillars.some((pillar)=>pillar?.status&&pillar.status!=='insufficient')
    ||hub?.diagnosticBaseline?.available===true;
}

function prioritizedPillars(hub,role){
  const pillars=Array.isArray(hub?.pillars)?hub.pillars:[];
  if(role==='client'){
    return pillars
      .filter((pillar)=>pillar?.status!=='insufficient')
      .slice(0,3);
  }

  const rank=Object.freeze({review:0,building:1,strong:2,insufficient:3});
  return [...pillars]
    .sort((a,b)=>(rank[a?.status]??4)-(rank[b?.status]??4))
    .slice(0,4);
}

function renderPillar(pillar,{professional=false}={}){
  const meta=statusMeta(pillar?.status);
  const context=professional&&pillar?.context
    ?`<small>${escapeHtml(pillar.context)}</small>`
    :'';
  return `<article class="m26-list-card" data-progress-pillar="${escapeHtml(pillar?.id||'unknown')}"><div><p class="m26-eyebrow">${escapeHtml(pillar?.label||'Señal')}</p><h3>${escapeHtml(pillarValue(pillar))}</h3><p>${escapeHtml(pillar?.evidence||'Sin evidencia confirmada suficiente.')}</p>${context}</div><div class="m26-appointment-state"><span class="m26-badge is-${escapeHtml(meta.kind)}">${escapeHtml(meta.label)}</span></div></article>`;
}

function renderDiagnosticBaseline(hub){
  const baseline=hub?.diagnosticBaseline;
  if(!baseline)return '';
  const detail=[baseline.evidence,baseline.context]
    .filter(Boolean)
    .join(' · ');
  return `<aside class="m26-panel m26-panel-soft" data-progress-baseline="iri"><p class="m26-eyebrow">Diagnóstico IRI · punto de partida</p><h3>${escapeHtml(baseline.available?'Baseline disponible':'Baseline pendiente')}</h3><p>${escapeHtml(detail||'El IRI se conserva como diagnóstico inicial.')}</p><p class="m26-data-next-step"><small>El Diagnóstico IRI no se mezcla con las señales de evolución cotidiana.</small></p></aside>`;
}

function reviewPriority(hub){
  const actionable=Array.isArray(hub?.actionable)?hub.actionable:[];
  if(!actionable.length)return '';
  const labels=new Map(
    (Array.isArray(hub?.pillars)?hub.pillars:[])
      .map((pillar)=>[pillar?.id,pillar?.label])
  );
  const copy=actionable
    .map((id)=>labels.get(id)||id)
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
  const cards=pillars.length
    ?`<div class="m26-list">${pillars.map((pillar)=>renderPillar(pillar,{professional})).join('')}</div>`
    :'<p class="m26-empty-copy">Aún no hay señales comparables suficientes.</p>';

  return `<section class="m26-card" data-progress-decision-layer="true" aria-label="${escapeHtml(title)}"><div class="m26-card-header"><p class="m26-eyebrow">Progreso con criterio</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(intro)}</p></div>${cards}${professional?reviewPriority(hub):''}${renderDiagnosticBaseline(hub)}</section>`;
}

export function mountClientProgressDecisionLayer(node){
  if(!node||node?.dataset?.[CLIENT_DECISION_MOUNTED]==='true')return false;
  const details=node.closest?.('details.m26-client-progress-detail');
  if(!details||typeof details.before!=='function')return false;
  if(node.dataset)node.dataset[CLIENT_DECISION_MOUNTED]='true';
  details.before(node);
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
        mountClientProgressDecisionLayer(this);
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
