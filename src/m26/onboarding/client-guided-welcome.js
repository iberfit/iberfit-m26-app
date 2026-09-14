import {iberfitSurfaceTranslate} from '../ui/i18n-surface.js';

export const CLIENT_GUIDED_WELCOME_VERSION=1;
export const CLIENT_GUIDED_WELCOME_SCHEMA_VERSION='iberfit.client-guided-welcome.v1';

const STATUS=new Set(['never','in-progress','paused','completed','skipped']);

const SOURCE_COPY=Object.freeze({
  eyebrow:'Tu guía IBERFIT',
  pause:'Lo vemos luego',
  close:'Cerrar por ahora',
  'welcome-home.title':'Hola. Antes de dejarte a tu aire…',
  'welcome-home.body':'Te enseño lo importante y te dejo tranquilo. Empezamos aquí: en Hoy verás qué toca ahora y qué merece tu atención. Nada más.',
  'welcome-home.cta':'Vamos',
  'welcome-plan.title':'Esta es tu hoja de ruta.',
  'welcome-plan.body':'Aquí tienes lo que tu Coach ha preparado para ti. No necesitas memorizar nada: cuando quieras saber qué toca y por qué, vuelves aquí.',
  'welcome-plan.cta':'Sigo',
  'welcome-session.title':'Y cuando toque entrenar, vengo contigo.',
  'welcome-session.body':'Aquí tienes la sesión lista: ejercicios, series, carga, descansos y las indicaciones de tu Coach. Tú entrenas; la app se encarga de que no tengas que ir buscando cosas.',
  'welcome-session.cta':'Seguimos',
  'welcome-progress.title':'Esto es lo que va cambiando.',
  'welcome-progress.body':'Aquí ves tu evolución con contexto: qué has hecho, cómo vas respondiendo y qué merece la pena revisar. Sin llenar la pantalla de números porque sí.',
  'welcome-progress.cta':'Una última cosa',
  'welcome-messages.title':'Y si necesitas hablar, aquí.',
  'welcome-messages.body':'Una duda, una sensación después de entrenar, un cambio de horario… se lo cuentas a tu Coach desde aquí y seguimos desde el mismo sitio.',
  'welcome-messages.cta':'Te devuelvo a Hoy',
  'welcome-finish.title':'Ya está. Te dejo aquí.',
  'welcome-finish.body':'No voy a ir apareciendo por toda la app. Volveré solo cuando pueda ayudarte de verdad —o cuando tú me llames desde Guía IBERFIT.',
  'welcome-finish.cta':'Perfecto',
});

const STEPS=Object.freeze([
  Object.freeze({
    id:'welcome-home',
    area:'hoy',
    guideState:'idle',
    seenAlso:Object.freeze(['client-context-today']),
    selectors:Object.freeze([
      '[data-m26-client-guide="today"]',
      '[data-client-bottom-nav-route="hoy"] .m26-route-intro',
      '[data-client-bottom-nav-route="hoy"]',
      '#m26-main',
    ]),
  }),
  Object.freeze({
    id:'welcome-plan',
    area:'planificacion',
    guideState:'pointing',
    seenAlso:Object.freeze(['client-context-plan']),
    selectors:Object.freeze([
      '[data-m26-client-guide="plan-surface"]',
      '[data-client-bottom-nav-route="planificacion"] .m26-route-intro',
      '[data-client-bottom-nav-route="planificacion"]',
      '#m26-main',
    ]),
  }),
  Object.freeze({
    id:'welcome-session',
    area:'sesion',
    guideState:'pointing',
    seenAlso:Object.freeze(['client-context-session']),
    selectors:Object.freeze([
      '[data-m26-client-guide="session-surface"]',
      '[data-client-bottom-nav-route="sesion"] .m26-route-intro',
      '[data-client-bottom-nav-route="sesion"]',
      '#m26-main',
    ]),
  }),
  Object.freeze({
    id:'welcome-progress',
    area:'progreso',
    guideState:'pointing',
    seenAlso:Object.freeze(['client-context-progress']),
    selectors:Object.freeze([
      '[data-m26-client-guide="progress-surface"]',
      '[data-client-bottom-nav-route="progreso"] .m26-route-intro',
      '[data-client-bottom-nav-route="progreso"]',
      '#m26-main',
    ]),
  }),
  Object.freeze({
    id:'welcome-messages',
    area:'mensajes',
    guideState:'pointing',
    seenAlso:Object.freeze(['client-context-messages']),
    selectors:Object.freeze([
      '[data-client-bottom-nav-route="mensajes"] .m26-route-intro',
      '[data-client-bottom-nav-route="communication"] .m26-route-intro',
      '[data-client-bottom-nav-route="communication-unavailable"] .m26-route-intro',
      '[data-client-bottom-nav-route="mensajes"]',
      '[data-client-bottom-nav-route="communication"]',
      '[data-client-bottom-nav-route="communication-unavailable"]',
      '#m26-main',
    ]),
  }),
  Object.freeze({
    id:'welcome-finish',
    area:'hoy',
    guideState:'success',
    seenAlso:Object.freeze([]),
    selectors:Object.freeze([
      '[data-m26-client-guide="today"]',
      '[data-client-bottom-nav-route="hoy"] .m26-route-intro',
      '[data-client-bottom-nav-route="hoy"]',
      '#m26-main',
    ]),
  }),
]);

const STYLE=`
.m26-client-guided-welcome{
  position:fixed;
  z-index:1230;
  width:min(26rem,calc(100vw - 2rem));
  padding:1.05rem 1.1rem;
  border:1px solid color-mix(in srgb,var(--iberfit-color-accent,#c5a059) 44%,transparent);
  border-radius:1.15rem;
  background:color-mix(in srgb,var(--iberfit-color-surface-overlay,#10281e) 97%,black);
  box-shadow:0 26px 78px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,248,220,.025);
}
.m26-client-guided-welcome-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.85rem}
.m26-client-guided-welcome h2{margin:.18rem 0 0;font-size:clamp(1.1rem,2vw,1.28rem);line-height:1.2;letter-spacing:-.018em}
.m26-client-guided-welcome-copy{margin:.76rem 0 0;line-height:1.58;color:var(--iberfit-color-text-secondary,#cbd5cf)}
.m26-client-guided-welcome-actions{display:flex;justify-content:flex-end;gap:.55rem;margin-top:.95rem;flex-wrap:wrap}
.m26-client-guided-welcome-actions button,.m26-client-guided-welcome-head button{min-height:44px;min-width:44px}
.m26-client-guided-welcome-target{
  position:relative;
  z-index:1220!important;
  outline:2px solid color-mix(in srgb,var(--iberfit-color-accent,#c5a059) 78%,white 4%);
  outline-offset:4px;
  border-radius:max(.5rem,var(--iberfit-radius-md,.75rem));
  box-shadow:0 0 0 9999px rgba(4,18,13,.68),0 0 30px rgba(197,160,89,.18)!important;
  scroll-margin:7rem 1rem;
}
.m26-client-guided-welcome-presence{
  position:fixed;
  z-index:1232;
  left:1rem;
  top:1rem;
  width:4.25rem;
  height:4.25rem;
  display:grid;
  place-items:center;
  pointer-events:none;
  opacity:0;
  transform:translateZ(0) scale(.92);
  transition:left 300ms cubic-bezier(.22,.8,.24,1),top 300ms cubic-bezier(.22,.8,.24,1),opacity 170ms ease,transform 230ms ease;
  will-change:left,top,opacity,transform;
}
.m26-client-guided-welcome-presence::before{
  content:'';
  position:absolute;
  inset:8%;
  border:1px solid color-mix(in srgb,var(--iberfit-color-accent,#c5a059) 48%,transparent);
  border-radius:999px;
  background:radial-gradient(circle,rgba(255,248,220,.08),rgba(197,160,89,.025) 58%,transparent 72%);
  box-shadow:0 10px 28px rgba(0,0,0,.22),0 0 0 3px rgba(197,160,89,.05);
}
.m26-client-guided-welcome-presence img{
  position:relative;
  z-index:1;
  display:block;
  width:68%;
  height:68%;
  object-fit:contain;
  user-select:none;
  -webkit-user-drag:none;
  filter:drop-shadow(0 5px 12px rgba(197,160,89,.16));
}
.m26-client-guided-welcome-presence.is-visible{opacity:1;transform:translateZ(0) scale(1)}
.m26-client-guided-welcome-presence.is-arriving{animation:m26-client-guided-welcome-arrive 520ms cubic-bezier(.2,.8,.2,1) both}
.m26-client-guided-welcome-presence[data-m26-client-guide-state="success"]::before{
  box-shadow:0 10px 28px rgba(0,0,0,.22),0 0 0 4px rgba(197,160,89,.07),0 0 26px rgba(255,215,0,.12);
}
@keyframes m26-client-guided-welcome-arrive{
  0%{opacity:0;transform:translateZ(0) translateY(8px) scale(.84)}
  58%{opacity:1;transform:translateZ(0) translateY(-2px) scale(1.025)}
  100%{opacity:1;transform:translateZ(0) translateY(0) scale(1)}
}
@media(max-width:690px){
  .m26-client-guided-welcome{
    left:.75rem!important;
    right:.75rem!important;
    top:auto!important;
    bottom:calc(5.35rem + env(safe-area-inset-bottom))!important;
    width:auto;
    max-height:min(48vh,27rem);
    overflow:auto;
  }
  .m26-client-guided-welcome-presence{width:3.8rem;height:3.8rem}
}
@media(prefers-reduced-motion:reduce){
  .m26-client-guided-welcome,.m26-client-guided-welcome-target,.m26-client-guided-welcome-presence{
    scroll-behavior:auto!important;
    transition:none!important;
    animation:none!important;
  }
}
@media print{
  .m26-client-guided-welcome,.m26-client-guided-welcome-presence{display:none!important}
}
`;

function text(value,max=240){return String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);}
function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function hash(value){let result=0x811c9dc5;for(const char of String(value||'')){result^=char.charCodeAt(0);result=Math.imul(result,0x01000193);}return (result>>>0).toString(16).padStart(8,'0');}
function tr(key,fallback){return iberfitSurfaceTranslate(SOURCE_COPY[key]||fallback||key);}
function storageOf(storage,scope){if(storage!==undefined)return storage;try{return scope?.localStorage??null;}catch{return null;}}
function reduced(scope){try{return Boolean(scope?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);}catch{return false;}}
function currentArea(root){
  const canonical=text(
    root?.querySelector?.('[data-m26-area][aria-current="page"]')?.getAttribute?.('data-m26-area'),
    80
  );
  if(canonical)return canonical;
  const routeKind=text(
    root?.querySelector?.('[data-client-bottom-nav-route]')?.getAttribute?.('data-client-bottom-nav-route'),
    80
  );
  if(['communication','communication-unavailable'].includes(routeKind))return 'mensajes';
  return routeKind||'hoy';
}
function visibleDestination(root,area){
  const items=[...(root?.querySelectorAll?.(`[data-m26-area="${area}"]`)||[])];
  return items.find((node)=>{
    if(node?.hidden)return false;
    if(node?.getAttribute?.('aria-hidden')==='true')return false;
    try{return node?.offsetParent!==null||node?.getClientRects?.()?.length>0;}catch{return true;}
  })||items[0]||null;
}
function targetFor(root,step){
  for(const selector of step?.selectors||[]){
    const node=root?.querySelector?.(selector);
    if(node)return node;
  }
  return null;
}
function inViewport(node,scope){
  try{
    const rect=node?.getBoundingClientRect?.();
    const height=Number(scope?.innerHeight||0);
    const width=Number(scope?.innerWidth||0);
    if(!rect||!height||!width)return true;
    return rect.bottom>=0&&rect.top<=height&&rect.right>=0&&rect.left<=width;
  }catch{return true;}
}
function suppressed(root){
  return Boolean(root?.querySelector?.('[data-session-live-v3],[data-session-live-state],[data-session-touch-focus]'));
}

export function clientGuidedWelcomeScopeKey({userId,role}={}){
  const id=text(userId,240);
  return text(role,40).toLowerCase()==='client'&&id
    ?`iberfit.m26.client-guided-welcome.v1:${hash(`${id}|client`)}`
    :null;
}
export function normalizeClientGuidedWelcomeState(value={}){
  const status=STATUS.has(value?.status)?value.status:'never';
  const stepIndex=Math.max(0,Math.min(STEPS.length-1,Number.isInteger(Number(value?.stepIndex))?Number(value.stepIndex):0));
  return Object.freeze({
    schemaVersion:CLIENT_GUIDED_WELCOME_SCHEMA_VERSION,
    status,
    stepIndex,
    completedVersion:status==='completed'?Math.max(CLIENT_GUIDED_WELCOME_VERSION,Number(value?.completedVersion||0)):Number(value?.completedVersion||0),
    skippedVersion:status==='skipped'?Math.max(CLIENT_GUIDED_WELCOME_VERSION,Number(value?.skippedVersion||0)):Number(value?.skippedVersion||0),
  });
}
export function clientGuidedWelcomeLegacySeed({storage,userId}={}){
  const id=text(userId,240);
  if(!id)return normalizeClientGuidedWelcomeState({});
  const identityHash=hash(`${id}|client`);
  const read=(key)=>{try{const raw=storage?.getItem?.(key);return raw?JSON.parse(raw):null;}catch{return null;}};
  const guided=read(`iberfit.m26.guided-onboarding.v1:client:${identityHash}`)||{};
  const progressive=read(`iberfit.m26.progressive-onboarding.v1:client:${identityHash}`)||{};
  const contextual=read(`iberfit.m26.client-context-guide.v1:${identityHash}`)||{};
  const guidedCompleted=Number(guided.onboardingCompletedVersion||0)>=1||guided.status==='completed';
  const guidedSkipped=Number(guided.onboardingSkippedVersion||0)>=1||guided.status==='skipped';
  const alreadyUsed=Array.isArray(progressive.visited)&&progressive.visited.length>0||
    Array.isArray(contextual.seenTipIds)&&contextual.seenTipIds.length>0||
    Array.isArray(contextual.dismissedTipIds)&&contextual.dismissedTipIds.length>0;
  if(guidedSkipped)return normalizeClientGuidedWelcomeState({status:'skipped',skippedVersion:CLIENT_GUIDED_WELCOME_VERSION});
  if(guidedCompleted||alreadyUsed)return normalizeClientGuidedWelcomeState({status:'completed',completedVersion:CLIENT_GUIDED_WELCOME_VERSION});
  return normalizeClientGuidedWelcomeState({status:'never'});
}
export function clientGuidedWelcomeStep(index=0){
  const value=Math.max(0,Math.min(STEPS.length-1,Number(index)||0));
  return STEPS[value];
}

function dialogHtml(step){
  const copyId=step.id;
  const final=copyId==='welcome-finish';
  const pauseAction=final?'':`<button type="button" class="m26-text-action" data-m26-client-guided-welcome-pause>${esc(tr('pause','Lo vemos luego'))}</button>`;
  return `<aside class="m26-client-guided-welcome" data-m26-client-guided-welcome role="dialog" aria-modal="false" aria-labelledby="m26-client-guided-welcome-title" aria-describedby="m26-client-guided-welcome-copy"><div class="m26-client-guided-welcome-head"><div><p class="m26-eyebrow">${esc(tr('eyebrow','Tu guía IBERFIT'))}</p><h2 id="m26-client-guided-welcome-title">${esc(tr(`${copyId}.title`,copyId))}</h2></div><button type="button" class="m26-icon-button" data-m26-client-guided-welcome-pause aria-label="${esc(tr('close','Cerrar por ahora'))}">×</button></div><p class="m26-client-guided-welcome-copy" id="m26-client-guided-welcome-copy">${esc(tr(`${copyId}.body`,''))}</p><div class="m26-client-guided-welcome-actions">${pauseAction}<button type="button" class="m26-primary-action" data-m26-client-guided-welcome-next>${esc(tr(`${copyId}.cta`,'Seguir'))}</button></div></aside>`;
}
function ensureStyle(doc){
  let node=doc?.querySelector?.('[data-m26-client-guided-welcome-style]');
  if(node||!doc?.createElement)return node;
  node=doc.createElement('style');
  node.setAttribute('data-m26-client-guided-welcome-style','');
  node.textContent=STYLE;
  doc.head?.append?.(node);
  return node;
}
function ensurePresence(doc){
  let node=doc?.querySelector?.('[data-m26-client-guided-welcome-presence]');
  if(node||!doc?.body?.insertAdjacentHTML)return node;
  doc.body.insertAdjacentHTML('beforeend','<div class="m26-client-guided-welcome-presence" data-m26-client-guided-welcome-presence data-m26-client-guide-state="idle" aria-hidden="true"><img src="/public/isotipo-iberfit.png" alt="" draggable="false"></div>');
  return doc.querySelector?.('[data-m26-client-guided-welcome-presence]')||null;
}
function position(node,target,scope,{arriving=false}={}){
  if(!node||!target)return false;
  try{
    const rect=target.getBoundingClientRect?.();
    const width=Number(scope?.innerWidth||0);
    const height=Number(scope?.innerHeight||0);
    if(!rect||!width||!height)return false;
    const mobile=width<=690;
    const size=mobile?61:68;
    const margin=mobile?10:14;
    const gap=mobile?8:12;
    const bottomReserve=mobile?112:margin;
    const outside=Number(rect.bottom||0)<margin||Number(rect.top||0)>height-bottomReserve||Number(rect.right||0)<0||Number(rect.left||0)>width;
    if(outside){node.classList?.remove?.('is-visible','is-arriving');return false;}
    const left=Math.min(width-size-margin,Math.max(margin,Number(rect.right||0)-size));
    const preferredTop=Number(rect.top||0)-size-gap;
    const top=preferredTop>=margin?preferredTop:Math.min(height-size-bottomReserve,Number(rect.bottom||0)+gap);
    node.style.left=`${Math.round(left)}px`;
    node.style.top=`${Math.round(Math.max(margin,top))}px`;
    node.classList?.add?.('is-visible');
    if(arriving&&!reduced(scope)){
      node.classList?.remove?.('is-arriving');
      void node.offsetWidth;
      node.classList?.add?.('is-arriving');
    }else node.classList?.remove?.('is-arriving');
    return true;
  }catch{return false;}
}

export function createClientGuidedWelcomeController({
  root,
  identityProvider=()=>({}),
  storage,
  scope=globalThis,
}={}){
  if(!root?.addEventListener)throw new Error('M26_CLIENT_GUIDED_WELCOME_ROOT_REQUIRED');
  const doc=root.ownerDocument||scope?.document||globalThis.document;
  const resolvedStorage=storageOf(storage,scope);
  const memory=new Map();
  let mounted=false;
  let scheduled=false;
  let activeStep=null;
  let activeTarget=null;
  let dialog=null;
  let presence=null;
  let positionFrame=null;
  let previousFocus=null;
  let navigationPending=null;

  function identity(){
    const value=identityProvider?.()||{};
    const userId=text(value.userId,240);
    const role=text(value.role,40).toLowerCase();
    const key=clientGuidedWelcomeScopeKey({userId,role});
    return key?{key,userId,role}:null;
  }
  function raw(key){try{return resolvedStorage?.getItem?.(key)||null;}catch{return null;}}
  function read(ctx){
    if(!ctx)return normalizeClientGuidedWelcomeState({});
    const stored=raw(ctx.key);
    if(stored){
      try{return normalizeClientGuidedWelcomeState(JSON.parse(stored));}catch{}
    }
    if(memory.has(ctx.key))return normalizeClientGuidedWelcomeState(memory.get(ctx.key));
    const seeded=clientGuidedWelcomeLegacySeed({storage:resolvedStorage,userId:ctx.userId});
    write(ctx,seeded);
    return seeded;
  }
  function write(ctx,value){
    if(!ctx?.key)return false;
    const safe=normalizeClientGuidedWelcomeState(value);
    memory.set(ctx.key,safe);
    try{resolvedStorage?.setItem?.(ctx.key,JSON.stringify(safe));}catch{}
    return true;
  }
  function setContextGuideLaunchersHidden(hidden){
    for(const launcher of root.querySelectorAll?.('[data-m26-client-context-guide-open]')||[]){
      if(hidden)launcher.setAttribute?.('hidden','');
      else launcher.removeAttribute?.('hidden');
    }
  }
  function close({restoreFocus=true,preservePresence=false}={}){
    activeTarget?.classList?.remove?.('m26-client-guided-welcome-target');
    activeTarget?.removeAttribute?.('data-m26-client-guided-welcome-target-active');
    activeTarget=null;
    dialog?.remove?.();
    dialog=null;
    activeStep=null;
    if(!preservePresence)presence?.classList?.remove?.('is-visible','is-arriving');
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
  function deactivate(){
    root.removeAttribute?.('data-m26-client-guided-welcome-active');
    navigationPending=null;
  }
  function pause(ctx){
    const state=read(ctx);
    if(state.status==='completed'||state.status==='skipped')return false;
    write(ctx,{...state,status:'paused'});
    deactivate();
    setContextGuideLaunchersHidden(false);
    close();
    return true;
  }
  function complete(ctx){
    const state=read(ctx);
    write(ctx,{...state,status:'completed',completedVersion:CLIENT_GUIDED_WELCOME_VERSION,stepIndex:STEPS.length-1});
    deactivate();
    setContextGuideLaunchersHidden(false);
    close({restoreFocus:false});
    try{
      const EventCtor=scope?.CustomEvent||globalThis.CustomEvent;
      if(typeof EventCtor==='function')root.dispatchEvent?.(new EventCtor('m26:client-guided-welcome-completed',{bubbles:true,detail:{version:CLIENT_GUIDED_WELCOME_VERSION}}));
    }catch{}
    return true;
  }
  function navigate(area){
    const current=currentArea(root);
    if(current===area){navigationPending=null;return true;}
    if(navigationPending===area)return true;
    const destination=visibleDestination(root,area);
    if(!destination)return false;
    navigationPending=area;
    close({restoreFocus:false,preservePresence:true});
    try{destination.click?.();}catch{navigationPending=null;return false;}
    return true;
  }
  function schedulePosition(){
    if(positionFrame!==null||!activeTarget)return;
    const run=()=>{
      positionFrame=null;
      if(dialog&&activeTarget){
        if(Number(scope?.innerWidth||0)<=690){
          dialog.style?.removeProperty?.('top');
          dialog.style?.removeProperty?.('left');
          dialog.style?.removeProperty?.('right');
          dialog.style?.removeProperty?.('bottom');
        }else{
          try{
            const rect=activeTarget.getBoundingClientRect?.();
            const box=dialog.getBoundingClientRect?.();
            const margin=16,gap=12;
            const boxWidth=Number(box?.width||416),boxHeight=Number(box?.height||230);
            const viewportWidth=Number(scope?.innerWidth||1200),viewportHeight=Number(scope?.innerHeight||800);
            let left=Math.min(viewportWidth-boxWidth-margin,Math.max(margin,Number(rect?.right||margin)-boxWidth));
            let top=Number(rect?.bottom||margin)+gap;
            if(top+boxHeight>viewportHeight-margin)top=Math.max(margin,Number(rect?.top||margin)-boxHeight-gap);
            dialog.style.left=`${Math.round(left)}px`;
            dialog.style.top=`${Math.round(top)}px`;
            dialog.style.right='auto';
            dialog.style.bottom='auto';
          }catch{}
        }
      }
      if(presence&&activeTarget)position(presence,activeTarget,scope);
    };
    if(typeof scope?.requestAnimationFrame==='function')positionFrame=scope.requestAnimationFrame(run);
    else queueMicrotask(run);
  }
  function show(step,{focus=true}={}){
    const target=targetFor(root,step);
    if(!step||!target)return false;
    ensureStyle(doc);
    close({restoreFocus:false,preservePresence:true});
    activeStep=step;
    activeTarget=target;
    previousFocus=focus?doc?.activeElement||null:null;
    target.classList?.add?.('m26-client-guided-welcome-target');
    target.setAttribute?.('data-m26-client-guided-welcome-target-active','true');
    if(!inViewport(target,scope)){
      try{target.scrollIntoView?.({block:'center',inline:'nearest',behavior:reduced(scope)?'auto':'smooth'});}catch{}
    }
    presence=presence||ensurePresence(doc);
    presence?.setAttribute?.('data-m26-client-guide-state',step.guideState||'idle');
    position(presence,target,scope,{arriving:!presence?.classList?.contains?.('is-visible')});
    doc?.body?.insertAdjacentHTML?.('beforeend',dialogHtml(step));
    dialog=doc?.querySelector?.('[data-m26-client-guided-welcome]')||null;
    schedulePosition();
    if(focus)queueMicrotask(()=>{try{dialog?.querySelector?.('[data-m26-client-guided-welcome-next]')?.focus?.({preventScroll:true});}catch{}});
    return Boolean(dialog);
  }
  function markStepContextSeen(step){
    if(!step?.seenAlso?.length)return;
    const value=identityProvider?.()||{};
    const userId=text(value.userId,240);
    if(!userId)return;
    const contextKey=`iberfit.m26.client-context-guide.v1:${hash(`${userId}|client`)}`;
    let context={};
    try{context=JSON.parse(resolvedStorage?.getItem?.(contextKey)||'{}')||{};}catch{}
    const seen=Array.from(new Set([...(Array.isArray(context.seenTipIds)?context.seenTipIds:[]),...step.seenAlso]));
    const safe={
      schemaVersion:'iberfit.client-contextual-guide.v1',
      seenTipIds:seen,
      dismissedTipIds:Array.isArray(context.dismissedTipIds)?context.dismissedTipIds:[],
      seenEventKeys:Array.isArray(context.seenEventKeys)?context.seenEventKeys:[],
      dismissedEventKeys:Array.isArray(context.dismissedEventKeys)?context.dismissedEventKeys:[],
      legacyMigrated:Boolean(context.legacyMigrated),
    };
    try{resolvedStorage?.setItem?.(contextKey,JSON.stringify(safe));}catch{}
  }
  function advance(ctx){
    const state=read(ctx);
    const step=clientGuidedWelcomeStep(state.stepIndex);
    markStepContextSeen(step);
    if(state.stepIndex>=STEPS.length-1)return complete(ctx);
    const nextIndex=state.stepIndex+1;
    const next=clientGuidedWelcomeStep(nextIndex);
    write(ctx,{...state,status:'in-progress',stepIndex:nextIndex});
    root.setAttribute?.('data-m26-client-guided-welcome-active','true');
    if(!navigate(next.area)){
      write(ctx,{...state,status:'paused',stepIndex:nextIndex});
      deactivate();
      close();
      return false;
    }
    refresh();
    return true;
  }
  function start(ctx,{manual=false}={}){
    const state=read(ctx);
    if(state.status==='completed'||state.status==='skipped')return false;
    const nextStatus='in-progress';
    write(ctx,{...state,status:nextStatus,stepIndex:state.stepIndex||0});
    root.setAttribute?.('data-m26-client-guided-welcome-active','true');
    setContextGuideLaunchersHidden(true);
    const step=clientGuidedWelcomeStep(state.stepIndex||0);
    if(!navigate(step.area)){
      pause(ctx);
      return false;
    }
    if(currentArea(root)===step.area)show(step,{focus:manual});
    return true;
  }
  function now(){
    scheduled=false;
    if(!mounted)return;
    const ctx=identity();
    if(!ctx){
      deactivate();
      close({restoreFocus:false});
      return;
    }
    const state=read(ctx);
    if(suppressed(root)){
      if(state.status==='in-progress')write(ctx,{...state,status:'paused'});
      deactivate();
      close({restoreFocus:false});
      return;
    }
    if(state.status==='never'){
      start(ctx);
      return;
    }
    if(state.status!=='in-progress'){
      deactivate();
      close({restoreFocus:false});
      return;
    }
    root.setAttribute?.('data-m26-client-guided-welcome-active','true');
    setContextGuideLaunchersHidden(true);
    const step=clientGuidedWelcomeStep(state.stepIndex);
    const current=currentArea(root);
    if(navigationPending&&current===navigationPending)navigationPending=null;
    if(current!==step.area){
      navigate(step.area);
      return;
    }
    const resolved=targetFor(root,step);
    if(!resolved){
      if(state.stepIndex<STEPS.length-1){
        write(ctx,{...state,stepIndex:state.stepIndex+1});
        refresh();
      }else complete(ctx);
      return;
    }
    if(!dialog||activeStep?.id!==step.id)show(step,{focus:step.id==='welcome-finish'});
    else if(resolved!==activeTarget){
      activeTarget?.classList?.remove?.('m26-client-guided-welcome-target');
      activeTarget?.removeAttribute?.('data-m26-client-guided-welcome-target-active');
      activeTarget=resolved;
      activeTarget.classList?.add?.('m26-client-guided-welcome-target');
      activeTarget.setAttribute?.('data-m26-client-guided-welcome-target-active','true');
      schedulePosition();
    }else schedulePosition();
  }
  function refresh(){
    if(scheduled||!mounted)return;
    scheduled=true;
    queueMicrotask(now);
  }
  function click(event){
    const ctx=identity();
    if(!ctx)return;
    if(event.target?.closest?.('[data-m26-client-context-guide-open]')){
      const state=read(ctx);
      if(state.status!=='completed'&&state.status!=='skipped'){
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        start(ctx,{manual:true});
        return;
      }
    }
    if(event.target?.closest?.('[data-m26-client-guided-welcome-next]')){
      event.preventDefault?.();
      advance(ctx);
      return;
    }
    if(event.target?.closest?.('[data-m26-client-guided-welcome-pause]')){
      event.preventDefault?.();
      pause(ctx);
    }
  }
  function key(event){
    if(event?.key!=='Escape'||!dialog)return;
    event.preventDefault?.();
    const ctx=identity();
    if(ctx)pause(ctx);
  }

  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      doc?.addEventListener?.('click',click);
      doc?.addEventListener?.('keydown',key);
      root.addEventListener?.('m26:shell-rendered',refresh);
      scope?.addEventListener?.('pageshow',refresh);
      scope?.addEventListener?.('resize',schedulePosition,{passive:true});
      scope?.addEventListener?.('scroll',schedulePosition,{passive:true,capture:true});
      ensureStyle(doc);
      refresh();
    },
    refresh,
    open(){
      if(suppressed(root))return false;
      const ctx=identity();
      return ctx?start(ctx,{manual:true}):false;
    },
    destroy(){
      if(!mounted)return;
      mounted=false;
      scheduled=false;
      doc?.removeEventListener?.('click',click);
      doc?.removeEventListener?.('keydown',key);
      root.removeEventListener?.('m26:shell-rendered',refresh);
      scope?.removeEventListener?.('pageshow',refresh);
      scope?.removeEventListener?.('resize',schedulePosition);
      scope?.removeEventListener?.('scroll',schedulePosition,true);
      deactivate();
      close({restoreFocus:false});
      presence?.remove?.();
      presence=null;
      doc?.querySelector?.('[data-m26-client-guided-welcome-style]')?.remove?.();
    },
  });
}

export const __clientGuidedWelcomeInternals=Object.freeze({
  STEPS,
  SOURCE_COPY,
  STATUS,
  currentArea,
  visibleDestination,
  targetFor,
  suppressed,
  hash,
});
