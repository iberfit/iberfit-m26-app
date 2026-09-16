import {iberfitSurfaceTranslate} from '../ui/i18n-surface.js';
import {clientGenieVisualMarkup} from './client-genie-visual.js';

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
  width:min(27rem,calc(100vw - 2rem));
  padding:1.18rem 1.25rem 1.08rem;
  border:1px solid rgba(205,166,80,.58);
  border-radius:1.55rem;
  color:#10231b;
  background:
    linear-gradient(145deg,rgba(255,251,236,.975),rgba(245,234,202,.94)),
    rgba(255,248,220,.96);
  box-shadow:
    0 24px 70px rgba(0,0,0,.34),
    0 0 0 1px rgba(255,255,255,.38) inset,
    0 0 34px rgba(197,160,89,.13);
  backdrop-filter:blur(16px) saturate(1.08);
  -webkit-backdrop-filter:blur(16px) saturate(1.08);
  overflow:visible;
  transform-origin:50% 100%;
}
.m26-client-guided-welcome::before{
  content:'';
  position:absolute;
  z-index:-1;
  width:2.2rem;
  height:2.2rem;
  right:-.66rem;
  bottom:1.15rem;
  border-right:1px solid rgba(205,166,80,.58);
  border-bottom:1px solid rgba(205,166,80,.58);
  background:linear-gradient(135deg,rgba(248,238,210,.98),rgba(255,249,230,.96));
  transform:rotate(-45deg) skew(7deg,7deg);
  border-radius:0 0 .65rem 0;
  box-shadow:6px 8px 18px rgba(0,0,0,.08);
}
.m26-client-guided-welcome[data-m26-client-guide-side="left"]::before{
  left:-.66rem;
  right:auto;
  transform:rotate(135deg) skew(7deg,7deg);
}
.m26-client-guided-welcome::after{
  content:'';
  position:absolute;
  inset:-1px;
  pointer-events:none;
  border-radius:inherit;
  background:linear-gradient(120deg,rgba(255,255,255,.44),transparent 34%,transparent 70%,rgba(197,160,89,.1));
  mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  mask-composite:exclude;
  -webkit-mask-composite:xor;
  padding:1px;
}
.m26-client-guided-welcome-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.9rem}
.m26-client-guided-welcome .m26-eyebrow{
  margin:0 0 .32rem;
  color:#8c6827;
  font-size:.69rem;
  font-weight:750;
  letter-spacing:.14em;
  text-transform:uppercase;
}
.m26-client-guided-welcome h2{
  margin:0;
  color:#10231b;
  font-family:var(--iberfit-font-display,Georgia,serif);
  font-size:clamp(1.18rem,2vw,1.42rem);
  line-height:1.16;
  letter-spacing:-.022em;
}
.m26-client-guided-welcome-copy{
  margin:.72rem 0 0;
  max-width:38ch;
  color:#385047;
  line-height:1.55;
  font-size:.94rem;
}
.m26-client-guided-welcome .m26-icon-button{
  flex:0 0 auto;
  color:#6f5b2f;
  border:1px solid rgba(122,94,41,.22);
  background:rgba(255,255,255,.3);
}
.m26-client-guided-welcome-actions{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:.62rem;
  margin-top:1rem;
  flex-wrap:wrap;
}
.m26-client-guided-welcome-actions button,.m26-client-guided-welcome-head button{min-height:44px;min-width:44px}
.m26-client-guided-welcome .m26-primary-action{
  border:1px solid #bb8d37;
  color:#14251e;
  background:linear-gradient(180deg,#f1d58e,#d5ad58);
  box-shadow:0 8px 20px rgba(134,94,25,.18),inset 0 1px 0 rgba(255,255,255,.55);
}
.m26-client-guided-welcome .m26-primary-action:hover{filter:brightness(1.025)}
.m26-client-guided-welcome .m26-text-action{
  color:#53675f;
  background:transparent;
}
.m26-client-guided-welcome-target{
  position:relative;
  z-index:1220!important;
  outline:2px solid rgba(233,196,111,.95);
  outline-offset:5px;
  border-radius:max(.55rem,var(--iberfit-radius-md,.75rem));
  box-shadow:
    0 0 0 9999px rgba(4,18,13,.72),
    0 0 0 1px rgba(255,248,220,.23),
    0 0 34px rgba(226,185,91,.26)!important;
  scroll-margin:7rem 1rem;
  isolation:isolate;
}
.m26-client-guided-welcome-target::after{
  content:'';
  position:absolute;
  inset:-6px;
  pointer-events:none;
  border-radius:inherit;
  box-shadow:0 0 26px rgba(238,205,125,.18);
  animation:m26-client-guide-target-breathe 2.2s ease-in-out infinite;
}
.m26-client-guided-welcome-presence{
  position:fixed;
  z-index:1232;
  left:1rem;
  top:1rem;
  width:8.55rem;
  height:10.7rem;
  display:grid;
  place-items:center;
  pointer-events:none;
  opacity:0;
  transform:translateZ(0) scale(.93);
  transition:left 300ms cubic-bezier(.22,.8,.24,1),top 300ms cubic-bezier(.22,.8,.24,1),opacity 170ms ease,transform 230ms ease;
  will-change:left,top,opacity,transform;
  contain:layout paint style;
}
.m26-client-guided-welcome-presence::before{
  content:'';
  position:absolute;
  inset:16% -2% 0;
  border-radius:50%;
  background:radial-gradient(ellipse at 50% 45%,rgba(255,248,220,.16),rgba(197,160,89,.055) 47%,transparent 72%);
  filter:blur(2px);
}
.m26-client-guided-welcome-presence::after{
  content:'';
  position:absolute;
  width:4.6rem;
  height:1.05rem;
  left:50%;
  bottom:.12rem;
  transform:translateX(-50%);
  border-radius:50%;
  background:radial-gradient(ellipse,rgba(222,182,85,.22),transparent 70%);
  filter:blur(4px);
}
.m26-client-genie{
  position:relative;
  z-index:1;
  display:block;
  width:100%;
  height:100%;
  overflow:visible;
  filter:
    drop-shadow(0 12px 20px rgba(0,0,0,.34))
    drop-shadow(0 0 10px rgba(197,160,89,.18));
}
.m26-client-guided-welcome-presence[data-m26-client-guide-side="right"] .m26-client-genie{
  transform:scaleX(-1);
}
.m26-client-genie .m26-genie__body{
  transform-origin:50% 58%;
  animation:m26-client-genie-float 2.75s ease-in-out infinite;
}
.m26-client-genie .m26-genie__flame{
  transform-box:fill-box;
  transform-origin:50% 88%;
  animation:m26-client-genie-flame 2.05s ease-in-out infinite;
}
.m26-client-genie .m26-genie__tail{
  transform-box:fill-box;
  transform-origin:50% 12%;
  animation:m26-client-genie-tail 3.15s ease-in-out infinite;
}
.m26-client-genie .m26-genie__core{
  transform-box:fill-box;
  transform-origin:center;
  animation:m26-client-genie-core 2.35s ease-in-out infinite;
}
.m26-client-genie .m26-genie__arm{
  transform-box:fill-box;
  transition:transform 420ms cubic-bezier(.2,.8,.2,1);
}
.m26-client-genie .m26-genie__beam,
.m26-client-genie .m26-genie__particles,
.m26-client-genie .m26-genie__alert{
  opacity:0;
  transition:opacity 180ms ease;
}
.m26-client-guided-welcome-presence[data-m26-client-guide-state="pointing"] .m26-genie__arm--right{
  transform-origin:34% 12%;
  transform:rotate(-39deg) translate(1.3rem,-.1rem);
}
.m26-client-guided-welcome-presence[data-m26-client-guide-state="pointing"] .m26-genie__beam{
  opacity:1;
  animation:m26-client-genie-beam 1.4s ease-in-out infinite;
}
.m26-client-guided-welcome-presence[data-m26-client-guide-state="success"] .m26-genie__arm--left{
  transform-origin:66% 12%;
  transform:rotate(73deg) translate(-.1rem,-1rem);
}
.m26-client-guided-welcome-presence[data-m26-client-guide-state="success"] .m26-genie__arm--right{
  transform-origin:34% 12%;
  transform:rotate(-73deg) translate(.1rem,-1rem);
}
.m26-client-guided-welcome-presence[data-m26-client-guide-state="success"] .m26-genie__particles{
  opacity:1;
  animation:m26-client-genie-burst 1.65s ease-out infinite;
}
.m26-client-guided-welcome-presence[data-m26-client-guide-state="success"] .m26-genie__core{
  animation:m26-client-genie-core-success 1.2s ease-in-out infinite;
}
.m26-client-guided-welcome-presence[data-m26-client-guide-state="success"]::before{
  background:radial-gradient(ellipse at 50% 48%,rgba(255,248,220,.18),rgba(255,215,0,.075) 48%,transparent 74%);
}
.m26-client-guided-welcome-presence[data-m26-client-guide-state="alert"] .m26-genie__arm--right{
  transform-origin:34% 12%;
  transform:rotate(-56deg) translate(.55rem,-.35rem);
}
.m26-client-guided-welcome-presence[data-m26-client-guide-state="alert"] .m26-genie__alert{
  opacity:1;
  animation:m26-client-genie-alert 1.55s ease-in-out infinite;
}
.m26-client-guided-welcome-presence[data-m26-client-guide-state="alert"]::before{
  background:radial-gradient(ellipse at 50% 48%,rgba(255,191,0,.14),rgba(197,160,89,.045) 48%,transparent 72%);
}
.m26-client-guided-welcome-presence.is-visible{opacity:1;transform:translateZ(0) scale(1)}
.m26-client-guided-welcome-presence.is-arriving{animation:m26-client-guided-welcome-arrive 520ms cubic-bezier(.2,.8,.2,1) both}
@keyframes m26-client-guided-welcome-arrive{
  0%{opacity:0;transform:translateZ(0) translateY(8px) scale(.84)}
  58%{opacity:1;transform:translateZ(0) translateY(-2px) scale(1.025)}
  100%{opacity:1;transform:translateZ(0) translateY(0) scale(1)}
}
@keyframes m26-client-guide-target-breathe{0%,100%{opacity:.65}50%{opacity:1}}
@keyframes m26-client-genie-float{0%,100%{transform:translateY(2px)}50%{transform:translateY(-6px)}}
@keyframes m26-client-genie-flame{0%,100%{transform:rotate(-1deg) scaleY(.99)}50%{transform:rotate(1.7deg) scaleY(1.025)}}
@keyframes m26-client-genie-tail{0%,100%{transform:rotate(-.4deg)}50%{transform:rotate(1.35deg)}}
@keyframes m26-client-genie-core{0%,100%{transform:scale(.95);opacity:.84}50%{transform:scale(1.065);opacity:1}}
@keyframes m26-client-genie-core-success{0%,100%{transform:scale(.96)}50%{transform:scale(1.17)}}
@keyframes m26-client-genie-beam{0%,100%{opacity:.38}50%{opacity:1}}
@keyframes m26-client-genie-burst{0%{transform:scale(.82);opacity:0}30%{opacity:1}100%{transform:scale(1.15);opacity:0}}
@keyframes m26-client-genie-alert{0%,100%{transform:translateY(0);opacity:.68}50%{transform:translateY(-4px);opacity:1}}
@media(max-width:690px){
  .m26-client-guided-welcome{
    left:.7rem!important;
    right:.7rem!important;
    top:auto!important;
    bottom:calc(1rem + env(safe-area-inset-bottom))!important;
    width:auto;
    max-height:min(40vh,21rem);
    overflow:visible;
    border-radius:1.3rem;
    padding:.9rem .95rem .85rem;
    box-shadow:
      0 18px 48px rgba(0,0,0,.27),
      0 0 0 1px rgba(255,255,255,.34) inset,
      0 0 26px rgba(197,160,89,.1);
  }
  .m26-client-guided-welcome::before{
    left:auto!important;
    right:1.25rem!important;
    top:-.58rem;
    bottom:auto;
    transform:rotate(225deg) skew(7deg,7deg)!important;
  }
  .m26-client-guided-welcome h2{font-size:1.12rem;line-height:1.14}
  .m26-client-guided-welcome-copy{margin-top:.58rem;font-size:.86rem;line-height:1.43}
  .m26-client-guided-welcome-actions{margin-top:.62rem;gap:.5rem}
  .m26-client-guided-welcome-target{
    box-shadow:
      0 0 0 9999px rgba(4,18,13,.52),
      0 0 0 1px rgba(255,248,220,.23),
      0 0 30px rgba(226,185,91,.24)!important;
  }
  .m26-client-guided-welcome-presence{
    width:6rem;
    height:7.6rem;
  }
}
@media(prefers-reduced-motion:reduce){
  .m26-client-guided-welcome,.m26-client-guided-welcome-target,.m26-client-guided-welcome-presence{
    scroll-behavior:auto!important;
    transition:none!important;
    animation:none!important;
  }
  .m26-client-guided-welcome-presence *,
  .m26-client-guided-welcome-target::after{
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
  return `<aside class="m26-client-guided-welcome" data-m26-client-guided-welcome data-m26-client-guide-side="right" role="dialog" aria-modal="false" aria-labelledby="m26-client-guided-welcome-title" aria-describedby="m26-client-guided-welcome-copy"><div class="m26-client-guided-welcome-head"><div><p class="m26-eyebrow">${esc(tr('eyebrow','Tu guía IBERFIT'))}</p><h2 id="m26-client-guided-welcome-title">${esc(tr(`${copyId}.title`,copyId))}</h2></div><button type="button" class="m26-icon-button" data-m26-client-guided-welcome-pause aria-label="${esc(tr('close','Cerrar por ahora'))}">×</button></div><p class="m26-client-guided-welcome-copy" id="m26-client-guided-welcome-copy">${esc(tr(`${copyId}.body`,''))}</p><div class="m26-client-guided-welcome-actions">${pauseAction}<button type="button" class="m26-primary-action" data-m26-client-guided-welcome-next>${esc(tr(`${copyId}.cta`,'Seguir'))}</button></div></aside>`;
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
  doc.body.insertAdjacentHTML('beforeend',`<div class="m26-client-guided-welcome-presence" data-m26-client-guided-welcome-presence data-m26-client-guide-state="idle" aria-hidden="true">${clientGenieVisualMarkup()}</div>`);
  return doc.querySelector?.('[data-m26-client-guided-welcome-presence]')||null;
}
function position(node,target,scope,{arriving=false,dialog=null}={}){
  if(!node||!target)return false;
  try{
    const rect=target.getBoundingClientRect?.();
    const width=Number(scope?.innerWidth||0);
    const height=Number(scope?.innerHeight||0);
    if(!rect||!width||!height)return false;
    const mobile=width<=690;
    const margin=mobile?10:14;
    const bottomReserve=mobile?96:margin;
    const presenceRect=node.getBoundingClientRect?.();
    const nodeWidth=Math.max(1,Number(presenceRect?.width||(mobile?103:137)));
    const nodeHeight=Math.max(1,Number(presenceRect?.height||(mobile?130:171)));
    const outside=Number(rect.bottom||0)<margin||Number(rect.top||0)>height-bottomReserve||Number(rect.right||0)<0||Number(rect.left||0)>width;
    if(outside){node.classList?.remove?.('is-visible','is-arriving');return false;}

    let side='right';
    let left=margin;
    let top=margin;
    if(mobile){
      left=Math.min(width-nodeWidth-margin,Math.max(margin,width-nodeWidth-18));
      const dialogRect=dialog?.getBoundingClientRect?.();
      top=Math.max(margin,Number(dialogRect?.top||height*.56)-nodeHeight+10);
    }else{
      const dialogRect=dialog?.getBoundingClientRect?.();
      const dLeft=Number(dialogRect?.left||rect.left);
      const dRight=Number(dialogRect?.right||rect.right);
      const dTop=Number(dialogRect?.top||rect.top);
      const dBottom=Number(dialogRect?.bottom||rect.bottom);
      const roomRight=width-dRight-margin;
      const roomLeft=dLeft-margin;
      side=roomRight>=nodeWidth+12||roomRight>=roomLeft?'right':'left';
      left=side==='right'
        ?Math.min(width-nodeWidth-margin,dRight+10)
        :Math.max(margin,dLeft-nodeWidth-10);
      top=Math.min(height-nodeHeight-bottomReserve,Math.max(margin,dBottom-nodeHeight*.72));
    }

    node.setAttribute?.('data-m26-client-guide-side',side);
    dialog?.setAttribute?.('data-m26-client-guide-side',side);
    node.style.left=`${Math.round(left)}px`;
    node.style.top=`${Math.round(top)}px`;
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
            const margin=16,gap=14;
            const boxWidth=Number(box?.width||432),boxHeight=Number(box?.height||240);
            const viewportWidth=Number(scope?.innerWidth||1200),viewportHeight=Number(scope?.innerHeight||800);
            let left=Math.min(viewportWidth-boxWidth-margin,Math.max(margin,Number(rect?.left||margin)));
            let top=Number(rect?.bottom||margin)+gap;
            if(top+boxHeight>viewportHeight-margin)top=Math.max(margin,Number(rect?.top||margin)-boxHeight-gap);
            if(left+boxWidth+128>viewportWidth-margin&&Number(rect?.right||0)-boxWidth-128>margin){
              left=Math.max(margin,Number(rect.right)-boxWidth);
            }
            dialog.style.left=`${Math.round(left)}px`;
            dialog.style.top=`${Math.round(top)}px`;
            dialog.style.right='auto';
            dialog.style.bottom='auto';
          }catch{}
        }
      }
      if(presence&&activeTarget)position(presence,activeTarget,scope,{dialog});
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
    position(presence,target,scope,{arriving:!presence?.classList?.contains?.('is-visible'),dialog});
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
