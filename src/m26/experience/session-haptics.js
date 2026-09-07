export const SESSION_HAPTICS_STORAGE_KEY='iberfit:m26:session-haptics:v1';

const PATTERNS=Object.freeze({
  test:Object.freeze([18]),
  setComplete:Object.freeze([20]),
  restComplete:Object.freeze([26,34,26]),
});

function safeStorage(storage=globalThis.localStorage){
  try{return storage||null;}catch{return null;}
}

export function sessionHapticsEnabled(storage=globalThis.localStorage){
  try{return safeStorage(storage)?.getItem?.(SESSION_HAPTICS_STORAGE_KEY)==='true';}
  catch{return false;}
}

export function setSessionHapticsEnabled(enabled,storage=globalThis.localStorage){
  const next=Boolean(enabled);
  try{safeStorage(storage)?.setItem?.(SESSION_HAPTICS_STORAGE_KEY,next?'true':'false');}catch{}
  return next;
}

export function sessionHapticPattern(kind){
  return PATTERNS[kind]||PATTERNS.test;
}

export function triggerSessionHaptic(kind,{navigatorLike=globalThis.navigator,storage=globalThis.localStorage,force=false}={}){
  if(!force&&!sessionHapticsEnabled(storage))return false;
  if(typeof navigatorLike?.vibrate!=='function')return false;
  try{return navigatorLike.vibrate([...sessionHapticPattern(kind)])!==false;}
  catch{return false;}
}

function restSeconds(root){
  const raw=String(root?.querySelector?.('[data-session-rest]')?.textContent||'').trim();
  const match=raw.match(/^(\d+)\s*s$/u);
  return match?Number(match[1]):0;
}

function liveState(root){
  return String(root?.querySelector?.('[data-session-live-state]')?.getAttribute?.('data-session-live-state')||'').trim();
}

function ensureControl(root){
  const session=root?.querySelector?.('[data-session-live-state]');
  if(!session)return false;
  if(session.querySelector?.('[data-session-haptics-control]'))return true;
  if(typeof globalThis.navigator?.vibrate!=='function')return false;
  const host=session.querySelector?.('.m26-session-live-heading')||session.querySelector?.('.m26-session-live-hero')||session;
  const documentLike=host?.ownerDocument;
  if(!documentLike?.createElement)return false;
  const label=documentLike.createElement('label');
  label.className='m26-consent';
  label.setAttribute('data-session-haptics-control','');
  const input=documentLike.createElement('input');
  input.type='checkbox';
  input.checked=sessionHapticsEnabled();
  input.setAttribute('data-session-haptics-toggle','');
  input.setAttribute('aria-label','Activar vibración háptica durante el entrenamiento');
  const copy=documentLike.createElement('span');
  const strong=documentLike.createElement('strong');
  strong.textContent='Vibración háptica';
  const small=documentLike.createElement('small');
  small.textContent='Opcional en este dispositivo · confirma series y fin de descanso.';
  copy.append(strong,small);
  label.append(input,copy);
  host.append(label);
  return true;
}

export function createSessionHapticsController({root=globalThis.document?.querySelector?.('#app'),scope=globalThis}={}){
  if(!root?.addEventListener)throw new Error('M26_SESSION_HAPTICS_ROOT_REQUIRED');
  let mounted=false;
  let observer=null;
  let scheduled=false;
  let previousState='';
  let previousRest=0;

  function inspect(){
    scheduled=false;
    if(!mounted)return;
    ensureControl(root);
    const state=liveState(root);
    const rest=restSeconds(root);
    if(previousState){
      if(previousState==='active'&&state==='rest')triggerSessionHaptic('setComplete');
      if(previousRest>0&&rest===0&&(previousState==='rest'||state==='active'))triggerSessionHaptic('restComplete');
    }
    previousState=state;
    previousRest=rest;
  }

  function schedule(){
    if(!mounted||scheduled)return;
    scheduled=true;
    queueMicrotask(inspect);
  }

  function onChange(event){
    const toggle=event.target?.closest?.('[data-session-haptics-toggle]');
    if(!toggle)return;
    const enabled=setSessionHapticsEnabled(Boolean(toggle.checked));
    if(enabled)triggerSessionHaptic('test',{force:true});
  }

  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      root.addEventListener('change',onChange);
      if(typeof scope?.MutationObserver==='function'){
        observer=new scope.MutationObserver(schedule);
        observer.observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-session-live-state']});
      }
      schedule();
    },
    destroy(){
      if(!mounted)return;
      mounted=false;
      scheduled=false;
      root.removeEventListener('change',onChange);
      observer?.disconnect?.();
      observer=null;
      previousState='';
      previousRest=0;
    },
    refresh:schedule,
  });
}

if(typeof document!=='undefined'){
  const root=document.querySelector?.('#app');
  if(root){
    const controller=createSessionHapticsController({root,scope:globalThis});
    controller.mount();
    globalThis.__IBERFIT_M26_SESSION_HAPTICS__=controller;
  }
}
