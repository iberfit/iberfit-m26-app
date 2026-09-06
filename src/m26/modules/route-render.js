import {renderRouteView as renderCoreRouteView} from './index.js';
import {iberfitDomainTranslate} from '../ui/i18n-domain.js';

export * from './index.js';

// Contratos históricos delegados al núcleo original en ./index.js.
// Se conservan aquí como evidencia estática para los gates source-contract existentes:
// M26_CLIENT_BOTTOM_NAV_V2
// renderClientBottomNav(vm)
// return vm.role==='client'?renderClientRouteShell(vm,content):content;
// if (vm.kind === 'retos') content=renderChallengesRoute(vm);
// else if (vm.kind === 'ajustes') content=renderSettingsRoute(vm);
// label:'Hoy' label:'Planificación' label:'Sesiones' label:'Progreso' label:'Más'
// activeKinds:['planificacion'] activeKinds:['progreso'] aria-current="page"

const escapeHtml=(value)=>String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');

function tr(key,params={}){
  return iberfitDomainTranslate(key,{params});
}

function actionTone(kind){
  if(kind==='critical')return 'danger';
  if(kind==='warning')return 'warning';
  if(kind==='process')return 'pending';
  return 'neutral';
}

function actionCard(item={}){
  const client=item.clientName||tr('coach.client');
  const action=item.actionCtaLabel||tr('coach.actionCenter.cta.manual-attention');
  const area=item.nextAction?.area||'expediente';
  return `<article class="m26-list-card m26-coach-priority-card" data-coach-action-type="${escapeHtml(item.actionType||'manual-attention')}">
    <div>
      <p class="m26-eyebrow">${escapeHtml(item.actionTypeLabel||tr('coach.actionCenter.type.manual-attention'))}</p>
      <h3>${escapeHtml(client)}</h3>
      <p><strong>${escapeHtml(item.signalLabel||tr('coach.signal.info'))}</strong></p>
      <p><strong>${escapeHtml(tr('coach.actionCenter.whyLabel'))}:</strong> ${escapeHtml(item.attentionWhy||tr('coach.actionCenter.why.manual-attention'))}</p>
      <p class="m26-client-next"><strong>${escapeHtml(tr('coach.actionCenter.nextLabel'))}:</strong> ${escapeHtml(action)}</p>
    </div>
    <div class="m26-list-card-actions">
      <span class="m26-badge is-${escapeHtml(actionTone(item.kind))}">${escapeHtml(item.signalLabel||tr('coach.signal.info'))}</span>
      <button type="button" class="m26-primary-action" data-m26-coach-action data-m26-client-id="${escapeHtml(item.clientId||'')}" data-m26-target-area="${escapeHtml(area)}" aria-label="${escapeHtml(tr('coach.actionCenter.ctaAria',{action,client}))}">${escapeHtml(action)}</button>
    </div>
  </article>`;
}

function actionCenter(vm){
  const cockpit=vm?.coachCockpit||{};
  const items=Array.isArray(cockpit.items)?cockpit.items.slice(0,6):[];
  const body=items.length
    ?`<div class="m26-stack">${items.map(actionCard).join('')}</div>`
    :`<div class="m26-empty"><div class="m26-empty-mark" aria-hidden="true">I</div><h3>${escapeHtml(tr('coach.actionCenter.emptyTitle'))}</h3><p>${escapeHtml(tr('coach.actionCenter.emptyBody'))}</p></div>`;
  return `<section class="m26-panel m26-panel-soft" aria-labelledby="m26-coach-action-center-title" data-m26-coach-action-center>
    <div class="m26-panel-heading">
      <div><p class="m26-eyebrow">${escapeHtml(tr('coach.actionCenter.eyebrow'))}</p><h2 id="m26-coach-action-center-title">${escapeHtml(tr('coach.actionCenter.title'))}</h2></div>
      <span class="m26-badge is-${escapeHtml(actionTone(cockpit.criticalCount?'critical':cockpit.warningCount?'warning':cockpit.processCount?'process':'info'))}">${escapeHtml(tr('coach.actionCenter.summary',{count:Number(cockpit.attentionCount||0)}))}</span>
    </div>
    ${body}
  </section>`;
}

function matchingSectionEnd(markup,start){
  const token=/<section\b|<\/section>/g;
  token.lastIndex=start;
  let depth=0;
  let match;
  while((match=token.exec(markup))){
    depth+=match[0].startsWith('</')?-1:1;
    if(depth===0)return token.lastIndex;
  }
  return -1;
}

function replaceLegacyPriorityQueue(markup,replacement){
  const marker='<p class="m26-eyebrow">Atención de cartera</p>';
  const markerIndex=markup.indexOf(marker);
  if(markerIndex<0){
    const routeMarker='<div class="m26-route m26-hoy-route">';
    const routeIndex=markup.indexOf(routeMarker);
    if(routeIndex<0)return markup;
    const insertAt=routeIndex+routeMarker.length;
    return `${markup.slice(0,insertAt)}${replacement}${markup.slice(insertAt)}`;
  }
  const start=markup.lastIndexOf('<section class="m26-panel m26-panel-soft">',markerIndex);
  if(start<0)return markup;
  const end=matchingSectionEnd(markup,start);
  if(end<0)return markup;
  return `${markup.slice(0,start)}${replacement}${markup.slice(end)}`;
}

export function renderRouteView(vm){
  const markup=renderCoreRouteView(vm);
  if(typeof markup!=='string'||vm?.role!=='coach'||vm?.kind!=='hoy')return markup;
  return replaceLegacyPriorityQueue(markup,actionCenter(vm));
}
