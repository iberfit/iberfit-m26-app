const toast=(message)=>{try{globalThis.dispatchEvent(new CustomEvent('m26:toast',{detail:{message}}));}catch{}};
const text=(d,k,m=4000)=>String(d.get(k)||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,m);
const NOTIFICATION_PREFERENCE_KEYS=new Set(['sessionReminders','scheduleChanges','planPublished','coachMessages','challenges','milestones']);
function pushErrorMessage(error){
  const code=String(error?.message||error||'');
  if(/ONLINE_REQUIRED/.test(code))return 'Necesitas conexión para cambiar los avisos de este dispositivo.';
  if(/PERMISSION_DENIED/.test(code))return 'El navegador tiene los avisos bloqueados. Puedes cambiarlos desde los permisos del sitio.';
  if(/PERMISSION_NOT_GRANTED/.test(code))return 'No se activaron los avisos. Puedes intentarlo de nuevo cuando quieras.';
  if(/VAPID_PUBLIC_KEY|SERVICE_NOT_CONFIGURED/.test(code))return 'Los avisos push aún no están activados en este entorno.';
  if(/UNSUPPORTED|REGISTRATION_REQUIRED/.test(code))return 'Este dispositivo no permite activar avisos web en este momento.';
  return 'No fue posible actualizar los avisos de este dispositivo.';
}
function pushStatusCopy(state){
  if(state?.active)return 'Avisos activos en este dispositivo.';
  if(state?.reason==='server-status-unavailable')return 'Avisos locales detectados. Conecta a internet para confirmar el estado con IBERFIT.';
  if(state?.reason==='permission-denied')return 'Avisos bloqueados por el navegador.';
  if(state?.reason==='not-configured')return 'La entrega push aún no está activada en este entorno.';
  if(state?.reason==='unsupported'||state?.reason==='insecure-context')return 'Este dispositivo no admite avisos web seguros.';
  if(state?.reason==='server-registration-required')return 'Falta confirmar este dispositivo con IBERFIT.';
  if(state?.permission==='default'||state?.reason==='permission-required')return 'Puedes activar avisos para recibir solo las categorías que hayas elegido.';
  return 'Avisos desactivados en este dispositivo.';
}
function preferencePayloadFromControl(control){
  const path=String(control?.getAttribute?.('data-m26-preference')||'').trim();
  if(!path.startsWith('notifications.'))return null;
  const key=path.slice('notifications.'.length);
  if(!NOTIFICATION_PREFERENCE_KEYS.has(key)||control?.type!=='checkbox')return null;
  return Object.freeze({[key]:Boolean(control.checked)});
}
function preferencePayloadFromRoot(root){
  const out={};
  for(const control of root?.querySelectorAll?.('[data-m26-preference^="notifications."]')||[]){
    const entry=preferencePayloadFromControl(control);
    if(entry)Object.assign(out,entry);
  }
  return Object.keys(out).length?Object.freeze(out):null;
}
function mergePreferencePayload(left,right){
  const merged={...(left||{}),...(right||{})};
  return Object.keys(merged).length?Object.freeze(merged):null;
}
function clearSyncedPreferenceKeys(pending,synced){
  if(!pending)return null;
  const next={...pending};
  for(const key of Object.keys(synced||{}))delete next[key];
  return Object.keys(next).length?Object.freeze(next):null;
}
export function createCommunicationController({root,service,render=()=>{}}={}){
  let busy=false;
  let pushBusy=false;
  let pushStatusInFlight=null;
  let lastPushSyncAt=0;
  let lastPushControl=null;
  let preferenceSyncInFlight=null;
  let preferenceHydrationInFlight=null;
  let queuedPreferencePayload=null;
  let retryPreferencePayload=null;
  let lastPreferenceSignature='';
  let lastPreferenceSyncAt=0;
  const windowLike=root?.ownerDocument?.defaultView||globalThis.window||null;
  async function run(input,msg){
    if(busy)return false;
    busy=true;
    try{
      await service.execute(input);
      toast(msg);
      render();
      return true;
    }catch(error){
      toast(/ONLINE_REQUIRED/.test(String(error?.message||error))?'Los mensajes requieren conexión.':'No fue posible confirmar la comunicación.');
      return false;
    }finally{
      busy=false;
    }
  }
  function applyPushState(control,state){
    if(!control)return false;
    const status=control.querySelector?.('[data-m26-web-push-status]');
    const enable=control.querySelector?.('[data-m26-web-push-action="enable"]');
    const disable=control.querySelector?.('[data-m26-web-push-action="disable-current"]');
    if(status)status.textContent=pushStatusCopy(state);
    const active=state?.active===true;
    const unavailable=state?.supported===false||state?.configured===false||state?.permission==='denied';
    if(enable){enable.hidden=active;enable.disabled=pushBusy||unavailable;}
    if(disable){disable.hidden=!active;disable.disabled=pushBusy;}
    control.dataset.m26WebPushActive=active?'true':'false';
    return true;
  }
  async function syncPushControl({force=false}={}){
    const control=root.querySelector?.('[data-m26-web-push-control]');
    if(!control)return false;
    const now=Date.now();
    if(control!==lastPushControl)force=true;
    lastPushControl=control;
    if(!force&&now-lastPushSyncAt<30_000)return true;
    if(pushStatusInFlight)return pushStatusInFlight;
    pushStatusInFlight=(async()=>{
      try{
        const state=await service.webPush.status();
        lastPushSyncAt=Date.now();
        applyPushState(control,state);
        return true;
      }catch(error){
        const status=control.querySelector?.('[data-m26-web-push-status]');
        if(status)status.textContent=pushErrorMessage(error);
        return false;
      }finally{pushStatusInFlight=null;}
    })();
    return pushStatusInFlight;
  }
  async function syncNotificationPreferences(payload,{force=false,announceFailure=false}={}){
    if(!payload||!service?.notificationPreferences?.update)return false;
    const normalized=Object.freeze(Object.fromEntries(Object.entries(payload).filter(([key,value])=>NOTIFICATION_PREFERENCE_KEYS.has(key)&&typeof value==='boolean')));
    if(!Object.keys(normalized).length)return false;
    const signature=JSON.stringify(normalized);
    if(!force&&signature===lastPreferenceSignature&&Date.now()-lastPreferenceSyncAt<60_000)return true;
    if(preferenceSyncInFlight){
      queuedPreferencePayload=mergePreferencePayload(queuedPreferencePayload,normalized);
      return preferenceSyncInFlight;
    }
    preferenceSyncInFlight=(async()=>{
      try{
        await service.notificationPreferences.update(normalized);
        retryPreferencePayload=clearSyncedPreferenceKeys(retryPreferencePayload,normalized);
        lastPreferenceSignature=signature;
        lastPreferenceSyncAt=Date.now();
        return true;
      }catch(error){
        retryPreferencePayload=mergePreferencePayload(retryPreferencePayload,normalized);
        if(announceFailure)toast(/ONLINE_REQUIRED/.test(String(error?.message||error))?'Preferencia guardada en este dispositivo. Se sincronizará al recuperar la conexión.':'Preferencia guardada en este dispositivo. IBERFIT volverá a intentar sincronizarla.');
        return false;
      }finally{
        preferenceSyncInFlight=null;
        const queued=queuedPreferencePayload;
        queuedPreferencePayload=null;
        if(queued)queueMicrotask(()=>{void syncNotificationPreferences(queued,{force:true});});
      }
    })();
    return preferenceSyncInFlight;
  }
  function syncVisibleNotificationPreferences({force=false}={}){
    const payload=preferencePayloadFromRoot(root);
    if(!payload)return false;
    void syncNotificationPreferences(payload,{force});
    return true;
  }
  async function hydrateNotificationPreferences({force=false}={}){
    if(!service?.notificationPreferences?.status)return false;
    if(preferenceHydrationInFlight&&!force)return preferenceHydrationInFlight;
    preferenceHydrationInFlight=(async()=>{
      try{
        const remote=await service.notificationPreferences.status();
        service.notificationPreferences.applyRemote?.(remote?.preferences||{});
        lastPreferenceSignature=JSON.stringify(remote?.preferences||{});
        lastPreferenceSyncAt=Date.now();
        render();
        return true;
      }catch{
        return false;
      }finally{
        preferenceHydrationInFlight=null;
      }
    })();
    return preferenceHydrationInFlight;
  }
  async function onPushAction(event,button){
    event.preventDefault();
    if(pushBusy)return false;
    const action=String(button.dataset.m26WebPushAction||'');
    if(!['enable','disable-current'].includes(action))return false;
    pushBusy=true;
    button.disabled=true;
    try{
      if(action==='enable'){
        await service.webPush.enable();
        toast('Avisos activados en este dispositivo.');
      }else{
        await service.webPush.disableCurrent();
        toast('Avisos desactivados en este dispositivo.');
      }
      lastPushSyncAt=0;
      await syncPushControl({force:true});
      return true;
    }catch(error){
      toast(pushErrorMessage(error));
      await syncPushControl({force:true});
      return false;
    }finally{
      pushBusy=false;
      const control=root.querySelector?.('[data-m26-web-push-control]');
      if(control)void syncPushControl({force:true});
    }
  }
  async function onSubmit(event){
    const form=event.target.closest?.('[data-communication-form]');
    if(!form)return false;
    event.preventDefault();
    const d=new FormData(form);
    const kind=form.dataset.communicationForm;
    if(kind==='thread-open'){
      const clientId=text(d,'clientId',200);
      return run({type:'MESSAGE_THREAD_OPEN',entityId:clientId,payload:{clientId,subject:text(d,'subject',160)}},'Conversación abierta.');
    }
    if(kind==='message-send'){
      const threadId=text(d,'threadId',200);
      const ok=await run({type:'MESSAGE_SEND',entityId:threadId,payload:{threadId,body:text(d,'body')}},'Mensaje enviado.');
      if(ok)form.reset();
      return ok;
    }
    if(kind==='thread-read'){
      const threadId=text(d,'threadId',200);
      return run({type:'MESSAGE_MARK_READ',entityId:threadId,payload:{threadId}},'Conversación actualizada.');
    }
    const notificationId=text(d,'notificationId',200);
    return run({type:'NOTIFICATION_MARK_READ',entityId:notificationId,payload:{notificationId}},'Notificación leída.');
  }
  function onSubmitEvent(event){void onSubmit(event).catch(()=>toast('No fue posible procesar la comunicación.'));}
  function onClickEvent(event){
    const pushAction=event.target.closest?.('[data-m26-web-push-action]');
    if(pushAction){void onPushAction(event,pushAction);return;}
    queueMicrotask(()=>{void syncPushControl();});
  }
  function onChangeEvent(event){
    const payload=preferencePayloadFromControl(event.target?.closest?.('[data-m26-preference]'));
    if(!payload)return;
    void syncNotificationPreferences(payload,{force:true,announceFailure:true});
  }
  function onShellRendered(){queueMicrotask(()=>{void syncPushControl();});}
  function onOnline(){
    const retry=retryPreferencePayload;
    retryPreferencePayload=null;
    if(retry)void syncNotificationPreferences(retry,{force:true});
    else void hydrateNotificationPreferences({force:true});
    void syncPushControl({force:true});
  }
  return Object.freeze({
    mount(){
      root.addEventListener('submit',onSubmitEvent);
      root.addEventListener('click',onClickEvent);
      root.addEventListener('change',onChangeEvent);
      root.addEventListener('m26:shell-rendered',onShellRendered);
      windowLike?.addEventListener?.('online',onOnline,{passive:true});
      queueMicrotask(()=>{
        void hydrateNotificationPreferences({force:true});
        void syncPushControl({force:true});
      });
    },
    destroy(){
      root.removeEventListener('submit',onSubmitEvent);
      root.removeEventListener('click',onClickEvent);
      root.removeEventListener('change',onChangeEvent);
      root.removeEventListener('m26:shell-rendered',onShellRendered);
      windowLike?.removeEventListener?.('online',onOnline);
      lastPushControl=null;
      queuedPreferencePayload=null;
      retryPreferencePayload=null;
    },
  });
}

export const __communicationControllerInternals=Object.freeze({
  preferencePayloadFromControl,
  preferencePayloadFromRoot,
  mergePreferencePayload,
  clearSyncedPreferenceKeys,
});
