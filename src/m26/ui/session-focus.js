const STYLE_ID='m27-session-focus-styles';
const ACTIVE_WAKE_STATES=new Set(['active','rest']);
const ROOT_STATE=new WeakMap();

const STYLES=`
.m27-session-focus-dock{display:none}
.m27-session-focus-active{--m27-session-focus-space:0px}
.m27-session-focus-meta{min-width:0;display:grid;gap:.08rem}
.m27-session-focus-meta>span{color:var(--m26-gold,#a98534);font-size:.58rem;font-weight:850;letter-spacing:.1em;text-transform:uppercase}
.m27-session-focus-meta>strong{overflow:hidden;color:var(--m26-text,#17231d);font-size:.82rem;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
.m27-session-focus-meta>small{overflow:hidden;color:var(--m26-text-muted,#6b675f);font-size:.64rem;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
.m27-session-focus-wake{display:inline-flex;align-items:center;gap:.3rem;width:max-content;margin-top:.08rem;color:var(--m26-text-muted,#6b675f);font-size:.58rem;font-weight:750}
.m27-session-focus-wake[hidden]{display:none}
.m27-session-focus-wake::before{content:'';width:.42rem;height:.42rem;border-radius:50%;background:var(--m26-gold,#a98534);box-shadow:0 0 0 .2rem rgba(169,133,52,.12)}
.m27-session-focus-dock>button{min-height:3.15rem;min-width:8.6rem;padding:.72rem 1rem;border:1px solid rgba(216,185,111,.48);border-radius:.86rem;background:linear-gradient(135deg,var(--m26-green,#153328),#0f271f);color:#fff;font:inherit;font-size:.78rem;font-weight:850;letter-spacing:-.01em;box-shadow:0 10px 26px rgba(8,25,19,.18);cursor:pointer}
.m27-session-focus-dock>button:disabled{cursor:not-allowed;opacity:.58}
.m27-session-focus-dock>button:focus-visible{outline:3px solid rgba(216,185,111,.42);outline-offset:3px}
@media (max-width:760px){
  .m27-session-focus-active{padding-bottom:6.7rem}
  .m27-session-focus-dock{position:fixed;z-index:80;left:max(.72rem,env(safe-area-inset-left));right:max(.72rem,env(safe-area-inset-right));bottom:calc(max(.65rem,env(safe-area-inset-bottom)) + 4.55rem);display:flex;align-items:center;justify-content:space-between;gap:.8rem;padding:.68rem .72rem;border:1px solid rgba(216,185,111,.28);border-radius:1rem;background:color-mix(in srgb,var(--m26-surface,#f7f1e7) 91%,transparent);box-shadow:0 18px 48px rgba(9,25,19,.2);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
}
@media (max-width:430px){
  .m27-session-focus-dock{gap:.58rem;padding:.62rem}
  .m27-session-focus-dock>button{min-width:7.6rem;max-width:48%;padding:.7rem .78rem}
  .m27-session-focus-meta>strong{font-size:.76rem}
}
@media (prefers-reduced-motion:reduce){.m27-session-focus-dock>button{scroll-behavior:auto}}
`;

function installStyles(document){
  if(!document?.head||document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=STYLES;
  document.head.appendChild(style);
}

function create(document,tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined&&text!==null)node.textContent=String(text);
  return node;
}

export function sessionFocusPlan({state='',hasCompleteSet=false,hasNext=false}={}){
  const normalized=String(state||'').trim().toLowerCase();
  if(normalized==='ready')return Object.freeze({state:normalized,targetSelector:'[data-session-action="start"]',fallbackLabel:'Iniciar sesión'});
  if(normalized==='feedback')return Object.freeze({state:normalized,targetSelector:'[data-session-action="finish"]',fallbackLabel:'Finalizar y guardar'});
  if(normalized==='paused')return Object.freeze({state:normalized,targetSelector:'[data-session-action="resume"]',fallbackLabel:'Reanudar sesión'});
  if(['active','rest'].includes(normalized)){
    if(hasCompleteSet)return Object.freeze({state:normalized,targetSelector:'[data-session-action="complete-set"]',fallbackLabel:'Completar serie'});
    if(hasNext)return Object.freeze({state:normalized,targetSelector:'[data-session-action="next"]',fallbackLabel:normalized==='rest'?'Continuar ahora':'Continuar'});
  }
  return null;
}

function stateFor(root){
  let state=ROOT_STATE.get(root);
  if(state)return state;
  const document=root.ownerDocument;
  state={wakeLock:null,wakeRequest:null,destroyed:false,enabled:false,refreshTimer:null,onClick:null,onVisibility:null};
  state.onClick=(event)=>{
    const proxy=event.target?.closest?.('[data-session-focus-proxy]');
    if(proxy&&root.contains?.(proxy)){
      event.preventDefault?.();
      const selector=String(proxy.dataset?.sessionFocusTarget||'').trim();
      const live=proxy.closest?.('[data-session-live-state]');
      const target=selector&&live?.querySelector?.(selector);
      if(target&&!target.disabled){
        target.focus?.({preventScroll:true});
        target.click?.();
      }
      scheduleRefresh(root,state);
      return;
    }
    const sessionAction=event.target?.closest?.('[data-session-action]');
    if(sessionAction&&root.contains?.(sessionAction))scheduleRefresh(root,state);
  };
  state.onVisibility=()=>{
    const live=root.querySelector?.('[data-session-live-state]');
    const liveState=String(live?.getAttribute?.('data-session-live-state')||'').trim().toLowerCase();
    void syncWakeLock(root,state.enabled&&ACTIVE_WAKE_STATES.has(liveState));
  };
  root.addEventListener?.('click',state.onClick);
  document?.addEventListener?.('visibilitychange',state.onVisibility);
  ROOT_STATE.set(root,state);
  return state;
}

function wakeBadge(root,active){
  const badge=root.querySelector?.('[data-session-focus-wake]');
  if(!badge)return;
  badge.hidden=!active;
  badge.textContent=active?'Pantalla activa durante el entrenamiento':'';
}

async function releaseWakeLock(root,state=ROOT_STATE.get(root)){
  if(!state)return;
  const sentinel=state.wakeLock;
  state.wakeLock=null;
  wakeBadge(root,false);
  if(!sentinel?.release)return;
  try{await sentinel.release();}catch{}
}

async function syncWakeLock(root,shouldKeepAwake){
  const state=stateFor(root);
  if(state.destroyed)return false;
  const document=root.ownerDocument;
  if(!shouldKeepAwake||document?.visibilityState==='hidden'){
    await releaseWakeLock(root,state);
    return false;
  }
  if(state.wakeLock){
    wakeBadge(root,true);
    return true;
  }
  if(state.wakeRequest)return state.wakeRequest;
  const navigator=document?.defaultView?.navigator||globalThis.navigator;
  if(typeof navigator?.wakeLock?.request!=='function')return false;

  state.wakeRequest=(async()=>{
    try{
      const sentinel=await navigator.wakeLock.request('screen');
      if(state.destroyed){
        try{await sentinel?.release?.();}catch{}
        return false;
      }
      state.wakeLock=sentinel;
      sentinel?.addEventListener?.('release',()=>{
        if(state.wakeLock===sentinel)state.wakeLock=null;
        wakeBadge(root,false);
      },{once:true});
      wakeBadge(root,true);
      return true;
    }catch{
      wakeBadge(root,false);
      return false;
    }finally{
      state.wakeRequest=null;
    }
  })();
  return state.wakeRequest;
}

function focusContext(live,state){
  const progress=live.querySelector?.('[data-session-progress-label]')?.textContent?.trim();
  const rest=live.querySelector?.('[data-session-rest]')?.textContent?.trim();
  const elapsed=live.querySelector?.('[data-session-elapsed]')?.textContent?.trim();
  const headline=progress||({ready:'Preparada para empezar',feedback:'Cierre post-sesión',paused:'Sesión pausada',rest:'Descanso activo',active:'Sesión en curso'})[state]||'Live Workout';
  const detail=state==='rest'&&rest&&rest!=='—'
    ?`Descanso ${rest}${elapsed?` · ${elapsed} activos`:''}`
    :elapsed
      ?`${elapsed} de tiempo activo`
      :'Acción principal siempre al alcance';
  return {headline,detail};
}

function removeDock(root){
  for(const live of root.querySelectorAll?.('[data-session-live-state]')||[])live.classList?.remove?.('m27-session-focus-active');
  root.querySelector?.('[data-session-focus-dock]')?.remove?.();
}

function buildDock(document,live,plan){
  const target=live.querySelector?.(plan.targetSelector);
  if(!target)return null;
  const context=focusContext(live,plan.state);
  const dock=create(document,'aside','m27-session-focus-dock');
  dock.setAttribute('data-session-focus-dock','true');
  dock.setAttribute('aria-label','Control rápido de la sesión');

  const meta=create(document,'div','m27-session-focus-meta');
  meta.append(
    create(document,'span','',plan.state==='rest'?'Descanso':'Live Workout'),
    create(document,'strong','',context.headline),
    create(document,'small','',context.detail),
  );
  const wake=create(document,'small','m27-session-focus-wake');
  wake.setAttribute('data-session-focus-wake','true');
  wake.hidden=true;
  meta.append(wake);

  const proxy=create(document,'button','',target.textContent?.trim()||plan.fallbackLabel);
  proxy.type='button';
  proxy.setAttribute('data-session-focus-proxy','true');
  proxy.dataset.sessionFocusTarget=plan.targetSelector;
  proxy.disabled=Boolean(target.disabled);
  proxy.setAttribute('aria-disabled',proxy.disabled?'true':'false');
  dock.append(meta,proxy);
  return dock;
}

function refreshSessionFocusDock(root){
  const state=ROOT_STATE.get(root);
  removeDock(root);
  if(!state?.enabled||state.destroyed){
    void releaseWakeLock(root,state);
    return false;
  }
  const live=root.querySelector?.('[data-session-live-state]');
  if(!live){
    void releaseWakeLock(root,state);
    return false;
  }
  const liveState=String(live.getAttribute('data-session-live-state')||'').trim().toLowerCase();
  const plan=sessionFocusPlan({
    state:liveState,
    hasCompleteSet:Boolean(live.querySelector('[data-session-action="complete-set"]')),
    hasNext:Boolean(live.querySelector('[data-session-action="next"]')),
  });
  void syncWakeLock(root,ACTIVE_WAKE_STATES.has(liveState));
  if(!plan)return false;

  installStyles(root.ownerDocument);
  const dock=buildDock(root.ownerDocument,live,plan);
  if(!dock)return false;
  live.classList.add('m27-session-focus-active');
  live.append(dock);
  wakeBadge(root,Boolean(state.wakeLock));
  return true;
}

function scheduleRefresh(root,state=ROOT_STATE.get(root)){
  if(!state?.enabled||state.destroyed)return;
  queueMicrotask(()=>refreshSessionFocusDock(root));
  const view=root.ownerDocument?.defaultView||globalThis;
  if(state.refreshTimer)view.clearTimeout?.(state.refreshTimer);
  state.refreshTimer=view.setTimeout?.(()=>{
    state.refreshTimer=null;
    refreshSessionFocusDock(root);
  },80)||null;
}

export function enhanceSessionFocus({root,viewModel}={}){
  if(!root?.querySelector||!root.ownerDocument)return false;
  const state=stateFor(root);
  const role=String(viewModel?.identity?.role||'').trim().toLowerCase();
  const area=String(viewModel?.activeArea||'').trim().toLowerCase();
  state.enabled=area==='sesion'&&['client','coach'].includes(role);
  return refreshSessionFocusDock(root);
}

export function teardownSessionFocus({root}={}){
  const state=root&&ROOT_STATE.get(root);
  if(!state)return false;
  state.destroyed=true;
  state.enabled=false;
  const view=root.ownerDocument?.defaultView||globalThis;
  if(state.refreshTimer)view.clearTimeout?.(state.refreshTimer);
  state.refreshTimer=null;
  root.removeEventListener?.('click',state.onClick);
  root.ownerDocument?.removeEventListener?.('visibilitychange',state.onVisibility);
  void releaseWakeLock(root,state);
  removeDock(root);
  ROOT_STATE.delete(root);
  return true;
}
