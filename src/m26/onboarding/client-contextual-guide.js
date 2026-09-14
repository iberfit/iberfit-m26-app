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
  'client-moment-plan-ready.title':'Tu planificación tiene novedades',
  'client-moment-plan-ready.body':'Tu Coach ha preparado o actualizado tu planificación. Puedes entrar para ver qué ha cambiado y cómo encajan las próximas sesiones dentro de tu proceso.',
  'client-moment-session-ready.title':'Tu entrenamiento tiene novedades',
  'client-moment-session-ready.body':'Hay una sesión nueva o actualizada disponible para ti. Cuando quieras empezar, IBERFIT te irá mostrando ejercicios, series, carga, descansos e indicaciones sin sacarte del flujo.',
  'client-moment-adherence-review.title':'Tu continuidad merece una revisión',
  'client-moment-adherence-review.body':'Con suficientes sesiones planificadas para comparar, la continuidad confirmada de las últimas semanas está por debajo de lo previsto. Ver Progreso puede ayudarte a revisar qué está ocurriendo sin asumir una causa.',
  'client-moment-progress-meaningful.title':'Ya hay historial suficiente para leer una tendencia',
  'client-moment-progress-meaningful.body':'Ahora hay varios datos confirmados que permiten comparar parte de tu evolución con más contexto. IBERFIT muestra tendencias y adherencia, pero no atribuye causas automáticamente.',
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
  'client-feature-challenges.title':'Retos y comunidad están dentro de Más',
  'client-feature-challenges.body':'Cuando no haya un reto activo, puedes entrar desde Más para conocer este espacio. La participación social es opcional, privada por defecto y nunca publica datos de salud automáticamente.',
  'client-context-settings.title':'Tú decides cómo quieres vivir la app',
  'client-context-settings.body':'En Ajustes controlas idioma, avisos, privacidad y permisos de experiencia. También puedes volver a abrir esta explicación cuando la necesites.',
});

const TIPS=Object.freeze([
  Object.freeze({
    id:'client-moment-session-ready',
    copyId:'client-moment-session-ready',
    kind:'moment',
    priority:120,
    area:'hoy',
    actionArea:'sesion',
    repeatOnEvent:true,
    seenAlso:Object.freeze(['client-context-session','client-context-plan-ready']),
    selectors:Object.freeze(['[data-m26-client-guide="session-entry"]']),
  }),
  Object.freeze({
    id:'client-moment-adherence-review',
    copyId:'client-moment-adherence-review',
    kind:'moment',
    priority:110,
    area:'hoy',
    actionArea:'progreso',
    seenAlso:Object.freeze(['client-context-progress','client-moment-progress-meaningful']),
    selectors:Object.freeze(['[data-m26-client-guide="adherence-entry"]']),
  }),
  Object.freeze({
    id:'client-context-plan-ready',
    copyId:'client-moment-plan-ready',
    kind:'moment',
    priority:100,
    area:'hoy',
    actionArea:'planificacion',
    repeatOnEvent:true,
    seenAlso:Object.freeze(['client-context-plan']),
    selectors:Object.freeze(['[data-m26-client-guide="plan-entry"]']),
  }),
  Object.freeze({
    id:'client-context-challenge-ready',
    copyId:'client-context-challenges',
    kind:'moment',
    priority:90,
    area:'hoy',
    actionArea:'retos',
    repeatOnEvent:true,
    seenAlso:Object.freeze(['client-context-challenges']),
    selectors:Object.freeze(['[data-m26-client-guide="challenge-entry"]']),
  }),
  Object.freeze({
    id:'client-context-today',
    copyId:'client-context-today',
    kind:'orientation',
    priority:50,
    area:'hoy',
    selectors:Object.freeze(['[data-m26-client-guide="today"]']),
  }),
  Object.freeze({
    id:'client-feature-challenges-community',
    copyId:'client-feature-challenges',
    kind:'feature',
    priority:20,
    area:'hoy',
    actionArea:'retos',
    selectors:Object.freeze(['.m26-client-bottom-nav-more > summary']),
    excludeSelectors:Object.freeze(['[data-m26-client-guide="challenge-entry"]']),
  }),
  Object.freeze({
    id:'client-context-plan',
    copyId:'client-context-plan',
    kind:'orientation',
    priority:50,
    area:'planificacion',
    selectors:Object.freeze(['[data-m26-client-guide="plan-surface"]']),
  }),
  Object.freeze({
    id:'client-context-session',
    copyId:'client-context-session',
    kind:'orientation',
    priority:50,
    area:'sesion',
    selectors:Object.freeze(['[data-m26-client-guide="session-surface"]']),
  }),
  Object.freeze({
    id:'client-moment-progress-meaningful',
    copyId:'client-moment-progress-meaningful',
    kind:'moment',
    priority:100,
    area:'progreso',
    seenAlso:Object.freeze(['client-context-progress']),
    selectors:Object.freeze(['[data-m26-client-guide-insight="progress-ready"]']),
  }),
  Object.freeze({
    id:'client-context-progress',
    copyId:'client-context-progress',
    kind:'orientation',
    priority:60,
    area:'progreso',
    selectors:Object.freeze(['[data-m26-client-guide="progress-surface"]']),
  }),
  Object.freeze({
    id:'client-context-activity',
    copyId:'client-context-activity',
    kind:'orientation',
    priority:40,
    area:'actividad',
    selectors:Object.freeze([
      '[data-client-bottom-nav-route="actividad"] .m26-route-intro',
      '[data-client-bottom-nav-route="actividad"]',
    ]),
  }),
  Object.freeze({
    id:'client-context-messages',
    copyId:'client-context-messages',
    kind:'orientation',
    priority:40,
    area:'mensajes',
    selectors:Object.freeze([
      '[data-client-bottom-nav-route="mensajes"] .m26-route-intro',
      '[data-client-bottom-nav-route="mensajes"]',
    ]),
  }),
  Object.freeze({
    id:'client-context-challenges',
    copyId:'client-context-challenges',
    kind:'moment',
    priority:80,
    area:'retos',
    selectors:Object.freeze(['[data-m26-client-guide="challenge-surface"]']),
  }),
  Object.freeze({
    id:'client-context-settings',
    copyId:'client-context-settings',
    kind:'orientation',
    priority:30,
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
  'client-session':Object.freeze(['client-moment-session-ready','client-context-session']),
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
.m26-client-guide-presence{
  position:fixed;
  z-index:1212;
  left:1rem;
  top:1rem;
  width:3rem;
  height:3rem;
  display:grid;
  place-items:center;
  border:1px solid color-mix(in srgb,var(--iberfit-color-accent,#d8b96f) 58%,transparent);
  border-radius:999px;
  background:color-mix(in srgb,var(--iberfit-color-surface-overlay,#10281e) 97%,black);
  box-shadow:0 12px 30px rgba(0,0,0,.24),0 0 0 3px color-mix(in srgb,var(--iberfit-color-accent,#d8b96f) 10%,transparent);
  pointer-events:none;
  opacity:0;
  transform:translateZ(0) scale(.92);
  transition:left 280ms cubic-bezier(.22,.8,.24,1),top 280ms cubic-bezier(.22,.8,.24,1),opacity 160ms ease,transform 220ms ease;
  will-change:left,top,opacity,transform;
}
.m26-client-guide-presence.is-visible{opacity:1;transform:translateZ(0) scale(1)}
.m26-client-guide-presence img{
  display:block;
  width:68%;
  height:68%;
  object-fit:contain;
  user-select:none;
  -webkit-user-drag:none;
}
.m26-client-guide-presence.is-arriving{animation:m26-client-guide-arrive 520ms cubic-bezier(.2,.8,.2,1) both}
@keyframes m26-client-guide-arrive{
  0%{opacity:0;transform:translateZ(0) scale(.82)}
  55%{opacity:1;transform:translateZ(0) scale(1.035)}
  100%{opacity:1;transform:translateZ(0) scale(1)}
}
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
  .m26-client-guide-presence{width:2.7rem;height:2.7rem}
}
@media(prefers-reduced-motion:reduce){
  .m26-client-context-guide,.m26-client-context-guide-target,.m26-client-guide-presence{scroll-behavior:auto;transition:none!important;animation:none!important}
}
@media print{.m26-client-context-guide,.m26-client-context-guide-settings,.m26-client-guide-presence{display:none!important}}
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
  return Object.freeze(
    TIPS
      .filter((tip)=>tip.area===current)
      .sort((left,right)=>Number(right.priority||0)-Number(left.priority||0))
  );
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
  const eventKeys=(items)=>Array.from(new Set(
    (Array.isArray(items)?items:[])
      .map((item)=>txt(item,120))
      .filter((item)=>/^client-[a-z0-9-]+:[a-f0-9]{8}$/u.test(item))
  )).slice(-64);
  return Object.freeze({
    schemaVersion:CLIENT_CONTEXTUAL_GUIDE_SCHEMA_VERSION,
    seenTipIds:Object.freeze(unique(value?.seenTipIds)),
    dismissedTipIds:Object.freeze(unique(value?.dismissedTipIds)),
    seenEventKeys:Object.freeze(eventKeys(value?.seenEventKeys)),
    dismissedEventKeys:Object.freeze(eventKeys(value?.dismissedEventKeys)),
    legacyMigrated:Boolean(value?.legacyMigrated),
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
  return normalizeClientContextualGuideState({
    seenTipIds:seen,
    dismissedTipIds:dismissed,
    legacyMigrated:true,
  });
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
function eventReceiptKey(tip,node){
  if(tip?.repeatOnEvent!==true||!node)return null;
  const raw=txt(node.getAttribute?.('data-m26-client-guide-event-key'),240);
  return raw?`${tip.id}:${h(raw)}`:null;
}
function tipAvailableInState(tip,node,state,{force=false}={}){
  if(force)return true;
  const eventKey=eventReceiptKey(tip,node);
  if(eventKey){
    return !state.seenEventKeys.includes(eventKey)&&!state.dismissedEventKeys.includes(eventKey);
  }
  return !state.seenTipIds.includes(tip.id)&&!state.dismissedTipIds.includes(tip.id);
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
function presenceHtml(){
  return '<div class="m26-client-guide-presence" data-m26-client-guide-presence aria-hidden="true"><img src="/public/isotipo-iberfit.png" alt="" draggable="false"></div>';
}
function ensurePresence(doc){
  let node=doc?.querySelector?.('[data-m26-client-guide-presence]');
  if(node||!doc?.body?.insertAdjacentHTML)return node;
  doc.body.insertAdjacentHTML('beforeend',presenceHtml());
  return doc.querySelector?.('[data-m26-client-guide-presence]')||null;
}
function hidePresence(node){
  if(!node)return;
  node.classList?.remove?.('is-visible','is-arriving');
}
function clientGuideSuppressed(root){
  return Boolean(root?.querySelector?.('[data-session-live-v3],[data-session-live-state],[data-session-touch-focus]'));
}
function positionPresence(node,targetNode,scope,{arriving=false}={}){
  if(!node||!targetNode)return false;
  try{
    const rect=targetNode.getBoundingClientRect?.();
    const width=Number(scope?.innerWidth||0);
    const height=Number(scope?.innerHeight||0);
    if(!rect||!width||!height)return false;
    const mobile=width<=690;
    const size=mobile?43:48;
    const margin=mobile?10:14;
    const gap=mobile?8:10;
    const bottomReserve=mobile?104:margin;
    const outside=Number(rect.bottom||0)<margin||Number(rect.top||0)>height-bottomReserve||Number(rect.right||0)<0||Number(rect.left||0)>width;
    if(outside){hidePresence(node);return false;}
    let left=Number(rect.right||0)+gap;
    if(left+size>width-margin)left=Number(rect.left||0)-size-gap;
    if(left<margin)left=Math.min(width-size-margin,Math.max(margin,Number(rect.left||margin)+gap));
    let top=Number(rect.top||0)+Math.min(24,Math.max(0,(Number(rect.height||size)-size)/2));
    top=Math.max(margin,Math.min(height-size-bottomReserve,top));
    const first=!node.hasAttribute?.('data-m26-client-guide-positioned');
    if(first)node.style.transition='none';
    node.style.left=`${Math.round(left)}px`;
    node.style.top=`${Math.round(top)}px`;
    node.setAttribute?.('data-m26-client-guide-positioned','true');
    node.classList?.add?.('is-visible');
    if(!arriving)node.classList?.remove?.('is-arriving');
    if(arriving&&!reduced(scope)){
      node.classList?.remove?.('is-arriving');
      void node.offsetWidth;
      node.classList?.add?.('is-arriving');
    }
    if(first){
      const restore=()=>node.style?.removeProperty?.('transition');
      if(typeof scope?.requestAnimationFrame==='function')scope.requestAnimationFrame(restore);
      else queueMicrotask(restore);
    }
    return true;
  }catch{return false;}
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
  let presence=null;
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
    if(current.legacyMigrated)return current;
    const legacy=legacyClientContextualGuideSeed({storage:resolvedStorage,userId:ctx.userId});
    const merged=normalizeClientContextualGuideState({
      seenTipIds:[...current.seenTipIds,...legacy.seenTipIds],
      dismissedTipIds:[...current.dismissedTipIds,...legacy.dismissedTipIds],
      seenEventKeys:current.seenEventKeys,
      dismissedEventKeys:current.dismissedEventKeys,
      legacyMigrated:true,
    });
    repo.write(ctx.key,merged);
    return merged;
  }
  function persist(ctx,patch){
    const current=stateWithLegacy(ctx);
    repo.write(ctx.key,{
      seenTipIds:patch.seenTipIds||current.seenTipIds,
      dismissedTipIds:patch.dismissedTipIds||current.dismissedTipIds,
      seenEventKeys:patch.seenEventKeys||current.seenEventKeys,
      dismissedEventKeys:patch.dismissedEventKeys||current.dismissedEventKeys,
      legacyMigrated:true,
    });
  }
  function close({restoreFocus=true,preservePresence=false}={}){
    activeTarget?.classList?.remove?.('m26-client-context-guide-target');
    activeTarget?.removeAttribute?.('data-m26-client-context-guide-target-active');
    activeTarget=null;
    dialog?.remove?.();
    dialog=null;
    activeTip=null;
    if(!preservePresence)hidePresence(presence);
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
  function markSeen(ctx,tip,node=activeTarget){
    const state=stateWithLegacy(ctx);
    const linkedTips=(Array.isArray(tip.seenAlso)?tip.seenAlso:[])
      .map((id)=>TIPS.find((candidate)=>candidate.id===id))
      .filter(Boolean);
    const eventKeys=[
      eventReceiptKey(tip,node),
      ...linkedTips.map((linked)=>eventReceiptKey(linked,target(root,linked))),
    ].filter(Boolean);
    persist(ctx,{
      seenTipIds:[
        ...state.seenTipIds,
        tip.id,
        ...(Array.isArray(tip.seenAlso)?tip.seenAlso:[]),
      ],
      seenEventKeys:[...state.seenEventKeys,...eventKeys],
    });
  }
  function markDismissed(ctx,tip,node=activeTarget){
    const state=stateWithLegacy(ctx);
    const eventKey=eventReceiptKey(tip,node);
    if(eventKey){
      persist(ctx,{dismissedEventKeys:[...state.dismissedEventKeys,eventKey]});
      return;
    }
    persist(ctx,{dismissedTipIds:[...state.dismissedTipIds,tip.id]});
  }
  function eligibleTip(ctx,current,{force=false}={}){
    const state=stateWithLegacy(ctx);
    for(const tip of clientContextualGuideTipsForArea(current)){
      const node=target(root,tip);
      if(!node)continue;
      if((tip.excludeSelectors||[]).some((selector)=>root?.querySelector?.(selector)))continue;
      if(!tipAvailableInState(tip,node,state,{force}))continue;
      return tip;
    }
    return null;
  }
  function schedulePosition(){
    if(positionFrame!==null||!activeTarget)return;
    const run=()=>{
      positionFrame=null;
      if(dialog&&activeTarget)positionDialog(dialog,activeTarget,scope);
      if(presence&&activeTarget)positionPresence(presence,activeTarget,scope);
    };
    if(typeof scope?.requestAnimationFrame==='function')positionFrame=scope.requestAnimationFrame(run);
    else queueMicrotask(run);
  }
  function show(ctx,tip,{force=false}={}){
    const node=target(root,tip);
    if(!ctx||!tip||!node)return false;
    const state=stateWithLegacy(ctx);
    if(!tipAvailableInState(tip,node,state,{force}))return false;
    ensureStyle(doc);
    close({restoreFocus:false,preservePresence:true});
    activeTip=tip;
    activeTarget=node;
    previousFocus=force?doc?.activeElement||null:null;
    node.classList?.add?.('m26-client-context-guide-target');
    node.setAttribute?.('data-m26-client-context-guide-target-active','true');
    if(!isVisibleInViewport(node,scope)){
      try{node.scrollIntoView?.({block:'center',inline:'nearest',behavior:reduced(scope)?'auto':'smooth'});}catch{}
    }
    presence=presence||ensurePresence(doc);
    positionPresence(presence,node,scope,{arriving:!presence?.classList?.contains?.('is-visible')});
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
  function guideLaunchers(){
    return [...(root.querySelectorAll?.('[data-m26-client-context-guide-open]')||[])];
  }
  function decorate(current){
    for(const launcher of guideLaunchers()){
      launcher.removeAttribute?.('hidden');
      launcher.setAttribute?.('aria-label',tr('launcherLabel','Abrir guía contextual de esta pantalla'));
      if(launcher.hasAttribute?.('data-progressive-onboarding-launcher'))launcher.textContent=tr('launcher','Guía');
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
    if(clientGuideSuppressed(root)){
      for(const launcher of guideLaunchers())launcher.setAttribute?.('hidden','');
      close({restoreFocus:false});
      return;
    }
    const current=area(root)||'hoy';
    decorate(current);
    const next=eligibleTip(ctx,current);
    const resolvedTarget=dialog&&activeTip?target(root,activeTip):null;
    const changingArea=Boolean(dialog&&activeTip?.area!==current);
    const missingTarget=Boolean(dialog&&activeTip&&!resolvedTarget);
    if(changingArea||missingTarget)close({restoreFocus:false,preservePresence:Boolean(next)});
    else if(dialog&&resolvedTarget&&resolvedTarget!==activeTarget){
      activeTarget?.classList?.remove?.('m26-client-context-guide-target');
      activeTarget?.removeAttribute?.('data-m26-client-context-guide-target-active');
      activeTarget=resolvedTarget;
      activeTarget.classList?.add?.('m26-client-context-guide-target');
      activeTarget.setAttribute?.('data-m26-client-context-guide-target-active','true');
    }
    if(!dialog&&next)show(ctx,next);
    else if(!dialog&&!next)hidePresence(presence);
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
    close({restoreFocus:false,preservePresence:true});
    const destination=root.querySelector?.(`[data-m26-area="${actionArea}"]`);
    if(!destination){hidePresence(presence);return false;}
    destination.click?.();
    return true;
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
      if(clientGuideSuppressed(root))return false;
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
      presence?.remove?.();
      presence=null;
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
  positionPresence,
  clientGuideSuppressed,
  eventReceiptKey,
  tipAvailableInState,
  isVisibleInViewport,
});
