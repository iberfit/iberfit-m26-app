import { normalizeCheckinDraft,validateCheckinDraft,normalizeHabitDefinitionDraft,validateHabitDefinitionDraft,validatePrivateNoteDraft } from './activity-drafts.js';
import {actionOutcomeEntities,summarizeActionOutcomes} from '../intelligence/action-outcome.js';

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
function friendlyActionOutcomeError(error){
  const code=String(error?.message||error||'');
  if(/ROLE|FORBIDDEN|CLIENT_CONTEXT/.test(code))return 'No tienes permiso para registrar esta decisión o resultado.';
  if(/ONLINE_REQUIRED/.test(code))return 'Necesitas conexión para guardar este seguimiento en la fuente canónica.';
  if(/INVALID|REQUIRED|DATE|STATUS|REVISION|EVIDENCE/.test(code))return 'Revisa señal, decisión, intervención, fecha y resultado antes de guardar.';
  if(/BACKEND|REGISTRY/.test(code))return 'El seguimiento decisión → resultado aún no está habilitado para tu cuenta.';
  if(/NOT_PERSISTED|REFRESH/.test(code))return 'El servidor respondió, pero no se pudo verificar el seguimiento. Actualiza el expediente antes de volver a intentarlo.';
  if(/NOT_CONFIRMED/.test(code))return 'El servidor no confirmó el seguimiento. No se registró ningún cambio local.';
  return 'No fue posible guardar el seguimiento. No se registró ningún cambio local.';
}
function entityField(record,...keys){const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};for(const key of keys){const value=record?.[key]??body?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function renewalEntity(state,clientId){return [...(state?.collections?.m26Entities||[])].filter((item)=>String(entityField(item,'entityType','entity_type')||'').toLowerCase()==='renewal'&&String(entityField(item,'clientId','client_id')||'')===String(clientId||'')).sort((a,b)=>Number(entityField(b,'revision')||0)-Number(entityField(a,'revision')||0))[0]||null;}
function renewalFormForClient(root,clientId){return Array.from(root?.querySelectorAll?.('[data-engagement-form="commercial-renewal"]')||[]).find((form)=>String(form?.dataset?.clientId||'')===String(clientId||''))||null;}
function escapeText(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function createField(documentLike,labelText,name,type='text'){const label=documentLike.createElement('label');const span=documentLike.createElement('span');span.textContent=labelText;const input=documentLike.createElement('input');input.name=name;input.type=type;label.append(span,input);return {label,input};}
function createTextarea(documentLike,labelText,name,maxLength=1600){const label=documentLike.createElement('label');const span=documentLike.createElement('span');span.textContent=labelText;const input=documentLike.createElement('textarea');input.name=name;input.maxLength=maxLength;label.append(span,input);return {label,input};}
function createSelect(documentLike,labelText,name,options=[]){const label=documentLike.createElement('label');const span=documentLike.createElement('span');span.textContent=labelText;const select=documentLike.createElement('select');select.name=name;for(const [value,text] of options){const option=documentLike.createElement('option');option.value=value;option.textContent=text;select.append(option);}label.append(span,select);return {label,select};}
function civilDateOffset(days=0){const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()+Number(days||0));return date.toISOString().slice(0,10);}
function percent(value){return Number.isFinite(Number(value))?`${Math.round(Number(value)*100)}%`:'—';}

export function createEngagementController({root,store,draftRepository,service,submitCheckin,savePrivateNote,refreshState}={}){
  if(!root?.addEventListener||!store?.getState||!draftRepository?.save)throw new Error('M26_ENGAGEMENT_CONTROLLER_REQUIRED');let mounted=false;let restoreScheduled=false;let renewalUiScheduled=false;let actionOutcomeUiScheduled=false;let renewalObserver=null;
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
  function ensureActionOutcomeManagers(){
    const {state,role}=context();
    if(!['admin','coach'].includes(role))return false;
    if(service?.capabilities?.actionOutcomeTracking?.ready!==true)return false;
    const documentLike=root.ownerDocument||globalThis.document;
    if(!documentLike?.createElement)return false;
    for(const card of root.querySelectorAll?.('.m26-client-card')||[]){
      const select=card.querySelector?.('[data-m26-select-client]');
      const clientId=String(select?.getAttribute?.('data-m26-select-client')||'').trim();
      const meta=card.querySelector?.('.m26-client-meta');
      if(!clientId||!meta)continue;
      const records=actionOutcomeEntities(state?.collections?.m26Entities||[],clientId);
      const summaryData=summarizeActionOutcomes(records,clientId);
      const signature=records.slice(0,12).map((item)=>`${item.id}:${item.revision}:${item.status}`).join('|')||'empty';
      let manager=meta.querySelector?.('[data-action-outcome-manager]');
      if(manager?.dataset?.canonicalSignature===signature)continue;
      manager?.remove?.();
      manager=documentLike.createElement('details');
      manager.className='m26-action-outcome-manager';
      manager.setAttribute('data-action-outcome-manager','true');
      manager.dataset.clientId=clientId;
      manager.dataset.canonicalSignature=signature;

      const summary=documentLike.createElement('summary');
      const summaryMain=documentLike.createElement('span');
      summaryMain.textContent='Decisiones y resultados';
      const summaryMeta=documentLike.createElement('small');
      summaryMeta.textContent=summaryData.openCount
        ?`${summaryData.openCount} abierto${summaryData.openCount===1?'':'s'} · ${summaryData.overdueCount} por revisar`
        :summaryData.closedCount
          ?`${summaryData.closedCount} cerrado${summaryData.closedCount===1?'':'s'}`
          :'Sin seguimiento todavía';
      summary.append(summaryMain,summaryMeta);

      const metrics=documentLike.createElement('div');
      metrics.className='m26-action-outcome-metrics';
      for(const [label,value] of [
        ['Abiertos',summaryData.openCount],
        ['Por revisar',summaryData.overdueCount],
        ['Cerrados',summaryData.closedCount],
        ['Mejora confirmada',percent(summaryData.improvementRate)],
      ]){
        const item=documentLike.createElement('span');
        const strong=documentLike.createElement('strong');strong.textContent=String(value);
        const small=documentLike.createElement('small');small.textContent=label;
        item.append(strong,small);metrics.append(item);
      }

      const form=documentLike.createElement('form');
      form.className='m26-action-tracking-form';
      form.setAttribute('data-engagement-form','action-tracking');
      form.dataset.clientId=clientId;
      const signalSource=createSelect(documentLike,'Origen de la señal','signalSource',[
        ['checkin','Bienestar / check-in'],['adherence','Adherencia'],['session','Sesión'],['progress','Evolución'],
        ['coach_observation','Observación del Coach'],['other','Otra señal'],
      ]);
      const signal=createTextarea(documentLike,'Señal observada','signalSummary',1200);
      const decision=createTextarea(documentLike,'Decisión profesional','decisionSummary',1200);
      const interventionType=createSelect(documentLike,'Tipo de intervención','interventionType',[
        ['load_adjustment','Ajuste de carga'],['technique','Técnica'],['recovery','Recuperación'],['adherence','Adherencia'],
        ['schedule','Agenda'],['communication','Comunicación'],['plan','Planificación'],['other','Otra'],
      ]);
      const intervention=createTextarea(documentLike,'Intervención realizada','interventionSummary',1600);
      const expected=createTextarea(documentLike,'Qué esperas observar','expectedOutcome',1200);
      const review=createField(documentLike,'Revisar el','reviewAt','date');review.input.value=civilDateOffset(14);
      const guard=documentLike.createElement('small');
      guard.className='m26-action-outcome-guard';
      guard.textContent='Seguimiento privado Coach/Admin. Registra criterio y evidencia; no cambia cargas, sesiones ni mensajes automáticamente.';
      const button=documentLike.createElement('button');button.type='submit';button.setAttribute('data-engagement-action','save-action-tracking');button.textContent='Registrar decisión y seguimiento';
      const feedback=documentLike.createElement('p');feedback.setAttribute('data-engagement-status','action-tracking');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
      form.append(signalSource.label,signal.label,decision.label,interventionType.label,intervention.label,expected.label,review.label,guard,button,feedback);

      const history=documentLike.createElement('div');
      history.className='m26-action-outcome-history';
      if(records.length){
        const title=documentLike.createElement('h4');title.textContent='Seguimientos recientes';history.append(title);
        for(const item of records.slice(0,4)){
          const article=documentLike.createElement('article');
          article.className='m26-action-outcome-item';
          article.dataset.status=item.status;
          const head=documentLike.createElement('div');
          const stateLabel=documentLike.createElement('strong');stateLabel.textContent=item.status==='cerrado'?'Resultado revisado':'Seguimiento abierto';
          const date=documentLike.createElement('small');date.textContent=item.reviewAt?`Revisión · ${item.reviewAt}`:'Sin fecha de revisión';
          head.append(stateLabel,date);
          const signalCopy=documentLike.createElement('p');signalCopy.innerHTML=`<b>Señal</b> · ${escapeText(item.signalSummary||'Sin detalle')}`;
          const decisionCopy=documentLike.createElement('p');decisionCopy.innerHTML=`<b>Decisión</b> · ${escapeText(item.decisionSummary||'Sin detalle')}`;
          const interventionCopy=documentLike.createElement('p');interventionCopy.innerHTML=`<b>Intervención</b> · ${escapeText(item.interventionSummary||'Sin detalle')}`;
          const expectedCopy=documentLike.createElement('p');expectedCopy.innerHTML=`<b>Esperado</b> · ${escapeText(item.expectedOutcome||'Sin detalle')}`;
          article.append(head,signalCopy,decisionCopy,interventionCopy,expectedCopy);
          if(item.status==='cerrado'){
            const result=documentLike.createElement('p');
            result.className='m26-action-outcome-result';
            result.innerHTML=`<b>Resultado</b> · ${escapeText(item.outcomeSummary||'Registrado')}`;
            article.append(result);
          }else{
            const outcomeForm=documentLike.createElement('form');
            outcomeForm.setAttribute('data-engagement-form','action-outcome');
            outcomeForm.dataset.clientId=clientId;
            outcomeForm.dataset.trackingId=item.id;
            outcomeForm.dataset.baseRevision=String(item.revision);
            const outcomeStatus=createSelect(documentLike,'Resultado observado','outcomeStatus',[
              ['improved','Mejoró'],['stable','Estable'],['worse','Empeoró'],['mixed','Mixto'],['not_assessable','No evaluable'],
            ]);
            const outcomeSummary=createTextarea(documentLike,'Qué ocurrió','outcomeSummary',1600);
            const evidence=createTextarea(documentLike,'Evidencia / contexto','outcomeEvidence',1600);
            const reviewed=createField(documentLike,'Revisado el','reviewedAt','date');reviewed.input.value=civilDateOffset(0);
            const close=documentLike.createElement('button');close.type='submit';close.setAttribute('data-engagement-action','save-action-outcome');close.textContent='Cerrar con resultado';
            const outcomeFeedback=documentLike.createElement('p');outcomeFeedback.setAttribute('data-engagement-status','action-outcome');outcomeFeedback.setAttribute('role','status');outcomeFeedback.setAttribute('aria-live','polite');
            outcomeForm.append(outcomeStatus.label,outcomeSummary.label,evidence.label,reviewed.label,close,outcomeFeedback);
            article.append(outcomeForm);
          }
          history.append(article);
        }
      }else{
        const empty=documentLike.createElement('p');empty.className='m26-action-outcome-empty';empty.textContent='Registra la primera decisión cuando una señal justifique una intervención y quieras comprobar después qué ocurrió.';history.append(empty);
      }

      manager.append(summary,metrics,form,history);
      meta.append(manager);
    }
    return true;
  }
  function scheduleActionOutcomeManagers(){if(actionOutcomeUiScheduled)return;actionOutcomeUiScheduled=true;const run=()=>{actionOutcomeUiScheduled=false;ensureActionOutcomeManagers();};if(typeof globalThis.queueMicrotask==='function')globalThis.queueMicrotask(run);else Promise.resolve().then(run);}
  function scheduleClientManagers(){scheduleCommercialRenewalManagers();scheduleActionOutcomeManagers();}

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
  async function actionTracking(button){
    const form=button?.closest?.('[data-engagement-form="action-tracking"]');
    if(!form)throw new Error('M26_ACTION_TRACKING_FORM_REQUIRED');
    ensureValidForm(form);
    const {role}=context();
    if(!['admin','coach'].includes(role))throw new Error('M26_ACTION_TRACKING_ROLE_FORBIDDEN');
    if(!service?.recordActionTracking)throw new Error('M26_ACTION_TRACKING_BACKEND_CAPABILITY_REQUIRED');
    const clientId=String(form.dataset?.clientId||'').trim();
    if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');
    const values=formValues(form);
    const result=await service.recordActionTracking({clientId,tracking:values});
    if(!result?.ok)throw new Error('M26_ACTION_TRACKING_NOT_CONFIRMED');
    if(typeof refreshState!=='function')throw new Error('M26_ACTION_TRACKING_REFRESH_REQUIRED');
    await refreshState({reason:'action-tracking-recorded'});
    const entityId=String(result?.command?.entityId||'');
    const persisted=actionOutcomeEntities(store.getState()?.collections?.m26Entities||[],clientId).find((item)=>item.id===entityId);
    if(!persisted)throw new Error('M26_ACTION_TRACKING_NOT_PERSISTED');
    ensureActionOutcomeManagers();
    const confirmed=root.querySelector?.(`[data-action-outcome-manager][data-client-id="${clientId}"]`);
    setStatus(confirmed||root,'action-tracking','Decisión registrada. El resultado queda pendiente de revisión.','success');
    return result;
  }
  async function actionOutcome(button){
    const form=button?.closest?.('[data-engagement-form="action-outcome"]');
    if(!form)throw new Error('M26_ACTION_OUTCOME_FORM_REQUIRED');
    ensureValidForm(form);
    const {role}=context();
    if(!['admin','coach'].includes(role))throw new Error('M26_ACTION_OUTCOME_ROLE_FORBIDDEN');
    if(!service?.recordActionOutcome)throw new Error('M26_ACTION_OUTCOME_BACKEND_CAPABILITY_REQUIRED');
    const clientId=String(form.dataset?.clientId||'').trim();
    const trackingId=String(form.dataset?.trackingId||'').trim();
    const baseRevision=Number(form.dataset?.baseRevision||0);
    if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');
    if(!trackingId)throw new Error('M26_ACTION_OUTCOME_ID_REQUIRED');
    const result=await service.recordActionOutcome({clientId,trackingId,baseRevision,outcome:formValues(form)});
    if(!result?.ok)throw new Error('M26_ACTION_OUTCOME_NOT_CONFIRMED');
    if(typeof refreshState!=='function')throw new Error('M26_ACTION_OUTCOME_REFRESH_REQUIRED');
    await refreshState({reason:'action-outcome-recorded'});
    const persisted=actionOutcomeEntities(store.getState()?.collections?.m26Entities||[],clientId).find((item)=>item.id===trackingId);
    if(!persisted||persisted.status!=='cerrado')throw new Error('M26_ACTION_OUTCOME_NOT_PERSISTED');
    ensureActionOutcomeManagers();
    const confirmed=root.querySelector?.(`[data-action-outcome-manager][data-client-id="${clientId}"]`);
    setStatus(confirmed||root,'action-outcome','Resultado confirmado y seguimiento cerrado.','success');
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
      else if(action==='save-action-tracking')await actionTracking(button);
      else if(action==='save-action-outcome')await actionOutcome(button);
      else throw new Error('M26_ENGAGEMENT_ACTION_UNKNOWN');
    }catch(error){
      const isRenewal=action==='save-commercial-renewal';
      const isOutcome=action==='save-action-tracking'||action==='save-action-outcome';
      const scope=isRenewal?'commercial-renewal':action==='save-action-tracking'?'action-tracking':action==='save-action-outcome'?'action-outcome':action?.includes('private-note')?'private-note':action?.includes('habit')?'habit':'checkin';
      const statusRoot=isRenewal?(button?.closest?.('[data-engagement-form="commercial-renewal"]')||root):isOutcome?(button?.closest?.('[data-action-outcome-manager]')||root):root;
      setStatus(statusRoot,scope,isRenewal?friendlyRenewalError(error):isOutcome?friendlyActionOutcomeError(error):friendlyError(error),'error');
      dispatchError(root,action,error);
    }finally{
      if(button){button.disabled=wasDisabled;button.removeAttribute('aria-busy');}
    }
  }
  async function onClick(event){const button=event.target.closest?.('[data-engagement-action]');if(!button)return;const action=button.getAttribute('data-engagement-action');if(button.closest?.('form')&&['submit-checkin','define-habit','save-commercial-renewal','save-action-tracking','save-action-outcome'].includes(action))return;event.preventDefault?.();await executeAction(action,button);}
  async function onSubmit(event){const form=event.target.closest?.('[data-engagement-form]');if(!form)return;event.preventDefault?.();const scope=form.getAttribute('data-engagement-form');const action=scope==='checkin'?'submit-checkin':scope==='habit-definition'?'define-habit':scope==='commercial-renewal'?'save-commercial-renewal':scope==='action-tracking'?'save-action-tracking':scope==='action-outcome'?'save-action-outcome':null;if(!action)return;const button=event.submitter?.matches?.(`[data-engagement-action="${action}"]`)?event.submitter:form.querySelector?.(`[data-engagement-action="${action}"]`);await executeAction(action,button);}
  function scheduleRestore(event){const area=event?.target?.closest?.('[data-m26-area]')?.getAttribute?.('data-m26-area');if(area&&area!=='actividad'&&area!=='clientes')return;if(!area||area==='clientes')scheduleClientManagers();if(area==='clientes')return;if(restoreScheduled)return;restoreScheduled=true;queueMicrotask(()=>{restoreScheduled=false;void restore();});}
  async function restoreScope(scope,formSelector){const {clientId}=context();if(!clientId)return;const record=await draftRepository.load(clientId,scope);const form=root.querySelector?.(formSelector);if(!record?.value||!form)return;for(const [key,value] of Object.entries(record.value)){const field=form.elements?.namedItem?.(key);if(!field||value===null||value===undefined)continue;if(field.type==='checkbox'||field.type==='radio')field.checked=Boolean(value);else field.value=String(value);}setStatus(root,scope==='checkin'?'checkin':'habit','Borrador local recuperado. Aún no está confirmado.','pending');}
  async function restore(){await restoreScope('checkin','[data-engagement-form="checkin"]');await restoreScope('habit-definition','[data-engagement-form="habit-definition"]');}
  return Object.freeze({mount(){if(mounted)return;root.addEventListener('click',onClick);root.addEventListener('click',scheduleRestore);root.addEventListener('submit',onSubmit);mounted=true;scheduleClientManagers();if(typeof globalThis.MutationObserver==='function'){renewalObserver=new globalThis.MutationObserver(scheduleClientManagers);renewalObserver.observe(root,{childList:true,subtree:true});}void restore();},destroy(){if(!mounted)return;root.removeEventListener('click',onClick);root.removeEventListener('click',scheduleRestore);root.removeEventListener('submit',onSubmit);renewalObserver?.disconnect?.();renewalObserver=null;mounted=false;},restore,saveCheckinDraft,saveHabitDraft,ensureCommercialRenewalManagers,ensureActionOutcomeManagers});
}
