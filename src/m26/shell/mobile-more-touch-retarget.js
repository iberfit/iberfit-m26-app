const MOBILE_MORE_SELECTOR='details.m26-mobile-more';
const ROUTE_SELECTOR='[data-m26-area]';
const POINTER_TYPES=new Set(['touch','pen']);
const RETARGET_WINDOW_MS=700;
const GLOBAL_BRIDGE_KEY='__IBERFIT_M26_MOBILE_MORE_TOUCH_RETARGET_V1__';

function normalizePointerType(event){
  return String(event?.pointerType||'').trim().toLowerCase();
}

function mobileMoreRouteControl(node){
  const areaButton=node?.closest?.(ROUTE_SELECTOR)||null;
  if(!areaButton)return null;
  const details=areaButton.closest?.(MOBILE_MORE_SELECTOR)||null;
  return details?areaButton:null;
}

export function resolvePhysicalMobileMoreRoute(documentLike,event){
  const x=Number(event?.clientX);
  const y=Number(event?.clientY);
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const hit=documentLike?.elementFromPoint?.(x,y)||null;
  return mobileMoreRouteControl(hit);
}

export function createMobileMoreTouchRetargetBridge({
  documentLike=globalThis.document,
  setTimeoutFn=globalThis.setTimeout?.bind?.(globalThis),
  clearTimeoutFn=globalThis.clearTimeout?.bind?.(globalThis),
}={}){
  if(!documentLike?.addEventListener||!documentLike?.removeEventListener){
    throw new Error('M26_MOBILE_MORE_TOUCH_DOCUMENT_REQUIRED');
  }

  let gesture=null;
  let expiryTimer=null;
  let installed=false;

  function clearExpiry(){
    if(expiryTimer===null)return;
    clearTimeoutFn?.(expiryTimer);
    expiryTimer=null;
  }

  function clearGesture(){
    clearExpiry();
    gesture=null;
  }

  function armExpiry(){
    clearExpiry();
    if(typeof setTimeoutFn!=='function')return;
    expiryTimer=setTimeoutFn(()=>{
      expiryTimer=null;
      gesture=null;
    },RETARGET_WINDOW_MS);
  }

  function onPointerDown(event){
    clearGesture();
    if(event?.isPrimary===false)return;
    if(!POINTER_TYPES.has(normalizePointerType(event)))return;

    const button=resolvePhysicalMobileMoreRoute(documentLike,event);
    if(!button)return;
    const details=button.closest?.(MOBILE_MORE_SELECTOR)||null;
    if(!details||!(details.open||details.hasAttribute?.('open')))return;

    gesture={
      pointerId:event?.pointerId,
      button,
      details,
      armed:false,
    };
  }

  function onPointerUp(event){
    if(!gesture)return;
    if(event?.isPrimary===false){
      clearGesture();
      return;
    }
    if(event?.pointerId!==gesture.pointerId){
      clearGesture();
      return;
    }
    if(!POINTER_TYPES.has(normalizePointerType(event))){
      clearGesture();
      return;
    }

    const button=resolvePhysicalMobileMoreRoute(documentLike,event);
    if(button!==gesture.button){
      clearGesture();
      return;
    }

    gesture.armed=true;
    armExpiry();
  }

  function onPointerCancel(event){
    if(!gesture)return;
    if(event?.pointerId===undefined||event.pointerId===gesture.pointerId)clearGesture();
  }

  function onClick(event){
    const current=gesture;
    if(!current?.armed)return;

    // Synthetic .click() from the shell/controller is already the canonical
    // route path. Keep the gesture armed until the browser's trusted click
    // arrives so a later adjusted <summary> click can still be suppressed.
    if(event?.isTrusted!==true)return;

    const directRoute=mobileMoreRouteControl(event?.target);
    if(directRoute===current.button){
      clearGesture();
      return;
    }

    const targetDetails=event?.target?.closest?.(MOBILE_MORE_SELECTOR)||null;
    const button=current.button;
    const details=current.details;
    const validPhysicalGesture=
      targetDetails===details&&
      button?.isConnected!==false&&
      details?.contains?.(button)!==false;

    clearGesture();
    if(!validPhysicalGesture)return;

    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    button.click?.();
  }

  function install(){
    if(installed)return false;
    installed=true;
    documentLike.addEventListener('pointerdown',onPointerDown,{capture:true,passive:true});
    documentLike.addEventListener('pointerup',onPointerUp,{capture:true,passive:true});
    documentLike.addEventListener('pointercancel',onPointerCancel,{capture:true,passive:true});
    documentLike.addEventListener('click',onClick,{capture:true});
    return true;
  }

  function destroy(){
    if(!installed)return false;
    installed=false;
    clearGesture();
    documentLike.removeEventListener('pointerdown',onPointerDown,true);
    documentLike.removeEventListener('pointerup',onPointerUp,true);
    documentLike.removeEventListener('pointercancel',onPointerCancel,true);
    documentLike.removeEventListener('click',onClick,true);
    return true;
  }

  return Object.freeze({install,destroy});
}

export function installMobileMoreTouchRetargetBridge({globalLike=globalThis,documentLike=globalLike?.document}={}){
  if(!documentLike?.addEventListener)return null;
  const existing=globalLike?.[GLOBAL_BRIDGE_KEY];
  if(existing?.destroy)return existing;
  const bridge=createMobileMoreTouchRetargetBridge({documentLike});
  bridge.install();
  try{globalLike[GLOBAL_BRIDGE_KEY]=bridge;}catch{}
  return bridge;
}

installMobileMoreTouchRetargetBridge();
