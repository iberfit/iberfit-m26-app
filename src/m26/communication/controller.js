const toast=(message)=>{try{globalThis.dispatchEvent(new CustomEvent('m26:toast',{detail:{message}}));}catch{}};
const text=(d,k,m=4000)=>String(d.get(k)||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,m);
const NOTIFICATION_PREFERENCE_KEYS=new Set(['sessionReminders','scheduleChanges','planPublished','coachMessages','challenges','milestones']);
const COACH_MESSAGE_ASSISTS=Object.freeze({
  session:'¿Cómo te sentiste durante la última sesión? Cuéntame qué ejercicios te resultaron más cómodos y cuáles te costaron más.',
  recovery:'¿Cómo has recuperado después de la sesión? ¿Has notado alguna molestia o algo que debamos adaptar?',
  next:'Antes de la próxima sesión, ¿hay algún cambio en tu disponibilidad o alguna cuestión que quieras que tengamos en cuenta?',
});
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
  // A delayed ACK must not delete a newer local choice for the same key.
  for(const [key,value] of Object.entries(synced||{})){
    if(Object.hasOwn(next,key)&&next[key]===value)delete next[key];
  }
  return Object.keys(next).length?Object.freeze(next):null;
}
function captureMessageDraft(form,root){
  const threadId=String(form?.querySelector?.('[name="threadId"]')?.value||'');
  const textarea=form?.querySelector?.('textarea[name="body"]');
  if(!threadId||!textarea)return null;
  const details=form.closest?.('details.m26-thread');
  const focused=root?.ownerDocument?.activeElement===textarea;
  return [threadId,{
    body:textarea.value,
    open:details?.open===true,
    focused,
    start:focused?textarea.selectionStart:null,
    end:focused?textarea.selectionEnd:null,
    scrollTop:textarea.scrollTop||0,
  }];
}
function captureMessageDrafts(root){
  const drafts=new Map();
  for(const form of root?.querySelectorAll?.('[data-communication-form="message-send"]')||[]){
    const draft=captureMessageDraft(form,root);
    if(draft)drafts.set(...draft);
  }
  return drafts;
}
function restoreMessageDrafts(root,drafts){
  if(!drafts?.size)return;
  for(const form of root?.querySelectorAll?.('[data-communication-form="message-send"]')||[]){
    const threadId=String(form.querySelector?.('[name="threadId"]')?.value||'');
    const previous=drafts.get(threadId);
    const textarea=form.querySelector?.('textarea[name="body"]');
    if(!previous||!textarea)continue;
    textarea.value=previous.body;
    const details=form.closest?.('details.m26-thread');
    if(details&&previous.open)details.open=true;
    textarea.scrollTop=previous.scrollTop;
    if(previous.focused){
      textarea.focus?.({preventScroll:true});
      if(Number.isInteger(previous.start)&&Number.isInteger(previous.end)){
        textarea.setSelectionRange?.(previous.start,previous.end);
      }
    }
  }
}
// Filtering uses only visible thread headings; never indexes private message bodies.
function foldConversationSearch(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLocaleLowerCase('es-CL').trim();
}
export function applyConversationFilter(root,{query='',unreadOnly=false}={}){
  const needle=foldConversationSearch(query);
  let visible=0;
  const nodes=Array.from(root?.querySelectorAll?.('.m26-thread')||[]);
  for(const node of nodes){
    // Search only participant and subject, not unread badges or message bodies.
    const heading=node.querySelector?.('.m45-thread-identity')?.textContent||
      node.querySelector?.('summary')?.textContent||'';
    const unread=Number(node.getAttribute?.('data-thread-unread-count')||0)>0;
    const show=(!needle||foldConversationSearch(heading).includes(needle))&&(!unreadOnly||unread);
    node.hidden=!show;
    if(show)visible+=1;
  }
  const field=root?.querySelector?.('[data-m45-conversation-search]');
  if(field&&field.value!==query)field.value=query;
  const toggle=root?.querySelector?.('[data-m45-unread-toggle]');
  if(toggle)toggle.setAttribute?.('aria-pressed',unreadOnly?'true':'false');
  const feedback=root?.querySelector?.('[data-m45-filter-feedback]');
  if(feedback){
    feedback.textContent=!nodes.length?''
      :visible===0?'No hay conversaciones que coincidan con este filtro.'
      :`${visible} de ${nodes.length} conversaciones visibles`;
  }
  return Object.freeze({visible,total:nodes.length});
}
// IBERFIT M45: in-memory replay identity for ambiguous message delivery.
// No drafts or recipient IDs are written to browser storage.
export function createMessageRetryFence({newId,maxPending=64}={}){
  const pending=new Map();
  const generate=typeof newId==='function'?newId:()=>(
    globalThis.crypto?.randomUUID?.()||`M45-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const limit=Math.max(1,Math.min(256,Math.floor(Number(maxPending)||64)));
  function forSend(threadId,body){
    const key=String(threadId||'').trim();
    const content=String(body||'').trim();
    if(!key||!content)throw new Error('M45_MESSAGE_RETRY_INVALID');
    const previous=pending.get(key);
    if(previous?.body===content)return previous.operationId;
    const operationId=String(generate()||'').trim();
    if(!operationId)throw new Error('M45_MESSAGE_OPERATION_ID_INVALID');
    pending.delete(key);
    if(pending.size>=limit)pending.delete(pending.keys().next().value);
    pending.set(key,{body:content,operationId});
    return operationId;
  }
  function acknowledged(threadId,operationId){
    const key=String(threadId||'').trim();
    if(pending.get(key)?.operationId!==operationId)return false;
    pending.delete(key);
    return true;
  }
  return Object.freeze({
    forSend,
    acknowledged,
    clear(){pending.clear();},
    get size(){return pending.size;},
  });
}

export function createCommunicationController({root,service,render=()=>{}}={}){
  let busy=false;
  let busyVersion=0;
  function claimBusy(){
    if(busy)return null;
    busy=true;
    return ++busyVersion;
  }
  function releaseBusy(version){
    if(busyVersion===version)busy=false;
  }
  let mounted=false;
  let lifecycleGeneration=0;
  let pushStatusGeneration=0;
  let preferenceGeneration=0;
  // Ephemeral in-memory only: never persist private message drafts to storage.
  const pendingMessageDrafts=new Map();
  const messageEditRevisions=new Map();
  const messageRetryFence=createMessageRetryFence();
  let activeCommunicationRole=null;
  let activeCommunicationIdentity=null;
  let conversationSearch='';
  let onlyUnreadConversations=false;
  let pushBusy=false;
  let pushStatusInFlight=null;
  let lastPushSyncAt=0;
  let lastPushControl=null;
  let preferenceSyncInFlight=null;
  let preferenceHydrationInFlight=null;
  let queuedPreferencePayload=null;
  let retryPreferencePayload=null;
  const explicitPreferenceChoices=Object.create(null);
  let lastPreferenceSignature='';
  let lastPreferenceSyncAt=0;
  const windowLike=root?.ownerDocument?.defaultView||globalThis.window||null;
  function rememberVisibleDrafts(){
    for(const [id,draft] of captureMessageDrafts(root)){
      if(draft.body){
        pendingMessageDrafts.set(id,draft);
      }else if(!pendingMessageDrafts.get(id)?.body){
        // Shell-recreated blank composers must never replace a draft captured
        // before an asynchronous refresh; explicit deletion uses the input event.
        if(draft.open)pendingMessageDrafts.set(id,draft);
        else pendingMessageDrafts.delete(id);
      }
    }
  }
  function applyInboxFilter(){
    applyConversationFilter(root,{query:conversationSearch,unreadOnly:onlyUnreadConversations});
  }
  function renderWithoutLosingDrafts(){
    rememberVisibleDrafts();
    const search=root?.querySelector?.('[data-m45-conversation-search]');
    const focused=search&&root?.ownerDocument?.activeElement===search;
    const searchStart=focused?search.selectionStart:null;
    const searchEnd=focused?search.selectionEnd:null;
    const searchScroll=focused?search.scrollLeft:0;
    render();
    restoreMessageDrafts(root,pendingMessageDrafts);
    applyInboxFilter();
    if(focused){
      const next=root?.querySelector?.('[data-m45-conversation-search]');
      next?.focus?.({preventScroll:true});
      if(Number.isInteger(searchStart)&&Number.isInteger(searchEnd)){
        try{next?.setSelectionRange?.(searchStart,searchEnd);}catch{}
      }
      if(next)next.scrollLeft=searchScroll||0;
    }
  }
  function clearLiveMessageComposer(threadId,sentBody){
    for(const form of root?.querySelectorAll?.('[data-communication-form="message-send"]')||[]){
      if(String(form.querySelector?.('[name="threadId"]')?.value||'')!==threadId)continue;
      const textarea=form.querySelector?.('textarea[name="body"]');
      // The user can start composing the *next* message during this send.
      if(textarea&&String(textarea.value||'').trim()===sentBody)textarea.value='';
    }
  }
  function composeFeedback(form,message,{waiting=false}={}){
    if(!form)return;
    form.setAttribute?.('aria-busy',waiting?'true':'false');
    const button=form.querySelector?.('button[type="submit"]');
    if(button)button.disabled=waiting;
    const status=form.querySelector?.('.m45-compose-status');
    if(status)status.textContent=message;
  }
  async function run(input,msg,{onAck,form}={}){
    const operation=claimBusy();
    if(operation===null){
      if(form&&form.getAttribute?.('aria-busy')!=='true'){
        composeFeedback(form,'Hay otra operación en curso. Tu borrador sigue aquí; vuelve a pulsar Enviar cuando termine.');
      }
      return false;
    }
    const lifecycle=lifecycleGeneration;
    const current=()=>mounted&&lifecycle===lifecycleGeneration&&operation===busyVersion;
    if(form)composeFeedback(form,'Enviando mensaje…',{waiting:true});
    // The domain refresh may replace the shell before execute resolves.
    // Preserve other unsent composers *before* crossing the network boundary.
    rememberVisibleDrafts();
    const sentThread=String(input.entityId||'');
    const sentRevision=messageEditRevisions.get(sentThread)||0;
    let confirmed=false;
    try{
      const result=await service.execute(input);
      // An ACK for account A must never reset account B's composer.
      if(!current())return false;
      confirmed=true;
      if(input.type==='MESSAGE_SEND')messageRetryFence.acknowledged(input.entityId,input.operationId);
      // Merge edits entered *while the server request was in flight*. Old
      // snapshots are not allowed to overwrite newly composed messages.
      rememberVisibleDrafts();
      if(input.type==='MESSAGE_SEND'){
        const sentBody=String(input.payload?.body||'').trim();
        const latest=pendingMessageDrafts.get(sentThread);
        // A new input event is a new draft even if the user types the exact
        // same text as the message being acknowledged.
        const editedSinceSend=(messageEditRevisions.get(sentThread)||0)!==sentRevision;
        if(!editedSinceSend&&(!latest?.body||String(latest.body).trim()===sentBody)){
          pendingMessageDrafts.delete(sentThread);
          clearLiveMessageComposer(sentThread,sentBody);
        }
      }else onAck?.();
      restoreMessageDrafts(root,pendingMessageDrafts);
      toast(result?.syncPending?msg+' La actualización de esta pantalla está pendiente.':msg);
      if(form)composeFeedback(form,result?.syncPending
        ?'Envío confirmado. La conversación se actualizará al recuperar los datos.'
        :'Mensaje enviado.',{waiting:false});
      if(!result?.syncPending)renderWithoutLosingDrafts();
      return true;
    }catch(error){
      if(!current())return false;
      if(confirmed){
        // A redraw/UI exception after the confirmed RPC must not create a
        // misleading send failure that invites duplicate retries.
        toast('Operación confirmada. No se pudo actualizar la vista; vuelve a abrir la conversación.');
        return true;
      }
      const offline=/ONLINE_REQUIRED/.test(String(error?.message||error));
      const feedback=offline
        ?'Los mensajes requieren conexión. El borrador está disponible para reintentar.'
        :input.type==='MESSAGE_SEND'
          ?'No se pudo confirmar el envío. Puedes reintentarlo sin generar un mensaje duplicado.'
          :'No fue posible confirmar la comunicación.';
      if(form)composeFeedback(form,feedback,{waiting:false});
      toast(feedback);
      return false;
    }finally{
      if(current()&&form)composeFeedback(form,
        form.querySelector?.('.m45-compose-status')?.textContent||'',{waiting:false});
      releaseBusy(operation);
    }
  }
  async function markNotificationGroup(ids){
    const operation=claimBusy();
    if(operation===null){
      toast('Hay otra operación en curso. Los avisos no se han modificado; vuelve a intentarlo al terminar.');
      return false;
    }
    const lifecycle=lifecycleGeneration;
    const current=()=>mounted&&lifecycle===lifecycleGeneration&&operation===busyVersion;
    rememberVisibleDrafts();
    try{
      if(!service?.markNotificationsRead)throw new Error('M45_GROUP_READ_UNAVAILABLE');
      const result=await service.markNotificationsRead(ids);
      if(!current())return false;
      const total=Number(result?.requestedCount)||ids.length;
      const marked=Number(result?.markedCount)||0;
      if(!marked)throw new Error('M45_GROUP_READ_NOT_CONFIRMED');
      if(result.ok){
        toast(marked===1?'Notificación leída.':`${marked} notificaciones leídas.`);
      }else{
        toast(`${marked} de ${total} avisos marcados como leídos. Los restantes siguen pendientes.`);
      }
      if(result.syncPending)toast('El servidor confirmó la lectura. La actualización de la pantalla está pendiente.');
      else renderWithoutLosingDrafts();
      return result.ok;
    }catch{
      if(current())toast('No se pudo confirmar la lectura. Los avisos permanecen disponibles para reintentar.');
      return false;
    }finally{releaseBusy(operation);}
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
    if(!mounted)return false;
    const control=root.querySelector?.('[data-m26-web-push-control]');
    if(!control)return false;
    const now=Date.now();
    if(control!==lastPushControl){
      // Shell replaced the element while a remote status call was in flight.
      // No stale response may paint the old control, or suppress a new query.
      pushStatusGeneration+=1;
      pushStatusInFlight=null;
      lastPushControl=control;
      force=true;
    }
    if(!force&&now-lastPushSyncAt<30_000)return true;
    if(pushStatusInFlight)return pushStatusInFlight;
    const requestGeneration=pushStatusGeneration;
    const requestLifecycle=lifecycleGeneration;
    const isCurrent=()=>mounted&&requestLifecycle===lifecycleGeneration&&
      requestGeneration===pushStatusGeneration&&
      root.querySelector?.('[data-m26-web-push-control]')===control;
    let operation;
    operation=(async()=>{
      try{
        const state=await service.webPush.status();
        if(!isCurrent())return false;
        lastPushSyncAt=Date.now();
        applyPushState(control,state);
        return true;
      }catch(error){
        if(!isCurrent())return false;
        const status=control.querySelector?.('[data-m26-web-push-status]');
        if(status)status.textContent=pushErrorMessage(error);
        return false;
      }finally{
        if(pushStatusInFlight===operation)pushStatusInFlight=null;
      }
    })();
    pushStatusInFlight=operation;
    return operation;
  }
  async function syncNotificationPreferences(payload,{force=false,announceFailure=false}={}){
    if(!mounted||!payload||!service?.notificationPreferences?.update)return false;
    const normalized=Object.freeze(Object.fromEntries(Object.entries(payload).filter(([key,value])=>NOTIFICATION_PREFERENCE_KEYS.has(key)&&typeof value==='boolean')));
    if(!Object.keys(normalized).length)return false;
    const signature=JSON.stringify(normalized);
    if(!force&&signature===lastPreferenceSignature&&Date.now()-lastPreferenceSyncAt<60_000)return true;
    if(preferenceSyncInFlight){
      queuedPreferencePayload=mergePreferencePayload(queuedPreferencePayload,normalized);
      return preferenceSyncInFlight;
    }
    const lifecycle=lifecycleGeneration;
    const isCurrent=()=>mounted&&lifecycle===lifecycleGeneration;
    let operation;
    operation=(async()=>{
      try{
        await service.notificationPreferences.update(normalized);
        if(!isCurrent())return false;
        retryPreferencePayload=clearSyncedPreferenceKeys(retryPreferencePayload,normalized);
        lastPreferenceSignature=signature;
        lastPreferenceSyncAt=Date.now();
        return true;
      }catch(error){
        if(!isCurrent())return false;
        // A failed older request must never requeue a value that the user has
        // already changed again while the request was in flight.
        const stillCurrent=Object.fromEntries(
          Object.entries(normalized).filter(([key,value])=>
            !Object.hasOwn(explicitPreferenceChoices,key)||explicitPreferenceChoices[key]===value
          )
        );
        retryPreferencePayload=mergePreferencePayload(retryPreferencePayload,stillCurrent);
        if(announceFailure)toast(/ONLINE_REQUIRED/.test(String(error?.message||error))
          ?'Cambio pendiente de sincronizar. Conservaremos tu elección en esta pantalla y reintentaremos al volver la conexión.'
          :'No se confirmó la preferencia en IBERFIT. La selección permanece visible y se reintentará al recuperar la conexión.');
        return false;
      }finally{
        if(preferenceSyncInFlight===operation){
          preferenceSyncInFlight=null;
          const queued=queuedPreferencePayload;
          queuedPreferencePayload=null;
          if(queued&&isCurrent())queueMicrotask(()=>{
            if(isCurrent())void syncNotificationPreferences(queued,{force:true});
          });
        }
      }
    })();
    preferenceSyncInFlight=operation;
    return operation;
  }
  function syncVisibleNotificationPreferences({force=false}={}){
    const payload=preferencePayloadFromRoot(root);
    if(!payload)return false;
    void syncNotificationPreferences(payload,{force});
    return true;
  }
  async function hydrateNotificationPreferences({force=false}={}){
    if(!mounted||!service?.notificationPreferences?.status)return false;
    // Never start parallel preference reads for the same session. Role/identity
    // transitions explicitly invalidate the old in-flight request.
    if(preferenceSyncInFlight||queuedPreferencePayload||retryPreferencePayload)return false;
    if(preferenceHydrationInFlight)return preferenceHydrationInFlight;
    const requestedGeneration=preferenceGeneration;
    const lifecycle=lifecycleGeneration;
    let operation;
    operation=(async()=>{
      try{
        const remote=await service.notificationPreferences.status();
        // An earlier request cannot overwrite a newer explicit choice/account.
        if(!mounted||requestedGeneration!==preferenceGeneration||
          lifecycle!==lifecycleGeneration)return false;
        service.notificationPreferences.applyRemote?.(remote?.preferences||{});
        lastPreferenceSignature=JSON.stringify(remote?.preferences||{});
        lastPreferenceSyncAt=Date.now();
        renderWithoutLosingDrafts();
        return true;
      }catch{
        return false;
      }finally{
        if(preferenceHydrationInFlight===operation)preferenceHydrationInFlight=null;
      }
    })();
    preferenceHydrationInFlight=operation;
    return operation;
  }
  async function onPushAction(event,button){
    event.preventDefault();
    if(pushBusy)return false;
    const action=String(button.dataset.m26WebPushAction||'');
    if(!['enable','disable-current'].includes(action))return false;
    pushBusy=true;
    const lifecycle=lifecycleGeneration;
    button.disabled=true;
    try{
      if(action==='enable')await service.webPush.enable();
      else await service.webPush.disableCurrent();
      if(!mounted||lifecycle!==lifecycleGeneration)return false;
      toast(action==='enable'?'Avisos activados en este dispositivo.':'Avisos desactivados en este dispositivo.');
      lastPushSyncAt=0;
      await syncPushControl({force:true});
      return true;
    }catch(error){
      if(!mounted||lifecycle!==lifecycleGeneration)return false;
      toast(pushErrorMessage(error));
      await syncPushControl({force:true});
      return false;
    }finally{
      if(mounted&&lifecycle===lifecycleGeneration){
        pushBusy=false;
        const control=root.querySelector?.('[data-m26-web-push-control]');
        if(control)void syncPushControl({force:true});
      }
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
      const body=text(d,'body');
      const operationId=messageRetryFence.forSend(threadId,body);
      return run(
        {type:'MESSAGE_SEND',operationId,entityId:threadId,payload:{threadId,body}},
        'Mensaje enviado.',
        {form},
      );
    }
    if(kind==='thread-read'){
      const threadId=text(d,'threadId',200);
      return run({type:'MESSAGE_MARK_READ',entityId:threadId,payload:{threadId}},'Conversación actualizada.');
    }
    if(kind==='notification-read'){
      const ids=d.getAll('notificationId').map((value)=>String(value||'').trim());
      return markNotificationGroup(ids);
    }
    return false;
  }
  function onSubmitEvent(event){void onSubmit(event).catch(()=>toast('No fue posible procesar la comunicación.'));}
  function onInputEvent(event){
    const search=event.target?.closest?.('[data-m45-conversation-search]');
    if(search){
      conversationSearch=String(search.value||'').slice(0,120);
      applyInboxFilter();
      return;
    }
    const form=event.target?.closest?.('[data-communication-form="message-send"]');
    if(!form)return;
    if(!activeCommunicationRole){
      const roleNode=root.querySelector?.('[data-communication-role]');
      activeCommunicationRole=String(roleNode?.dataset?.communicationRole||roleNode?.getAttribute?.('data-communication-role')||'');
      activeCommunicationIdentity=String(roleNode?.dataset?.communicationIdentity||roleNode?.getAttribute?.('data-communication-identity')||'');
    }
    const threadId=String(form.querySelector?.('[name="threadId"]')?.value||'');
    if(!threadId)return;
    messageEditRevisions.set(threadId,(messageEditRevisions.get(threadId)||0)+1);
    const draft=captureMessageDraft(form,root)?.[1];
    if(draft?.body)pendingMessageDrafts.set(threadId,draft);
    else pendingMessageDrafts.delete(threadId);
  }
  async function reloadCommunication(button,{quiet=false}={}){
    if(!mounted)return false;
    const operation=claimBusy();
    if(operation===null)return false;
    const lifecycle=lifecycleGeneration;
    if(button)button.disabled=true;
    try{
      if(!service?.reload)throw new Error('M45_COMMUNICATION_RETRY_UNAVAILABLE');
      await service.reload();
      if(!mounted||lifecycle!==lifecycleGeneration||operation!==busyVersion)return false;
      renderWithoutLosingDrafts();
      return true;
    }catch{
      if(!quiet&&mounted&&lifecycle===lifecycleGeneration&&operation===busyVersion){
        toast('No pudimos actualizar las conversaciones. Comprueba la conexión y vuelve a intentarlo.');
      }
      return false;
    }finally{
      if(button)button.disabled=false;
      releaseBusy(operation);
    }
  }
  function onClickEvent(event){
    const suggestion=event.target?.closest?.('[data-m45-compose-prompt]');
    if(suggestion){
      event.preventDefault?.();
      const roleNode=root.querySelector?.('[data-communication-role]');
      const role=String(roleNode?.dataset?.communicationRole||roleNode?.getAttribute?.('data-communication-role')||'');
      if(role!=='coach')return;
      const key=String(suggestion.dataset?.m45ComposePrompt||'');
      const prompt=Object.hasOwn(COACH_MESSAGE_ASSISTS,key)?COACH_MESSAGE_ASSISTS[key]:null;
      if(!prompt)return;
      const form=suggestion.closest?.('[data-communication-form="message-send"]');
      const textarea=form?.querySelector?.('textarea[name="body"]');
      if(!textarea)return;
      const currentText=String(textarea.value||'');
      const composed=currentText.trim()?currentText.trimEnd()+'\n\n'+prompt:prompt;
      if(composed.length>4000){
        toast('El mensaje ha alcanzado el límite de texto. Edita el borrador antes de añadir otra idea.');
        return;
      }
      textarea.value=composed;
      textarea.focus?.({preventScroll:true});
      textarea.setSelectionRange?.(composed.length,composed.length);
      onInputEvent({target:textarea});
      return;
    }
    const unreadToggle=event.target.closest?.('[data-m45-unread-toggle]');
    if(unreadToggle){
      event.preventDefault?.();
      onlyUnreadConversations=!onlyUnreadConversations;
      applyInboxFilter();
      return;
    }
    const threadSummary=event.target.closest?.('.m26-thread summary');
    if(threadSummary){
      queueMicrotask(()=>rememberVisibleDrafts());
      return;
    }
    const retryButton=event.target.closest?.('[data-m45-communication-retry]');
    if(retryButton){event.preventDefault?.();void reloadCommunication(retryButton);return;}
    const pushAction=event.target.closest?.('[data-m26-web-push-action]');
    if(pushAction){void onPushAction(event,pushAction);return;}
    queueMicrotask(()=>{void syncPushControl();});
  }
  function onChangeEvent(event){
    const payload=preferencePayloadFromControl(event.target?.closest?.('[data-m26-preference]'));
    if(!payload)return;
    preferenceGeneration+=1;
    Object.assign(explicitPreferenceChoices,payload);
    if(retryPreferencePayload){
      const current=Object.fromEntries(Object.entries(retryPreferencePayload).filter(
        ([key,value])=>!Object.hasOwn(payload,key)||payload[key]===value
      ));
      retryPreferencePayload=Object.keys(current).length?Object.freeze(current):null;
    }
    void syncNotificationPreferences(payload,{force:true,announceFailure:true});
  }
  function onShellRendered(){
    const roleNode=root.querySelector?.('[data-communication-role]');
    const role=String(roleNode?.dataset?.communicationRole||roleNode?.getAttribute?.('data-communication-role')||'');
    const identity=String(roleNode?.dataset?.communicationIdentity||roleNode?.getAttribute?.('data-communication-identity')||'');
    // Private drafts are bound to both role and the actual authenticated identity.
    if(role!==activeCommunicationRole||identity!==activeCommunicationIdentity){
      busy=false;
      busyVersion+=1;
      // The controller can survive an in-app role transition. Fence *all*
      // pending account-scoped reads/writes, not only push status.
      lifecycleGeneration+=1;
      preferenceGeneration+=1;
      preferenceSyncInFlight=null;
      preferenceHydrationInFlight=null;
      queuedPreferencePayload=null;
      retryPreferencePayload=null;
      for(const key of Object.keys(explicitPreferenceChoices))delete explicitPreferenceChoices[key];
      lastPreferenceSignature='';
      lastPreferenceSyncAt=0;
      pushStatusGeneration+=1;
      pushStatusInFlight=null;
      pushBusy=false;
      lastPushControl=null;
      lastPushSyncAt=0;
      pendingMessageDrafts.clear();
      messageEditRevisions.clear();
      messageRetryFence.clear();
      conversationSearch='';
      onlyUnreadConversations=false;
      activeCommunicationRole=role;
      activeCommunicationIdentity=identity;
      const lifecycle=lifecycleGeneration;
      queueMicrotask(()=>{
        if(!mounted||lifecycle!==lifecycleGeneration||!role)return;
        void hydrateNotificationPreferences({force:true});
      });
    }
    if(role){
      restoreMessageDrafts(root,pendingMessageDrafts);
      applyInboxFilter();
    }
    queueMicrotask(()=>{void syncPushControl();});
  }
  function onOnline(){
    if(!mounted)return;
    const retry=retryPreferencePayload;
    retryPreferencePayload=null;
    if(retry)void syncNotificationPreferences(retry,{force:true});
    else void hydrateNotificationPreferences({force:true});
    void syncPushControl({force:true});
    // Read-only recovery for the currently visible messaging route.
    // No polling or automatic writes; manual retry remains available.
    if(root.querySelector?.('[data-communication-role]')){
      void reloadCommunication(null,{quiet:true});
    }
  }
  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      lifecycleGeneration+=1;
      root.addEventListener('submit',onSubmitEvent);
      root.addEventListener('click',onClickEvent);
      root.addEventListener('input',onInputEvent);
      root.addEventListener('change',onChangeEvent);
      root.addEventListener('m26:shell-rendered',onShellRendered);
      windowLike?.addEventListener?.('online',onOnline,{passive:true});
      const lifecycle=lifecycleGeneration;
      queueMicrotask(()=>{
        if(!mounted||lifecycle!==lifecycleGeneration)return;
        void hydrateNotificationPreferences({force:true});
        void syncPushControl({force:true});
      });
    },
    destroy(){
      mounted=false;
      busy=false;
      busyVersion+=1;
      lifecycleGeneration+=1;
      pushStatusGeneration+=1;
      preferenceGeneration+=1;
      root.removeEventListener('submit',onSubmitEvent);
      root.removeEventListener('click',onClickEvent);
      root.removeEventListener('input',onInputEvent);
      root.removeEventListener('change',onChangeEvent);
      root.removeEventListener('m26:shell-rendered',onShellRendered);
      windowLike?.removeEventListener?.('online',onOnline);
      lastPushControl=null;
      pushStatusInFlight=null;
      pushBusy=false;
      preferenceSyncInFlight=null;
      preferenceHydrationInFlight=null;
      activeCommunicationRole=null;
      activeCommunicationIdentity=null;
      conversationSearch='';
      onlyUnreadConversations=false;
      pendingMessageDrafts.clear();
      messageEditRevisions.clear();
      messageRetryFence.clear();
      queuedPreferencePayload=null;
      retryPreferencePayload=null;
      for(const key of Object.keys(explicitPreferenceChoices))delete explicitPreferenceChoices[key];
      lastPreferenceSignature='';
      lastPreferenceSyncAt=0;
    },
  });
}

export const __communicationControllerInternals=Object.freeze({
  preferencePayloadFromControl,
  preferencePayloadFromRoot,
  mergePreferencePayload,
  clearSyncedPreferenceKeys,
  captureMessageDrafts,
  restoreMessageDrafts,
});
