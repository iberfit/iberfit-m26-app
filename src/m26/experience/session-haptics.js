export const SESSION_HAPTICS_STORAGE_KEY='iberfit:m26:session-haptics:v1';

const PATTERNS=Object.freeze({
  test:Object.freeze([18]),
  setComplete:Object.freeze([20]),
  restComplete:Object.freeze([26,34,26]),
});
const SESSION_SELECTION_NOTICE_ID='m26-session-selection-required';
const SESSION_SELECTION_MESSAGE='Hay varias sesiones publicadas. Elige una sesión concreta en la lista antes de iniciar.';
const SESSION_PUBLISHED_REQUIRED_MESSAGE='No hay ninguna sesión publicada lista para iniciar. Publica una sesión o elige otra acción.';
const EXPLICIT_SESSION_START_SELECTOR='[data-workflow-action="start-published-session"][data-entity-id]';
const COACH_PUBLISHED_SESSION_SELECTOR='[data-workflow-action="manage-publication"][data-publication-entity="session"][data-publication-action="withdraw"][data-entity-id]';

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

function sessionStartEntityId(node){
  return String(node?.getAttribute?.('data-entity-id')||node?.dataset?.entityId||'').trim();
}

function nodesFor(root,selector){
  return [...(root?.querySelectorAll?.(selector)||[])];
}

export function publishedSessionStartIds(root){
  const nodes=[
    ...nodesFor(root,EXPLICIT_SESSION_START_SELECTOR),
    ...nodesFor(root,COACH_PUBLISHED_SESSION_SELECTOR),
  ];
  return Object.freeze([...new Set(nodes.map(sessionStartEntityId).filter(Boolean))]);
}

export function sessionStartGuardReason(root,button){
  if(!button)return null;
  const action=String(button?.getAttribute?.('data-workflow-action')||button?.dataset?.workflowAction||'').trim();
  if(action!=='start-published-session'||sessionStartEntityId(button))return null;
  const count=publishedSessionStartIds(root).length;
  if(count===0)return 'published-required';
  if(count>1)return 'selection-required';
  return null;
}

export function sessionStartRequiresExplicitSelection(root,button){
  return sessionStartGuardReason(root,button)==='selection-required';
}

function clearSessionSelectionNotice(root,button){
  root?.querySelector?.(`[data-session-selection-guard="${SESSION_SELECTION_NOTICE_ID}"]`)?.remove?.();
  if(button?.getAttribute?.('aria-describedby')===SESSION_SELECTION_NOTICE_ID)button.removeAttribute?.('aria-describedby');
}

function announceSessionStartGuard(root,button,message){
  const documentLike=button?.ownerDocument||root?.ownerDocument;
  if(!documentLike?.createElement)return false;
  let notice=root?.querySelector?.(`[data-session-selection-guard="${SESSION_SELECTION_NOTICE_ID}"]`);
  if(!notice){
    notice=documentLike.createElement('p');
    notice.id=SESSION_SELECTION_NOTICE_ID;
    notice.className='m26-field-help';
    notice.setAttribute('data-session-selection-guard',SESSION_SELECTION_NOTICE_ID);
    notice.setAttribute('role','status');
    notice.setAttribute('aria-live','polite');
    const host=button?.parentElement||button;
    host?.insertAdjacentElement?.('afterend',notice);
  }
  notice.textContent=String(message||'');
  button?.setAttribute?.('aria-describedby',SESSION_SELECTION_NOTICE_ID);
  button?.focus?.({preventScroll:true});
  return true;
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

  function onClick(event){
    const button=event.target?.closest?.('[data-workflow-action="start-published-session"]');
    if(!button)return;
    const reason=sessionStartGuardReason(root,button);
    if(!reason){
      clearSessionSelectionNotice(root,button);
      return;
    }
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
    announceSessionStartGuard(
      root,
      button,
      reason==='selection-required'?SESSION_SELECTION_MESSAGE:SESSION_PUBLISHED_REQUIRED_MESSAGE,
    );
  }

  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      root.addEventListener('click',onClick,true);
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
      root.removeEventListener('click',onClick,true);
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
