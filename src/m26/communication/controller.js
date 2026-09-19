const toast=(message)=>{try{globalThis.dispatchEvent(new CustomEvent('m26:toast',{detail:{message}}));}catch{}};
const text=(d,k,m=4000)=>String(d.get(k)||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,m);
const PUSH_CONTROL_SELECTOR='[data-web-push-control]';

function pushErrorMessage(error){
  const code=String(error?.message||error||'');
  if(/ONLINE_REQUIRED/.test(code))return 'Conéctate a internet para cambiar los avisos de este dispositivo.';
  if(/PUSH_UNSUPPORTED/.test(code))return 'Este navegador no admite avisos web de IBERFIT.';
  if(/PUSH_NOT_CONFIGURED|VAPID_PUBLIC_KEY/.test(code))return 'Los avisos web todavía no están configurados en este entorno.';
  if(/PUSH_PERMISSION_DENIED/.test(code))return 'El navegador tiene bloqueados los avisos para IBERFIT. Puedes cambiar ese permiso desde los ajustes del navegador.';
  if(/PUSH_PERMISSION_NOT_GRANTED/.test(code))return 'No se activaron los avisos porque el permiso no fue concedido.';
  if(/PUSH_LOCAL_UNSUBSCRIBE_FAILED/.test(code))return 'El servidor ya dejó de enviar avisos a este dispositivo, pero el navegador no terminó de borrar la suscripción local. Puedes reintentar.';
  return 'No fue posible actualizar los avisos de este dispositivo. No se cambió ningún otro dispositivo.';
}

function countOtherDevices(count){
  const value=Math.max(0,Number(count)||0);
  if(!value)return '';
  return value===1
    ?'Hay otro dispositivo de tu cuenta con avisos registrados.'
    :`Hay ${value} dispositivos de tu cuenta con avisos registrados.`;
}

export function createCommunicationController({root,service,render=()=>{}}={}){
  let busy=false;
  let pushBusy=false;
  let pushStateInFlight=null;
  let lastPushState=null;
  let observer=null;

  function pushControl(){return root.querySelector?.(PUSH_CONTROL_SELECTOR)||null;}
  function setText(node,value){const next=String(value||'');if(node&&node.textContent!==next)node.textContent=next;}
  function paintPushState(state,{busyState=false}={}){
    const control=pushControl();
    if(!control||!state)return false;
    const status=control.querySelector?.('[data-web-push-status]');
    const detail=control.querySelector?.('[data-web-push-detail]');
    const button=control.querySelector?.('[data-web-push-action]');
    if(!button)return false;

    let label='Activar avisos';
    let message='Los avisos están desactivados en este dispositivo.';
    let disabled=false;
    let action='activate';
    let mode='inactive';
    let detailText='IBERFIT nunca muestra datos sensibles del entrenamiento en la pantalla bloqueada.';

    if(state.deviceActive===true){
      action='deactivate';
      label='Desactivar en este dispositivo';
      message=state.active===true
        ?'Avisos activos en este dispositivo.'
        :'Este dispositivo sigue registrado, aunque el navegador no puede mostrar avisos ahora.';
      mode=state.active===true?'active':'registered';
    }else if(state.supported!==true){
      label='No disponible';
      message='Este navegador no admite avisos web de IBERFIT.';
      disabled=true;
      mode='unsupported';
    }else if(state.configured!==true){
      label='Pendiente de configurar';
      message='Los avisos web todavía no están configurados en este entorno.';
      disabled=true;
      mode='unconfigured';
    }else if(state.online===false){
      label='Sin conexión';
      message='Conéctate a internet para comprobar o cambiar los avisos.';
      disabled=true;
      mode='offline';
    }else if(state.permission==='denied'){
      label='Permiso bloqueado';
      message='El navegador tiene bloqueados los avisos para IBERFIT.';
      detailText='Cambia el permiso desde los ajustes del navegador si quieres activarlos. IBERFIT no vuelve a solicitarlo automáticamente.';
      disabled=true;
      mode='blocked';
    }else if(state.recoveryRequired===true){
      label='Reactivar avisos';
      message='La suscripción del navegador necesita volver a vincularse de forma segura con tu cuenta.';
      mode='reconcile';
    }else if(state.accountActive===true&&state.localSubscribed!==true){
      label='Activar en este dispositivo';
      message='Este dispositivo no recibe avisos.';
      detailText=`${countOtherDevices(state.subscriptionCount)} Los detalles sensibles permanecen dentro de IBERFIT.`.trim();
      mode='other-devices';
    }else if(state.permission==='default'){
      message='Los avisos están desactivados. El permiso solo se solicitará cuando pulses activar.';
      mode='permission-required';
    }

    if(busyState){
      label=action==='deactivate'?'Desactivando…':'Activando…';
      message='Actualizando el estado de este dispositivo…';
      disabled=true;
      mode='busy';
    }

    control.dataset.state=mode;
    button.dataset.webPushAction=action;
    button.disabled=disabled||busyState;
    setText(button,label);
    setText(status,message);
    setText(detail,detailText);
    return true;
  }

  function paintPushFailure(error,{localCleanup=false}={}){
    const control=pushControl();
    if(!control)return false;
    const status=control.querySelector?.('[data-web-push-status]');
    const button=control.querySelector?.('[data-web-push-action]');
    control.dataset.state='error';
    setText(status,pushErrorMessage(error));
    if(button){
      if(localCleanup){
        button.dataset.webPushAction='deactivate';
        setText(button,'Reintentar desactivación');
        button.disabled=false;
      }else{
        button.disabled=false;
      }
    }
    return true;
  }

  async function hydratePushControl(){
    if(!pushControl()||!service?.webPushState)return null;
    if(pushStateInFlight)return pushStateInFlight;
    pushStateInFlight=(async()=>{
      try{
        const state=await service.webPushState();
        lastPushState=state;
        if(!pushBusy)paintPushState(state);
        return state;
      }catch(error){
        if(!pushBusy)paintPushFailure(error);
        return null;
      }finally{
        pushStateInFlight=null;
      }
    })();
    return pushStateInFlight;
  }

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

  async function onPushClick(event,button){
    if(pushBusy)return false;
    event.preventDefault?.();
    const action=String(button?.dataset?.webPushAction||'').trim();
    if(!['activate','deactivate'].includes(action))return false;
    pushBusy=true;
    if(lastPushState)paintPushState(lastPushState,{busyState:true});
    else button.disabled=true;
    let localCleanup=false;
    try{
      const state=action==='deactivate'
        ?await service.deactivateWebPush()
        :await service.activateWebPush();
      lastPushState=state;
      paintPushState(state);
      toast(action==='deactivate'?'Avisos desactivados en este dispositivo.':'Avisos activados en este dispositivo.');
      return true;
    }catch(error){
      localCleanup=/PUSH_LOCAL_UNSUBSCRIBE_FAILED/.test(String(error?.message||error));
      paintPushFailure(error,{localCleanup});
      toast(pushErrorMessage(error));
      if(!localCleanup)void hydratePushControl();
      return false;
    }finally{
      pushBusy=false;
      if(lastPushState&&!localCleanup)paintPushState(lastPushState);
    }
  }

  function onSubmitEvent(event){void onSubmit(event).catch(()=>toast('No fue posible procesar la comunicación.'));}
  function onClickEvent(event){
    const button=event.target?.closest?.('[data-web-push-action]');
    if(!button||!root.contains?.(button))return;
    void onPushClick(event,button);
  }
  function addedPushControl(records){
    for(const record of records||[]){
      for(const node of record.addedNodes||[]){
        if(node?.nodeType!==1)continue;
        if(node.matches?.(PUSH_CONTROL_SELECTOR)||node.querySelector?.(PUSH_CONTROL_SELECTOR))return true;
      }
    }
    return false;
  }
  function mountObserver(){
    const Observer=globalThis.MutationObserver;
    if(typeof Observer!=='function')return;
    observer=new Observer((records)=>{if(addedPushControl(records))void hydratePushControl();});
    observer.observe(root,{childList:true,subtree:true});
  }

  return Object.freeze({
    mount(){
      root.addEventListener('submit',onSubmitEvent);
      root.addEventListener('click',onClickEvent);
      mountObserver();
      queueMicrotask(()=>void hydratePushControl());
    },
    destroy(){
      root.removeEventListener('submit',onSubmitEvent);
      root.removeEventListener('click',onClickEvent);
      observer?.disconnect?.();
      observer=null;
    },
  });
}
