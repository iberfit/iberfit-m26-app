import { normalizeCheckinDraft,validateCheckinDraft,normalizeHabitDefinitionDraft,validateHabitDefinitionDraft,validatePrivateNoteDraft } from './activity-drafts.js';

function setStatus(root,scope,message,kind='info'){
  const node=root?.querySelector?.(`[data-engagement-status="${scope}"]`);
  if(!node)return;
  node.textContent=message;
  node.dataset.status=kind;
}
function formValues(form){const data=new FormData(form);return Object.fromEntries(data.entries());}
function ensureValidForm(form){if(typeof form?.checkValidity==='function'&&!form.checkValidity()){form.reportValidity?.();throw new Error('M26_FORM_INVALID');}return form;}
function dispatchError(root,action,error){if(typeof CustomEvent==='function')root.dispatchEvent(new CustomEvent('m26:engagement-error',{bubbles:true,detail:{action,code:String(error?.message||error)}}));}
function friendlyError(error){const code=String(error?.message||error||'');if(/ROLE|FORBIDDEN|CLIENT_CONTEXT/.test(code))return 'No tienes permiso para completar esta acción.';if(/INVALID|REQUIRED/.test(code))return 'Revisa los campos obligatorios y vuelve a intentarlo.';if(/BACKEND|REGISTRY/.test(code))return 'Esta función aún no está habilitada para tu cuenta.';return 'No fue posible completar la acción. El borrador local permanece protegido.';}
function friendlyRenewalError(error){
  const code=String(error?.message||error||'');
  if(/ROLE|FORBIDDEN|CLIENT_CONTEXT/.test(code))return 'No tienes permiso para modificar esta renovación.';
  if(/ONLINE_REQUIRED/.test(code))return 'Necesitas conexión para guardar una renovación en la fuente canónica.';
  if(/INVALID|REQUIRED|DATE|STATUS|REVISION|EVIDENCE/.test(code))return 'Revisa los datos de la renovación y vuelve a intentarlo.';
  if(/BACKEND|REGISTRY/.test(code))return 'La edición de renovaciones aún no está habilitada para tu cuenta.';
  if(/NOT_PERSISTED|REFRESH/.test(code))return 'No se pudo verificar la renovación después de la respuesta del servidor. Actualiza la cartera antes de volver a intentarlo.';
  if(/NOT_CONFIRMED/.test(code))return 'El servidor no confirmó la renovación. No se registró ningún cambio local.';
  return 'No fue posible guardar la renovación. No se registró ningún cambio local.';
}
function entityField(record,...keys){const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};for(const key of keys){const value=record?.[key]??body?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function renewalEntity(state,clientId){return [...(state?.collections?.m26Entities||[])].filter((item)=>String(entityField(item,'entityType','entity_type')||'').toLowerCase()==='renewal'&&String(entityField(item,'clientId','client_id')||'')===String(clientId||'')).sort((a,b)=>Number(entityField(b,'revision')||0)-Number(entityField(a,'revision')||0))[0]||null;}
function renewalFormForClient(root,clientId){return Array.from(root?.querySelectorAll?.('[data-engagement-form="commercial-renewal"]')||[]).find((form)=>String(form?.dataset?.clientId||'')===String(clientId||''))||null;}
function createField(documentLike,labelText,name,type='text'){const label=documentLike.createElement('label');const span=documentLike.createElement('span');span.textContent=labelText;const input=documentLike.createElement('input');input.name=name;input.type=type;label.append(span,input);return {label,input};}

export function createEngagementController({root,store,draftRepository,service,submitCheckin,savePrivateNote,refreshState}={}){
  if(!root?.addEventListener||!store?.getState||!draftRepository?.save)throw new Error('M26_ENGAGEMENT_CONTROLLER_REQUIRED');let mounted=false;let restoreScheduled=false;let renewalUiScheduled=false;let renewalObserver=null;
  function context(){const state=store.getState();const role=String(state.identity?.role||'').toLowerCase();const clientId=['client','cliente'].includes(role)?state.identity?.clientId:state.selectedClientId;return {state,role,clientId};}
  function requireClient(){const {clientId}=context();if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');return clientId;}
  function ensureCommercialRenewalManagers(){
    const {state,role}=context();
    if(!['admin','coach'].includes(role))return false;
    const documentLike=root.ownerDocument||globalThis.document;
    if(!documentLike?.createElement)return false;
    for(const card of root.querySelectorAll?.('.m26-client-card')||[]){
      const select=card.querySelector?.('[data-m26-select-client]');
      const clientId=String(select?.getAttribute?.('data-m26-select-client')||'').trim();
      const meta=card.querySelector?.('.m26-client-meta');
      if(!clientId||!meta)continue;
      const entity=renewalEntity(state,clientId);
      const entityId=String(entityField(entity,'entityId','entity_id','id')||'');
      const revision=Number(entityField(entity,'revision')||0);
      const signature=`${entityId}:${revision}`;
      let manager=meta.querySelector?.('[data-commercial-renewal-manager]');
      if(manager?.dataset?.canonicalSignature===signature)continue;
      manager?.remove?.();
      manager=documentLike.createElement('details');
      manager.className='m26-commercial-renewal-manager';
      manager.setAttribute('data-commercial-renewal-manager','true');
      manager.dataset.canonicalSignature=signature;
      const summary=documentLike.createElement('summary');summary.textContent='Gestionar renovación';
      const form=documentLike.createElement('form');form.setAttribute('data-engagement-form','commercial-renewal');form.dataset.clientId=clientId;form.dataset.entityId=entityId;form.dataset.baseRevision=String(revision);
      const statusLabel=documentLike.createElement('label');const statusSpan=documentLike.createElement('span');statusSpan.textContent='Estado comercial';const status=documentLike.createElement('select');status.name='renewalStatus';
      for(const [value,label] of [['','Sin estado explícito'],['current','Vigente'],['upcoming','Próxima'],['overdue','Por revisar'],['completed','Completada']]){const option=documentLike.createElement('option');option.value=value;option.textContent=label;status.append(option);}
      status.value=String(entityField(entity,'renewalStatus','renewal_status')||'');statusLabel.append(statusSpan,status);
      const date=createField(documentLike,'Fecha de renovación','renewalDate','date');date.input.value=String(entityField(entity,'renewalDate','renewal_date')||'').slice(0,10);
      const plan=createField(documentLike,'Plan comercial','commercialPlan');plan.input.maxLength=140;plan.input.value=String(entityField(entity,'commercialPlan','commercial_plan')||'');
      const notesLabel=documentLike.createElement('label');const notesSpan=documentLike.createElement('span');notesSpan.textContent='Notas';const notes=documentLike.createElement('textarea');notes.name='notes';notes.maxLength=1000;notes.value=String(entityField(entity,'notes')||'');notesLabel.append(notesSpan,notes);
      const guard=documentLike.createElement('small');guard.textContent='Registra evidencia comercial explícita. No registra pagos, deuda, cobros ni mensajes automáticos.';
      const button=documentLike.createElement('button');button.type='submit';button.setAttribute('data-engagement-action','save-commercial-renewal');button.textContent='Guardar renovación';
      const feedback=documentLike.createElement('p');feedback.setAttribute('data-engagement-status','commercial-renewal');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
      form.append(statusLabel,date.label,plan.label,notesLabel,guard,button,feedback);manager.append(summary,form);meta.append(manager);
    }
    return true;
  }
  function scheduleCommercialRenewalManagers(){if(renewalUiScheduled)return;renewalUiScheduled=true;const run=()=>{renewalUiScheduled=false;ensureCommercialRenewalManagers();};if(typeof globalThis.queueMicrotask==='function')globalThis.queueMicrotask(run);else Promise.resolve().then(run);}
  async function saveCheckinDraft(){const form=root.querySelector?.('[data-engagement-form="checkin"]');if(!form)throw new Error('M26_CHECKIN_FORM_REQUIRED');const clientId=requireClient();const value=normalizeCheckinDraft(formValues(form));await draftRepository.save(clientId,'checkin',value);setStatus(root,'checkin','Borrador guardado en este dispositivo. Aún no está confirmado.','pending');return value;}
  async function submit(){const form=root.querySelector?.('[data-engagement-form="checkin"]');if(!form)throw new Error('M26_CHECKIN_FORM_REQUIRED');ensureValidForm(form);const {clientId,role}=context();if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');const validation=validateCheckinDraft(formValues(form));if(!validation.ok)throw new Error(`M26_CHECKIN_INVALID:${validation.errors.join(',')}`);await draftRepository.save(clientId,'checkin',validation.value);const result=service?.registerCheckin?await service.registerCheckin({clientId,checkin:validation.value}):typeof submitCheckin==='function'?await submitCheckin({clientId,role,checkin:validation.value}):(()=>{throw new Error('M26_CHECKIN_BACKEND_CAPABILITY_REQUIRED');})();if(result?.ok){await draftRepository.remove(clientId,'checkin');setStatus(root,'checkin','Registro de bienestar confirmado.','success');}else setStatus(root,'checkin',result?.queued?'Registro de bienestar guardado para sincronizar al recuperar la conexión.':'El registro de bienestar permanece como borrador pendiente.','pending');return result;}
  async function saveHabitDraft(){const form=root.querySelector?.('[data-engagement-form="habit-definition"]');if(!form)throw new Error('M26_HABIT_FORM_REQUIRED');const clientId=requireClient();const value=normalizeHabitDefinitionDraft(formValues(form));await draftRepository.save(clientId,'habit-definition',value);setStatus(root,'habit','Borrador de hábito guardado localmente.','pending');return value;}
  async function defineHabit(){const form=root.querySelector?.('[data-engagement-form="habit-definition"]');if(!form)throw new Error('M26_HABIT_FORM_REQUIRED');ensureValidForm(form);const clientId=requireClient();const validation=validateHabitDefinitionDraft(formValues(form));if(!validation.ok)throw new Error(`M26_HABIT_INVALID:${validation.errors.join(',')}`);await draftRepository.save(clientId,'habit-definition',validation.value);if(!service?.defineHabit)throw new Error('M26_HABIT_BACKEND_CAPABILITY_REQUIRED');const result=await service.defineHabit({clientId,habit:validation.value});if(result?.ok){await draftRepository.remove(clientId,'habit-definition');form.reset?.();setStatus(root,'habit','Hábito confirmado.','success');}else setStatus(root,'habit','El hábito permanece pendiente y no se muestra como confirmado.','pending');return result;}
  async function logHabit(button){const clientId=requireClient();const habitId=String(button.getAttribute('data-habit-id')||'').trim();if(!habitId)throw new Error('M26_HABIT_ID_REQUIRED');if(!service?.registerHabit)throw new Error('M26_HABIT_BACKEND_CAPABILITY_REQUIRED');const completed=button.getAttribute('data-completed')!=='false';const result=await service.registerHabit({clientId,log:{habitId,completed,recordedAt:new Date().toISOString()}});setStatus(root,'habit-log',result?.ok?'Hábito registrado.':result?.queued?'Registro guardado para sincronización.':'Registro pendiente.',result?.ok?'success':'pending');return result;}
  async function privateNote(){const {clientId,role,state}=context();if(!['admin','coach'].includes(role))throw new Error('M26_PRIVATE_NOTE_ROLE_FORBIDDEN');if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');const field=root.querySelector?.('[data-private-note-draft]');const validation=validatePrivateNoteDraft({body:field?.value});if(!validation.ok)throw new Error('M26_PRIVATE_NOTE_REQUIRED');const before=(state.collections?.privateNotes||[]).filter((item)=>(item.clientId||item.client_id)===clientId);const result=service?.createPrivateNote?await service.createPrivateNote({clientId,body:validation.value}):typeof savePrivateNote==='function'?await savePrivateNote({clientId,body:validation.value}):(()=>{throw new Error('M26_PRIVATE_NOTE_BACKEND_CAPABILITY_REQUIRED');})();if(result?.ok){if(typeof refreshState!=='function')throw new Error('M26_PRIVATE_NOTE_REFRESH_REQUIRED');await refreshState({reason:'private-note-created'});const after=(store.getState().collections?.privateNotes||[]).filter((item)=>(item.clientId||item.client_id)===clientId);const entityId=String(result?.command?.entityId||result?.response?.entityId||result?.response?.id||'');const persisted=entityId?after.some((item)=>String(item.id||item.noteId||item.note_id||'')===entityId):after.length>before.length;if(!persisted)throw new Error('M26_PRIVATE_NOTE_NOT_PERSISTED');field.value='';setStatus(root,'private-note','Nota privada confirmada.','success');}else setStatus(root,'private-note','La nota no fue confirmada.','pending');return result;}
  async function commercialRenewal(button){
    const form=button?.closest?.('[data-engagement-form="commercial-renewal"]');
    if(!form)throw new Error('M26_RENEWAL_FORM_REQUIRED');
    ensureValidForm(form);
    const {role}=context();
    if(!['admin','coach'].includes(role))throw new Error('M26_RENEWAL_ROLE_FORBIDDEN');
    if(!service?.recordCommercialRenewal)throw new Error('M26_RENEWAL_BACKEND_CAPABILITY_REQUIRED');
    const values=formValues(form);
    const clientId=String(form.dataset?.clientId||'').trim();
    if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');
    const entityId=String(form.dataset?.entityId||'').trim()||undefined;
    const baseRevision=Number(form.dataset?.baseRevision||0);
    const result=await service.recordCommercialRenewal({clientId,entityId,baseRevision,renewal:{renewalStatus:values.renewalStatus,renewalDate:values.renewalDate,commercialPlan:values.commercialPlan,notes:values.notes}});
    if(!result?.ok)throw new Error('M26_RENEWAL_NOT_CONFIRMED');
    if(typeof refreshState!=='function')throw new Error('M26_RENEWAL_REFRESH_REQUIRED');
    await refreshState({reason:'commercial-renewal-recorded'});
    const commandEntityId=String(result?.command?.entityId||entityId||'');
    const persisted=renewalEntity(store.getState(),clientId);
    if(!persisted||commandEntityId&&String(entityField(persisted,'entityId','entity_id','id')||'')!==commandEntityId)throw new Error('M26_RENEWAL_NOT_PERSISTED');
    ensureCommercialRenewalManagers();
    const confirmedForm=renewalFormForClient(root,clientId)||form;
    setStatus(confirmedForm,'commercial-renewal','Renovación guardada en la fuente canónica.','success');
    return result;
  }
  async function executeAction(action,button){
    const wasDisabled=Boolean(button?.disabled);
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
    try{
      if(action==='save-checkin-draft')await saveCheckinDraft();
      else if(action==='submit-checkin')await submit();
      else if(action==='save-habit-draft')await saveHabitDraft();
      else if(action==='define-habit')await defineHabit();
      else if(action==='log-habit')await logHabit(button);
      else if(action==='save-private-note')await privateNote();
      else if(action==='save-commercial-renewal')await commercialRenewal(button);
      else throw new Error('M26_ENGAGEMENT_ACTION_UNKNOWN');
    }catch(error){
      const isRenewal=action==='save-commercial-renewal';
      const scope=isRenewal?'commercial-renewal':action?.includes('private-note')?'private-note':action?.includes('habit')?'habit':'checkin';
      const statusRoot=isRenewal?(button?.closest?.('[data-engagement-form="commercial-renewal"]')||root):root;
      setStatus(statusRoot,scope,isRenewal?friendlyRenewalError(error):friendlyError(error),'error');
      dispatchError(root,action,error);
    }finally{
      if(button){button.disabled=wasDisabled;button.removeAttribute('aria-busy');}
    }
  }
  async function onClick(event){const button=event.target.closest?.('[data-engagement-action]');if(!button)return;const action=button.getAttribute('data-engagement-action');if(button.closest?.('form')&&['submit-checkin','define-habit','save-commercial-renewal'].includes(action))return;event.preventDefault?.();await executeAction(action,button);}
  async function onSubmit(event){const form=event.target.closest?.('[data-engagement-form]');if(!form)return;event.preventDefault?.();const scope=form.getAttribute('data-engagement-form');const action=scope==='checkin'?'submit-checkin':scope==='habit-definition'?'define-habit':scope==='commercial-renewal'?'save-commercial-renewal':null;if(!action)return;const button=event.submitter?.matches?.(`[data-engagement-action="${action}"]`)?event.submitter:form.querySelector?.(`[data-engagement-action="${action}"]`);await executeAction(action,button);}
  function scheduleRestore(event){const area=event?.target?.closest?.('[data-m26-area]')?.getAttribute?.('data-m26-area');if(area&&area!=='actividad'&&area!=='clientes')return;if(!area||area==='clientes')scheduleCommercialRenewalManagers();if(area==='clientes')return;if(restoreScheduled)return;restoreScheduled=true;queueMicrotask(()=>{restoreScheduled=false;void restore();});}
  async function restoreScope(scope,formSelector){const {clientId}=context();if(!clientId)return;const record=await draftRepository.load(clientId,scope);const form=root.querySelector?.(formSelector);if(!record?.value||!form)return;for(const [key,value] of Object.entries(record.value)){const field=form.elements?.namedItem?.(key);if(!field||value===null||value===undefined)continue;if(field.type==='checkbox'||field.type==='radio')field.checked=Boolean(value);else field.value=String(value);}setStatus(root,scope==='checkin'?'checkin':'habit','Borrador local recuperado. Aún no está confirmado.','pending');}
  async function restore(){await restoreScope('checkin','[data-engagement-form="checkin"]');await restoreScope('habit-definition','[data-engagement-form="habit-definition"]');}
  return Object.freeze({mount(){if(mounted)return;root.addEventListener('click',onClick);root.addEventListener('click',scheduleRestore);root.addEventListener('submit',onSubmit);mounted=true;scheduleCommercialRenewalManagers();if(typeof globalThis.MutationObserver==='function'){renewalObserver=new globalThis.MutationObserver(scheduleCommercialRenewalManagers);renewalObserver.observe(root,{childList:true,subtree:true});}void restore();},destroy(){if(!mounted)return;root.removeEventListener('click',onClick);root.removeEventListener('click',scheduleRestore);root.removeEventListener('submit',onSubmit);renewalObserver?.disconnect?.();renewalObserver=null;mounted=false;},restore,saveCheckinDraft,saveHabitDraft,ensureCommercialRenewalManagers});
}
