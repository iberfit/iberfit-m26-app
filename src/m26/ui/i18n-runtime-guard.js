const LANGUAGE_CONTROL_SELECTOR='[data-m26-ui-language],[data-m26-ui-locale]';
const INSTALLED=new WeakMap();

function now(){
  try{return Number(globalThis?.performance?.now?.())||Date.now();}
  catch{return Date.now();}
}

function scheduleAfterPaint(callback){
  const windowLike=globalThis?.window||null;
  if(typeof windowLike?.requestAnimationFrame==='function'){
    return windowLike.requestAnimationFrame(()=>callback());
  }
  return globalThis.setTimeout?.(callback,0);
}

function matchingControl(target){
  return target?.closest?.(LANGUAGE_CONTROL_SELECTOR)||null;
}

function controls(root){
  return [...(root?.querySelectorAll?.(LANGUAGE_CONTROL_SELECTOR)||[])];
}

function setBusy(root,busy){
  if(root?.dataset){
    if(busy)root.dataset.m26I18nSwitching='true';
    else delete root.dataset.m26I18nSwitching;
  }
  for(const control of controls(root)){
    if(busy)control.setAttribute?.('aria-busy','true');
    else control.removeAttribute?.('aria-busy');
  }
}

function emit(root,name,detail){
  const EventLike=root?.ownerDocument?.defaultView?.CustomEvent||globalThis?.CustomEvent;
  if(typeof EventLike!=='function'||!root?.dispatchEvent)return false;
  try{
    root.dispatchEvent(new EventLike(name,{bubbles:false,detail}));
    return true;
  }catch{
    return false;
  }
}

export function installIberfitLanguageSwitchRuntimeGuard(
  root,
  {
    installSurfaceI18n,
    schedule=scheduleAfterPaint,
  }={}
){
  if(!root?.addEventListener)throw new Error('M26_I18N_RUNTIME_ROOT_REQUIRED');
  if(typeof installSurfaceI18n!=='function')throw new Error('M26_I18N_RUNTIME_INSTALLER_REQUIRED');

  const existing=INSTALLED.get(root);
  if(existing)return existing;

  let generation=0;
  let disconnected=false;
  let surfaceState=installSurfaceI18n(root);

  function settle(token,startedAt){
    if(disconnected||token!==generation)return false;
    let ok=false;
    try{
      surfaceState=installSurfaceI18n(root);
      ok=true;
      return true;
    }catch(error){
      emit(root,'m26:i18n-switch-failed',{
        generation:token,
        code:String(error?.message||'M26_I18N_RUNTIME_RECONNECT_FAILED').slice(0,120),
      });
      return false;
    }finally{
      setBusy(root,false);
      emit(root,'m26:i18n-switch-settled',{
        generation:token,
        ok,
        durationMs:Math.max(0,Math.round(now()-startedAt)),
      });
    }
  }

  function onChangeCapture(event){
    if(!matchingControl(event?.target))return;

    const token=++generation;
    const startedAt=now();
    setBusy(root,true);

    try{surfaceState?.disconnect?.();}
    catch(error){
      emit(root,'m26:i18n-switch-observer-disconnect-failed',{
        generation:token,
        code:String(error?.message||'M26_I18N_RUNTIME_DISCONNECT_FAILED').slice(0,120),
      });
    }
    surfaceState=null;

    try{
      schedule(()=>settle(token,startedAt));
    }catch(error){
      settle(token,startedAt);
      emit(root,'m26:i18n-switch-scheduler-failed',{
        generation:token,
        code:String(error?.message||'M26_I18N_RUNTIME_SCHEDULER_FAILED').slice(0,120),
      });
    }
  }

  root.addEventListener('change',onChangeCapture,true);

  const state=Object.freeze({
    disconnect(){
      if(disconnected)return;
      disconnected=true;
      generation+=1;
      root.removeEventListener?.('change',onChangeCapture,true);
      setBusy(root,false);
      INSTALLED.delete(root);
    },
  });

  INSTALLED.set(root,state);
  return state;
}

export async function bootstrapIberfitLanguageSwitchRuntimeGuard({documentLike=globalThis?.document}={}){
  if(!documentLike?.querySelector)return null;
  const root=documentLike.querySelector('#app');
  if(!root)return null;
  try{
    const {installIberfitSurfaceI18n}=await import('./i18n-surface.js');
    return installIberfitLanguageSwitchRuntimeGuard(root,{installSurfaceI18n:installIberfitSurfaceI18n});
  }catch(error){
    try{console.error('[IBERFIT:i18n-runtime-guard]',error?.message||error);}
    catch{}
    return null;
  }
}

if(typeof document!=='undefined')void bootstrapIberfitLanguageSwitchRuntimeGuard();
