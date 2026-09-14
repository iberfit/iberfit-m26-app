import {iberfitSurfaceTranslate} from '../ui/i18n-surface.js';

export const CLIENT_CONTEXTUAL_GUIDE_SCHEMA_VERSION='iberfit.client-contextual-guide.v1';

const SOURCE_COPY=Object.freeze({
  eyebrow:'Guía IBERFIT',
  close:'Cerrar y seguir usando la app',
  later:'Ahora no',
  understood:'Entendido',
  view:'Ver',
  help:'Ayuda',
  settingsTitle:'Guía dinámica',
  settingsBody:'La guía te acompaña dentro de cada área cuando puede ayudarte. No hay un recorrido que completar ni bloquea la aplicación.',
  reopen:'Explicar esta pantalla',
  launcherLabel:'Abrir guía contextual de esta pantalla',
  launcher:'Guía',
  'client-context-today.title':'Este es tu día en IBERFIT',
  'client-context-today.body':'Aquí verás lo importante sin tener que buscarlo. IBERFIT prioriza lo que tiene sentido ahora: entrenar, registrar cómo estás o continuar con el siguiente paso.',
  'client-context-plan.title':'Tu planificación ya tiene contexto',
  'client-context-plan.body':'Aquí encontrarás lo que tu Coach ha preparado para ti y cómo encajan tus sesiones dentro del proceso.',
  'client-context-session.title':'Este es el espacio para entrenar',
  'client-context-session.body':'En Sesiones encontrarás los entrenamientos que tu Coach haya dejado disponibles. Durante la ejecución podrás seguir ejercicios, series, carga, descansos e indicaciones.',
  'client-context-progress.title':'Tu progreso necesita contexto',
  'client-context-progress.body':'Aquí se combinan adherencia, evolución y resultados confirmados. IBERFIT evita convertir la falta de datos en un cero o en una conclusión automática.',
  'client-context-activity.title':'Tus registros completan la historia',
  'client-context-activity.body':'Bienestar, hábitos y datos de dispositivos aportan contexto entre sesiones. Solo se usan las fuentes que hayas autorizado y los datos realmente disponibles.',
  'client-context-messages.title':'El seguimiento no termina al salir del entrenamiento',
  'client-context-messages.body':'Mensajes mantiene el contexto con tu Coach entre sesiones. Úsalo para dudas, seguimiento y cambios que necesiten conversación.',
  'client-context-challenges.title':'Tu reto ya forma parte del proceso',
  'client-context-challenges.body':'Los retos convierten constancia, hábitos y objetivos confirmados en progreso visible. La parte social es privada por defecto y nunca publica datos de salud automáticamente.',
  'client-context-settings.title':'Tú decides cómo quieres vivir la app',
  'client-context-settings.body':'En Ajustes controlas idioma, avisos, privacidad y permisos de experiencia. También puedes volver a abrir esta explicación cuando la necesites.',
});

const TIPS=Object.freeze([
  Object.freeze({
    id:'client-context-today',
    copyId:'client-context-today',
    area:'hoy',
    selectors:Object.freeze(['[data-m26-client-guide="today"]']),
  }),
  Object.freeze({
    id:'client-context-plan-ready',
    copyId:'client-context-plan',
    area:'hoy',
    actionArea:'planificacion',
    selectors:Object.freeze(['[data-m26-client-guide="plan-entry"]']),
  }),
  Object.freeze({
    id:'client-context-challenge-ready',
    copyId:'client-context-challenges',
    area:'hoy',
    actionArea:'retos',
    selectors:Object.freeze(['[data-m26-client-guide="challenge-entry"]']),
  }),
  Object.freeze({
    id:'client-context-plan',
    copyId:'client-context-plan',
    area:'planificacion',
    selectors:Object.freeze(['[data-m26-client-guide="plan-surface"]']),
  }),
  Object.freeze({
    id:'client-context-session',
    copyId:'client-context-session',
    area:'sesion',
    selectors:Object.freeze(['[data-m26-client-guide="session-surface"]']),
  }),
  Object.freeze({
    id:'client-context-progress',
    copyId:'client-context-progress',
    area:'progreso',
    selectors:Object.freeze(['[data-m26-client-guide="progress-surface"]']),
  }),
  Object.freeze({
    id:'client-context-activity',
    copyId:'client-context-activity',
    area:'actividad',
    selectors:Object.freeze([
      '[data-client-bottom-nav-route="actividad"] .m26-route-intro',
      '[data-client-bottom-nav-route="actividad"]',
    ]),
  }),
  Object.freeze({
    id:'client-context-messages',
    copyId:'client-context-messages',
    area:'mensajes',
    selectors:Object.freeze([
      '[data-client-bottom-nav-route="mensajes"] .m26-route-intro',
      '[data-client-bottom-nav-route="mensajes"]',
    ]),
  }),
  Object.freeze({
    id:'client-context-challenges',
    copyId:'client-context-challenges',
    area:'retos',
    selectors:Object.freeze(['[data-m26-client-guide="challenge-surface"]']),
  }),
  Object.freeze({
    id:'client-context-settings',
    copyId:'client-context-settings',
    area:'ajustes',
    selectors:Object.freeze([
      '[data-client-bottom-nav-route="ajustes"] .m26-route-intro',
      '[data-client-bottom-nav-route="ajustes"]',
    ]),
  }),
]);

const LEGACY_PROGRESSIVE_MAP=Object.freeze({
  'client-today':Object.freeze(['client-context-today']),
  'client-plan':Object.freeze(['client-context-plan-ready','client-context-plan']),
  'client-session':Object.freeze(['client-context-session']),
  'client-progress':Object.freeze(['client-context-progress']),
  'client-activity':Object.freeze(['client-context-activity']),
});
const LEGACY_GUIDED_ALL=Object.freeze([
  'client-context-today',
  'client-context-plan-ready',
  'client-context-plan',
  'client-context-session',
  'client-context-progress',
  'client-context-activity',
  'client-context-messages',
  'client-context-settings',
]);

const STYLE=`
.m26-client-context-guide{
  position:fixed;
  z-index:1210;
  width:min(25rem,calc(100vw - 2rem));
  padding:1rem 1.05rem;
  border:1px solid color-mix(in srgb,var(--iberfit-color-accent,#d8b96f) 38%,transparent);
  border-radius:1.15rem;
  background:color-mix(in srgb,var(--iberfit-color-surface-overlay,#10281e) 96%,black);
  box-shadow:0 24px 70px rgba(0,0,0,.36);
}
.m26-client-context-guide-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.8rem}
.m26-client-context-guide h2{margin:.15rem 0 0;font-size:1.15rem;line-height:1.2}
.m26-client-context-guide-copy{margin:.75rem 0 0;line-height:1.55}
.m26-client-context-guide-actions{display:flex;justify-content:flex-end;gap:.55rem;margin-top:.9rem;flex-wrap:wrap}
.m26-client-context-guide-actions button,.m26-client-context-guide-head button{min-height:44px;min-width:44px}
.m26-client-context-guide-target{
  position:relative;
  outline:2px solid color-mix(in srgb,var(--iberfit-color-accent,#d8b96f) 72%,transparent);
  outline-offset:4px;
  border-radius:max(.5rem,var(--iberfit-radius-md,.75rem));
  scroll-margin:7rem 1rem;
}
.m26-client-context-guide-settings{margin-top:1rem}
@media(max-width:690px){
  .m26-client-context-guide{
    left:.75rem!important;
    right:.75rem!important;
    top:auto!important;
    bottom:calc(5.25rem + env(safe-area-inset-bottom))!important;
    width:auto;
    max-height:min(48vh,26rem);
    overflow:auto;
  }
}
@media(prefers-reduced-motion:reduce){
  .m26-client-context-guide,.m26-client-context-guide-target{scroll-behavior:auto;transition:none!important;animation:none!important}
}
@media print{.m26-client-context-guide,.m26-client-context-guide-settings{display:none!important}}
`;

function txt(value,max=240){return String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);}
function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function h(value){let hash=0x811c9dc5;for(const char of String(value||'')){hash^=char.charCodeAt(0);hash=Math.imul(hash,0x01000193);}return (hash>>>0).toString(16).padStart(8,'0');}
function tr(key,fallback){const source=SOURCE_COPY[key]||fallback||key;return iberfitSurfaceTranslate(source);}
function storageOf(storage,scope){if(storage!==undefined)return storage;try{return scope?.localStorage??null;}catch{return null;}}
function reduced(scope){try{return Boolean(scope?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);}catch{return false;}}
function readJson(storage,key){try{const raw=storage?.getItem?.(key);return raw?JSON.parse(raw):null;}catch{return null;}}

export function clientContextualGuideTipsForArea(area){
  const current=txt(area,80);
  return Object.freeze(TIPS.filter((tip)=>tip.area===current));
}
export function clientContextualGuideTipForArea(area){return clientContextualGuideTipsForArea(area)[0]||null;}
export function clientContextualGuideScopeKey({userId,role}={}){
  const id=txt(userId,240);
  return txt(role,40).toLowerCase()==='client'&&id
    ?`iberfit.m26.client-context-guide.v1:${h(`${id}|client`)}`
    :null;
}
export function normalizeClientContextualGuideState(value={}){
  const allowed=new Set(TIPS.map((tip)=>tip.id));
  const unique=(items)=>Array.from(new Set(
    (Array.isArray(items)?items:[])
      .map((item)=>txt(item,80))
      .filter((item)=>allowed.has(item))
  ));
  return Object.freeze({
    schemaVersion:CLIENT_CONTEXTUAL_GUIDE_SCHEMA_VERSION,
    seenTipIds:Object.freeze(unique(value?.seenTipIds)),
    dismissedTipIds:Object.freeze(unique(value?.dismissedTipIds)),
  });
}

export function legacyClientContextualGuideSeed({storage,userId}={}){
  const id=txt(userId,240);
  if(!id)return normalizeClientContextualGuideState({});
  const identityHash=h(`${id}|client`);
  const progressive=readJson(storage,`iberfit.m26.progressive-onboarding.v1:client:${identityHash}`)||{};
  const guided=readJson(storage,`iberfit.m26.guided-onboarding.v1:client:${identityHash}`)||{};
  const seen=[];
  for(const legacyId of Array.isArray(progressive.visited)?progressive.visited:[]){
    for(const tipId of LEGACY_PROGRESSIVE_MAP[txt(legacyId,80)]||[])seen.push(tipId);
  }
  const guidedCompleted=Number(guided.onboardingCompletedVersion||0)>=1||guided.status==='completed';
  const guidedSkipped=Number(guided.onboardingSkippedVersion||0)>=1||guided.status==='skipped';
  if(guidedCompleted)seen.push(...LEGACY_GUIDED_ALL);
  const dismissed=guidedSkipped?[...TIPS.map((tip)=>tip.id)]:[];
  return normalizeClientContextualGuideState({seenTipIds:seen,dismissedTipIds:dismissed});
}

export function createClientContextualGuideRepository({storage,scope=globalThis}={}){
  const s=storageOf(storage,scope);
  const memory=new Map();
  return Object.freeze({
    read(key){
      let raw=null;
      try{raw=s?.getItem?.(key);raw=raw?JSON.parse(raw):null;}catch{}
      return normalizeClientContextualGuideState(raw||memory.get(key)||{});
    },
    write(key,value){
      if(!key)return false;
      const safe=normalizeClientContextualGuideState(value);
      memory.set(key,safe);
      try{s?.setItem?.(key,JSON.stringify(safe));}catch{}
      return true;
    },
  });
}

function area(root){
  return txt(
    root?.querySelector?.('[data-client-bottom-nav-route]')?.getAttribute?.('data-client-bottom-nav-route')||
    root?.querySelector?.('[data-m26-area][aria-current="page"]')?.getAttribute?.('data-m26-area'),
    80
  );
}
function target(root,tip){
  for(const selector of tip?.selectors||[]){
    const node=root?.querySelector?.(selector);
    if(node)return node;
  }
  return null;
}
function ensureStyle(doc){
  let node=doc?.querySelector?.('[data-m26-client-context-guide-style]');
  if(node||!doc?.createElement)return node;
  node=doc.createElement('style');
  node.setAttribute('data-m26-client-context-guide-style','');
  node.textContent=STYLE;
  doc.head?.append?.(node);
  return node;
}
function dialogHtml(tip){
  const copyId=tip.copyId||tip.id;
  const action=tip.actionArea
    ?`<button type="button" class="m26-primary-action" data-m26-client-context-guide-action="${esc(tip.actionArea)}">${esc(tr('view','Ver'))}</button>`
    :`<button type="button" class="m26-primary-action" data-m26-client-context-guide-ack>${esc(tr('understood','Entendido'))}</button>`;
  return `<aside class="m26-client-context-guide" data-m26-client-context-guide role="dialog" aria-modal="false" aria-labelledby="m26-client-context-guide-title" aria-describedby="m26-client-context-guide-copy"><div class="m26-client-context-guide-head"><div><p class="m26-eyebrow">${esc(tr('eyebrow','Guía IBERFIT'))}</p><h2 id="m26-client-context-guide-title">${esc(tr(`${copyId}.title`,tip.area))}</h2></div><button type="button" class="m26-icon-button" data-m26-client-context-guide-later aria-label="${esc(tr('close','Cerrar'))}">×</button></div><p class="m26-client-context-guide-copy" id="m26-client-context-guide-copy">${esc(tr(`${copyId}.body`,''))}</p><div class="m26-client-context-guide-actions"><button type="button" class="m26-text-action" data-m26-client-context-guide-later>${esc(tr('later','Ahora no'))}</button>${action}</div></aside>`;
}
function settingsHtml(){
  return `<section class="iberfit-card m26-client-context-guide-settings" data-m26-client-context-guide-settings><p class="m26-eyebrow">${esc(tr('help','Ayuda'))}</p><h2>${esc(tr('settingsTitle','Guía dinámica'))}</h2><p>${esc(tr('settingsBody','La guía te acompaña dentro de cada área cuando puede ayudarte.'))}</p><button type="button" class="m26-text-action" data-m26-client-context-guide-open>${esc(tr('reopen','Explicar esta pantalla'))}</button></section>`;
}
function isVisibleInViewport(node,scope){
  try{
    const rect=node?.getBoundingClientRect?.();
    const height=Number(scope?.innerHeight||0);
    const width=Number(scope?.innerWidth||0);
    if(!rect||!height||!width)return true;
    return rect.top>=0&&rect.left>=0&&rect.bottom<=height&&rect.right<=width;
  }catch{return true;}
}
function positionDialog(dialog,node,scope){
  if(!dialog||!node)return;
  const width=Number(scope?.innerWidth||0);
  if(!width||width<=690){
    dialog.style?.removeProperty?.('top');
    dialog.style?.removeProperty?.('left');
    dialog.style?.removeProperty?.('right');
    dialog.style?.removeProperty?.('bottom');
    return;
  }
  try{
    const rect=node.getBoundingClientRect?.();
    const box=dialog.getBoundingClientRect?.();
    const margin=16;
    const gap=12;
    const dialogWidth=Number(box?.width||400);
    const dialogHeight=Number(box?.height||220);
    const viewportHeight=Number(scope?.innerHeight||800);
    let left=Math.min(width-dialogWidth-margin,Math.max(margin,Number(rect?.right||margin)-dialogWidth));
    let top=Number(rect?.bottom||margin)+gap;
    if(top+dialogHeight>viewportHeight-margin)top=Math.max(margin,Number(rect?.top||margin)-dialogHeight-gap);
    dialog.style.left=`${Math.round(left)}px`;
    dialog.style.top=`${Math.round(top)}px`;
    dialog.style.right='auto';
    dialog.style.bottom='auto';
  }catch{}
}

export function createClientContextualGuideController({
  root,
  identityProvider=()=>({}),
  storage,
  scope=globalThis,
}={}){
  if(!root?.addEventListener)throw new Error('M26_CLIENT_CONTEXT_GUIDE_ROOT_REQUIRED');
  const resolvedStorage=storageOf(storage,scope);
  const repo=createClientContextualGuideRepository({storage:resolvedStorage,scope});
  const doc=root.ownerDocument||scope?.document||globalThis.document;
  let mounted=false;
  let scheduled=false;
  let activeTip=null;
  let activeTarget=null;
  let dialog=null;
  let lastKey=null;
  let previousFocus=null;
  let positionFrame=null;

  function context(){
    const value=identityProvider?.()||{};
    const userId=txt(value.userId,240);
    const key=clientContextualGuideScopeKey({userId,role:value.role});
    return key?{key,userId}:null;
  }
  function stateWithLegacy(ctx){
    const current=repo.read(ctx.key);
    const legacy=legacyClientContextualGuideSeed({storage:resolvedStorage,userId:ctx.userId});
    const merged=normalizeClientContextualGuideState({
      seenTipIds:[...current.seenTipIds,...legacy.seenTipIds],
      dismissedTipIds:[...current.dismissedTipIds,...legacy.dismissedTipIds],
    });
    if(
      merged.seenTipIds.length!==current.seenTipIds.length||
      merged.dismissedTipIds.length!==current.dismissedTipIds.length
    )repo.write(ctx.key,merged);
    return merged;
  }
  function persist(ctx,patch){
    const current=stateWithLegacy(ctx);
    repo.write(ctx.key,{
      seenTipIds:patch.seenTipIds||current.seenTipIds,
      dismissedTipIds:patch.dismissedTipIds||current.dismissedTipIds,
    });
  }
  function close({restoreFocus=true}={}){
    activeTarget?.classList?.remove?.('m26-client-context-guide-target');
    activeTarget?.removeAttribute?.('data-m26-client-context-guide-target-active');
    activeTarget=null;
    dialog?.remove?.();
    dialog=null;
    activeTip=null;
    if(positionFrame!==null){
      try{scope?.cancelAnimationFrame?.(positionFrame);}catch{}
      positionFrame=null;
    }
    const focus=previousFocus;
    previousFocus=null;
    if(restoreFocus&&focus?.isConnected!==false){
      try{focus?.focus?.({preventScroll:true});}catch{}
    }
  }
  function markSeen(ctx,tip){
    const state=stateWithLegacy(ctx);
    persist(ctx,{seenTipIds:[...state.seenTipIds,tip.id]});
  }
  function markDismissed(ctx,tip){
    const state=stateWithLegacy(ctx);
    persist(ctx,{dismissedTipIds:[...state.dismissedTipIds,tip.id]});
  }
  function eligibleTip(ctx,current,{force=false}={}){
    const state=stateWithLegacy(ctx);
    for(const tip of clientContextualGuideTipsForArea(current)){
      if(!target(root,tip))continue;
      if(force)return tip;
      if(state.seenTipIds.includes(tip.id)||state.dismissedTipIds.includes(tip.id))continue;
      return tip;
    }
    return null;
  }
  function schedulePosition(){
    if(positionFrame!==null||!dialog||!activeTarget)return;
    const run=()=>{
      positionFrame=null;
      if(dialog&&activeTarget)positionDialog(dialog,activeTarget,scope);
    };
    if(typeof scope?.requestAnimationFrame==='function')positionFrame=scope.requestAnimationFrame(run);
    else queueMicrotask(run);
  }
  function show(ctx,tip,{force=false}={}){
    const node=target(root,tip);
    if(!ctx||!tip||!node)return false;
    const state=stateWithLegacy(ctx);
    if(!force&&(state.seenTipIds.includes(tip.id)||state.dismissedTipIds.includes(tip.id)))return false;
    ensureStyle(doc);
    close({restoreFocus:false});
    activeTip=tip;
    activeTarget=node;
    previousFocus=force?doc?.activeElement||null:null;
    node.classList?.add?.('m26-client-context-guide-target');
    node.setAttribute?.('data-m26-client-context-guide-target-active','true');
    if(!isVisibleInViewport(node,scope)){
      try{node.scrollIntoView?.({block:'center',inline:'nearest',behavior:reduced(scope)?'auto':'smooth'});}catch{}
    }
    doc?.body?.insertAdjacentHTML?.('beforeend',dialogHtml(tip));
    dialog=doc?.querySelector?.('[data-m26-client-context-guide]')||null;
    schedulePosition();
    if(force){
      queueMicrotask(()=>{
        try{dialog?.querySelector?.('[data-m26-client-context-guide-ack],[data-m26-client-context-guide-action]')?.focus?.({preventScroll:true});}catch{}
      });
    }
    return Boolean(dialog);
  }
  function decorate(current){
    const launcher=root.querySelector?.('[data-progressive-onboarding-launcher]');
    if(launcher){
      launcher.setAttribute?.('data-m26-client-context-guide-open','');
      launcher.setAttribute?.('aria-label',tr('launcherLabel','Abrir guía contextual de esta pantalla'));
      launcher.textContent=tr('launcher','Guía');
    }
    const settings=root.querySelector?.('[data-m26-client-context-guide-settings]');
    if(current!=='ajustes'){settings?.remove?.();return;}
    if(!settings)root.querySelector?.('#m26-main')?.insertAdjacentHTML?.('beforeend',settingsHtml());
  }
  function now(){
    scheduled=false;
    if(!mounted)return;
    const ctx=context();
    if(!ctx){
      lastKey=null;
      close({restoreFocus:false});
      return;
    }
    if(lastKey&&lastKey!==ctx.key)close({restoreFocus:false});
    lastKey=ctx.key;
    const current=area(root)||'hoy';
    decorate(current);
    const next=eligibleTip(ctx,current);
    if(dialog&&activeTip?.area!==current)close({restoreFocus:false});
    if(dialog&&activeTip&&!target(root,activeTip))close({restoreFocus:false});
    if(!dialog&&next)show(ctx,next);
    else schedulePosition();
  }
  function refresh(){
    if(scheduled||!mounted)return;
    scheduled=true;
    queueMicrotask(now);
  }
  function activateTipAction(ctx){
    if(!activeTip?.actionArea)return false;
    const actionArea=activeTip.actionArea;
    const tip=activeTip;
    markSeen(ctx,tip);
    close({restoreFocus:false});
    const destination=root.querySelector?.(`[data-m26-area="${actionArea}"]`);
    destination?.click?.();
    return Boolean(destination);
  }
  function click(event){
    const ctx=context();
    if(!ctx)return;
    if(event.target?.closest?.('[data-m26-client-context-guide-open]')){
      event.preventDefault?.();
      const current=area(root)||'hoy';
      const tip=eligibleTip(ctx,current,{force:true});
      if(tip)show(ctx,tip,{force:true});
      return;
    }
    if(event.target?.closest?.('[data-m26-client-context-guide-action]')){
      event.preventDefault?.();
      activateTipAction(ctx);
      return;
    }
    if(event.target?.closest?.('[data-m26-client-context-guide-ack]')){
      event.preventDefault?.();
      if(activeTip)markSeen(ctx,activeTip);
      close();
      return;
    }
    if(event.target?.closest?.('[data-m26-client-context-guide-later]')){
      event.preventDefault?.();
      if(activeTip)markDismissed(ctx,activeTip);
      close();
    }
  }
  function key(event){
    if(event?.key!=='Escape'||!dialog)return;
    event.preventDefault?.();
    const ctx=context();
    if(ctx&&activeTip)markDismissed(ctx,activeTip);
    close();
  }

  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      doc?.addEventListener?.('click',click);
      root.addEventListener?.('m26:shell-rendered',refresh);
      doc?.addEventListener?.('keydown',key);
      scope?.addEventListener?.('pageshow',refresh);
      scope?.addEventListener?.('resize',schedulePosition,{passive:true});
      scope?.addEventListener?.('scroll',schedulePosition,{passive:true,capture:true});
      ensureStyle(doc);
      refresh();
    },
    refresh,
    openCurrent(){
      const ctx=context();
      const current=area(root)||'hoy';
      const tip=ctx?eligibleTip(ctx,current,{force:true}):null;
      return tip?show(ctx,tip,{force:true}):false;
    },
    destroy(){
      if(!mounted)return;
      mounted=false;
      scheduled=false;
      doc?.removeEventListener?.('click',click);
      root.removeEventListener?.('m26:shell-rendered',refresh);
      doc?.removeEventListener?.('keydown',key);
      scope?.removeEventListener?.('pageshow',refresh);
      scope?.removeEventListener?.('resize',schedulePosition);
      scope?.removeEventListener?.('scroll',schedulePosition,true);
      close({restoreFocus:false});
      root.querySelector?.('[data-m26-client-context-guide-settings]')?.remove?.();
      doc?.querySelector?.('[data-m26-client-context-guide-style]')?.remove?.();
    },
  });
}

export const __clientContextualGuideInternals=Object.freeze({
  TIPS,
  LEGACY_PROGRESSIVE_MAP,
  LEGACY_GUIDED_ALL,
  area,
  target,
  positionDialog,
  isVisibleInViewport,
});
