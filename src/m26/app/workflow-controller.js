import {buildIriCommand} from '../workflows/iri-workflow.js';
import {buildCycleCommand} from '../workflows/planning-workflow.js';
import {buildAppointmentCommand} from '../workflows/agenda-workflow.js';
import {applyAdaptiveContext} from '../intelligence/adaptive-context.js';
import {generateSessionProposal} from '../intelligence/session-engine.js';
import {createM26Id} from '../platform/id.js';
import {createExerciseSearchIndex} from '../exercises/search.js';
import {normalizeAppointmentModality,normalizeClientModality} from '../domain/modality.js';
import {buildPublicationCommand,publicationConfig} from '../workflows/publication-workflow.js';
import {buildApproveReportDraftCommand} from '../workflows/report-workflow.js';
import {renderExerciseLibraryGroups} from '../library/exercise-media-ui.js';

function values(form){return Object.fromEntries(new FormData(form).entries());}
function ensureValidForm(form){if(typeof form?.checkValidity==='function'&&!form.checkValidity()){form.reportValidity?.();throw new Error('M26_FORM_INVALID');}return form;}
function status(root,scope,message,kind='info'){const node=root.querySelector?.(`[data-workflow-status="${scope}"]`);if(!node)return;node.textContent=message;node.dataset.status=kind;}
function clearStatus(root,scope){const node=root.querySelector?.(`[data-workflow-status="${scope}"]`);if(!node)return;node.textContent='';if(node.dataset)delete node.dataset.status;}
export function syncAppointmentFormState(form,root=form?.ownerDocument||null){
  if(!form)return {modality:null,locationRequired:false,trainingAddress:null};

  const modalityField=form.elements?.namedItem?.('modality')||form.querySelector?.('[name="modality"]');
  const clientField=form.elements?.namedItem?.('clientId')||form.querySelector?.('[name="clientId"]');
  const locationField=form.elements?.namedItem?.('location')||form.querySelector?.('[name="location"]');
  const help=form.querySelector?.('#m26-location-help');
  const modality=normalizeAppointmentModality(modalityField?.value);
  const locationRequired=modality==='presencial';
  const selectedOption=clientField?.selectedOptions?.[0]||clientField?.options?.[clientField?.selectedIndex]||null;
  const trainingAddress=String(selectedOption?.dataset?.trainingAddress||'').trim();

  if(locationField){
    const previousAutofill=String(locationField.dataset?.m26AutofilledValue||'');
    const current=String(locationField.value||'').trim();

    locationField.required=locationRequired;
    if(locationRequired)locationField.setAttribute?.('required','');
    else locationField.removeAttribute?.('required');

    if(locationRequired&&trainingAddress&&(!current||current===previousAutofill)){
      locationField.value=trainingAddress;
      if(locationField.dataset)locationField.dataset.m26AutofilledValue=trainingAddress;
    }else if(!locationRequired&&previousAutofill&&current===previousAutofill){
      locationField.value='';
      if(locationField.dataset)delete locationField.dataset.m26AutofilledValue;
    }
  }

  if(help){
    help.textContent=locationRequired
      ? trainingAddress
        ? 'Se ha propuesto la dirección habitual del expediente. Revísala antes de guardar.'
        : 'La ubicación es obligatoria para citas presenciales. Registra también la dirección habitual en el expediente.'
      : modality==='online'
        ? 'Añade un enlace o instrucciones únicamente cuando corresponda.'
        : 'La sesión guiada se realiza dentro de la aplicación.';
  }

  clearStatus(root,'appointment');
  return {modality,locationRequired,trainingAddress:trainingAddress||null};
}

function numberOrNull(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function emit(root,name,detail){root.dispatchEvent(new CustomEvent(name,{bubbles:true,detail}));}
function escape(value){return String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
function normalizedStatus(record){return String(record?.status||record?.estado||record?.body?.status||record?.body?.estado||'').trim().toLowerCase();}
const PUBLISHED_SESSION_STATES=new Set(['published','publicado','active','activo','enabled','habilitado']);
function libraryCards(items,mediaMap,role){
  return renderExerciseLibraryGroups(items,mediaMap,{role})||'<p class="m26-empty-copy">No hay coincidencias.</p>';
}
function friendlyError(error){const code=String(error?.message||error||'');if(/ROLE|FORBIDDEN|CLIENT_CONTEXT|NOT_VISIBLE/.test(code))return 'No tienes permiso o falta seleccionar un cliente válido.';if(/DATE|CHRONOLOGY|INVALID|REQUIRED/.test(code))return 'Revisa los campos obligatorios y sus fechas.';if(/NETWORK|TIMEOUT|FETCH/.test(code))return 'No fue posible conectar. Tu información local permanece protegida.';return 'No fue posible completar la acción. Revisa los datos e inténtalo nuevamente.';}

export function createWorkflowController({root,store,commandBus,catalog,mediaMap,getRegistry=()=>[],onRender=()=>{},isOnline=()=>globalThis.navigator?.onLine!==false}={}){
  if(!root?.addEventListener||!store?.getState||!commandBus?.execute)throw new Error('M26_WORKFLOW_CONTROLLER_REQUIRED');let mounted=false;const catalogSearch=createExerciseSearchIndex(catalog?.list?.()||[]);
  function context(){const state=store.getState();const role=String(state.identity?.role||'').toLowerCase();const clientId=['client','cliente'].includes(role)?state.identity?.clientId:state.selectedClientId;return {state,role,clientId};}
  function requireCoach(){const {role}=context();if(!['admin','coach'].includes(role))throw new Error('M26_WORKFLOW_ROLE_FORBIDDEN');}
  function requireVisibleClient(clientId){const {state}=context();if(!clientId||(state.collections.clients||[]).every((item)=>item.id!==clientId))throw new Error('M26_CLIENT_NOT_VISIBLE');return clientId;}
  async function completeIri(){requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');ensureValidForm(form);const raw=values(form);const {clientId,state}=context();requireVisibleClient(clientId);const current=(state.collections.iriAssessments||[]).find((item)=>(item.clientId||item.client_id)===clientId&&String(item.id)===String(raw.entityId));if(!current?.id)throw new Error('M26_IRI_REMOTE_ENTITY_REQUIRED');const draft={...current,id:current.id,clientId,assessmentDate:raw.assessmentDate,birthDate:raw.birthDate,sexForNorms:raw.sexForNorms,stepFinalHr:numberOrNull(raw.stepFinalHr),stepOneMinuteHr:numberOrNull(raw.stepOneMinuteHr),pushUps:numberOrNull(raw.pushUps),chairStand30s:numberOrNull(raw.chairStand30s),bodyComposition:{bodyFatPercent:numberOrNull(raw.bodyFatPercent)},strengthPatterns:{push:numberOrNull(raw.pushUps),lower:numberOrNull(raw.chairStand30s)}};const result=await commandBus.execute(buildIriCommand(draft,Number(current.revision||0)));status(root,'iri',result.ok?'IRI confirmado.':'IRI pendiente de revisión.',result.ok?'success':'pending');return result;}
  async function validatePlan(){requireCoach();const form=root.querySelector?.('[data-workflow-form="planning"]');if(!form)throw new Error('M26_PLAN_FORM_REQUIRED');ensureValidForm(form);const raw=values(form);const {clientId,state}=context();requireVisibleClient(clientId);const draft={id:raw.entityId||createM26Id(),clientId,name:String(raw.name||'').trim(),startDate:raw.startDate,endDate:raw.endDate,goal:String(raw.goal||'').trim()};const current=(state.collections.trainingCycles||[]).find((item)=>String(item.id)===String(draft.id)&&(item.clientId||item.client_id)===clientId);const result=await commandBus.execute(buildCycleCommand(draft,Number(current?.revision||0)));status(root,'planning',result.ok?'Plan validado.':'Plan pendiente de confirmación.',result.ok?'success':'pending');return result;}
  async function createAppointment(){requireCoach();const form=root.querySelector?.('[data-workflow-form="appointment"]');if(!form)throw new Error('M26_APPOINTMENT_FORM_REQUIRED');syncAppointmentFormState(form,root);ensureValidForm(form);const raw=values(form);const clientId=requireVisibleClient(String(raw.clientId||''));const start=new Date(raw.startAt),end=new Date(raw.endAt);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))throw new Error('M26_APPOINTMENT_DATE_INVALID');const modality=normalizeAppointmentModality(raw.modality);if(!modality)throw new Error('M26_APPOINTMENT_MODALITY_INVALID');const draft={clientId,startAt:start.toISOString(),endAt:end.toISOString(),modality,location:String(raw.location||'').trim().slice(0,300)};const result=await commandBus.execute(buildAppointmentCommand(draft,0));status(root,'appointment',result.ok?'Propuesta de cita creada. Aún no es visible para el cliente.':'La propuesta está pendiente de confirmación.',result.ok?'success':'pending');if(result.ok){form.reset();syncAppointmentFormState(form,root);status(root,'appointment','Propuesta de cita creada. Aún no es visible para el cliente.','success');}return result;}
  function openBuilder(){requireCoach();const {clientId}=context();requireVisibleClient(clientId);emit(root,'m26:open-session-builder',{clientId});status(root,'session','Constructor abierto.','success');}
  function startSession(button){const {clientId,state}=context();requireVisibleClient(clientId);const requestedId=String(button?.dataset?.entityId||'');const candidates=(state.collections.sessions||[]).filter((item)=>(item.clientId||item.client_id)===clientId&&PUBLISHED_SESSION_STATES.has(normalizedStatus(item))).sort((a,b)=>Number(b.revision||b.body?.revision||0)-Number(a.revision||a.body?.revision||0));const session=requestedId?candidates.find((item)=>String(item.id||item.body?.id||'')===requestedId):candidates[0];if(!session)throw new Error('M26_SESSION_PUBLISHED_REQUIRED');emit(root,'m26:start-session',{clientId,session});status(root,'session','Preparando sesión guiada.','success');}
  function generateIntelligence(){requireCoach();const form=root.querySelector?.('[data-workflow-form="intelligence"]');if(!form)throw new Error('M26_INTELLIGENCE_FORM_REQUIRED');ensureValidForm(form);const raw=values(form);const {clientId,state}=context();requireVisibleClient(clientId);const modality=normalizeClientModality(raw.modality);if(!modality)throw new Error('M26_INTELLIGENCE_MODALITY_INVALID');const input=applyAdaptiveContext({clientId,goal:raw.goal,durationMinutes:Number(raw.durationMinutes),experience:raw.experience,modality,ageYears:Number(raw.ageYears),equipment:String(raw.equipment||'').split(',').map((x)=>x.trim()).filter(Boolean),restrictions:[],painAreas:[],contraindications:[]},state,clientId);const proposal=generateSessionProposal(input,catalog);const preview=root.querySelector?.('[data-intelligence-preview]');if(preview)preview.innerHTML=`<section class="m26-notice is-${proposal.requiresManualReview?'warning':'success'}"><strong>${escape(proposal.exercises.length)} ejercicios propuestos</strong><p>${escape(proposal.estimatedMinutes)} min · ${escape(proposal.structure.type)} · revisión del entrenador obligatoria.</p></section><div class="m26-stack">${proposal.exercises.map((item)=>`<article class="m26-list-card"><div><h3>${escape(item.name)}</h3><p>${escape(item.sets)} series · ${escape(item.reps)} · RPE ${escape(item.targetRpe)}</p></div></article>`).join('')}</div>`;status(root,'intelligence',proposal.requiresManualReview?'Propuesta conservadora: requiere revisión manual.':'Propuesta lista para revisión.',proposal.requiresManualReview?'pending':'success');emit(root,'m26:intelligence-proposal',{proposal});return proposal;}

  function publicationScope(entity){return entity==='planning'?'planning':entity==='report'?'report':'session';}
  function publicationMessage(action){return ({approve:'Contenido aprobado y pendiente de publicación.',publish:'Contenido publicado para el cliente.',withdraw:'Contenido retirado de la vista del cliente.',archive:'Plan archivado.',reopen:'Plan reabierto como borrador.'})[action]||'Cambio confirmado.';}
  function findPublicationRecord(entity,entityId){const config=publicationConfig(entity);if(!config)throw new Error('M26_PUBLICATION_ENTITY_INVALID');const {state}=context();const record=(state.collections?.[config.collection]||[]).find((item)=>String(item?.id||item?.body?.id||'')===String(entityId||''));if(!record)throw new Error('M26_PUBLICATION_RECORD_NOT_FOUND');const clientId=record.clientId||record.client_id||record.body?.clientId||record.body?.client_id;requireVisibleClient(clientId);return record;}
  async function managePublication(button){requireCoach();if(!isOnline())throw new Error('M26_OFFLINE_PUBLICATION_NOT_ALLOWED');const entity=String(button?.dataset?.publicationEntity||'');const action=String(button?.dataset?.publicationAction||'');const entityId=String(button?.dataset?.entityId||'');const card=button.closest?.('[data-publication-card]');const previewAccepted=Boolean(card?.querySelector?.('[data-publication-preview]')?.checked);const reason=String(card?.querySelector?.('[data-publication-reason]')?.value||'');const {role}=context();const record=findPublicationRecord(entity,entityId);const command=buildPublicationCommand({entity,action,record,role,previewAccepted,reason});const result=await commandBus.execute(command);const scope=publicationScope(entity);status(root,scope,result.ok?publicationMessage(action):'El cambio no está confirmado y requiere revisión.',result.ok?'success':'pending');if(result.ok)onRender();return result;}
  async function approveReport(){requireCoach();if(!isOnline())throw new Error('M26_OFFLINE_PUBLICATION_NOT_ALLOWED');const form=root.querySelector?.('[data-workflow-form="report-approval"]');if(!form)throw new Error('M26_REPORT_FORM_REQUIRED');ensureValidForm(form);const raw=values(form);const {clientId}=context();requireVisibleClient(clientId);const command=buildApproveReportDraftCommand({id:raw.entityId||createM26Id(),clientId,assessmentId:raw.assessmentId,title:raw.title,periodStart:raw.periodStart,periodEnd:raw.periodEnd,summary:raw.summary,conclusions:raw.conclusions,recommendations:raw.recommendations,reviewAccepted:raw.reviewAccepted==='on'},0);const result=await commandBus.execute(command);status(root,'report',result.ok?'Informe aprobado y listo para publicación.':'El informe no está confirmado y requiere revisión.',result.ok?'success':'pending');if(result.ok){form.reset();onRender();}return result;}

  async function executeWorkflowAction(action,button){const wasDisabled=Boolean(button?.disabled);if(button){button.disabled=true;button.setAttribute('aria-busy','true');}try{if(action==='complete-iri')await completeIri();else if(action==='validate-plan')await validatePlan();else if(action==='create-appointment')await createAppointment();else if(action==='open-session-builder')openBuilder();else if(action==='start-published-session')startSession(button);else if(action==='generate-intelligence')generateIntelligence();else if(action==='manage-publication')await managePublication(button);else if(action==='approve-report')await approveReport();else throw new Error('M26_WORKFLOW_ACTION_UNKNOWN');}catch(error){const scope=action?.includes('iri')?'iri':action?.includes('plan')?'planning':action?.includes('appointment')?'appointment':action?.includes('intelligence')?'intelligence':action?.includes('report')?'report':button?.dataset?.publicationEntity==='report'?'report':button?.dataset?.publicationEntity==='planning'?'planning':'session';status(root,scope,friendlyError(error),'error');emit(root,'m26:workflow-error',{action,code:String(error?.message||error)});}finally{if(button){button.disabled=wasDisabled;button.removeAttribute('aria-busy');}}}
  async function onClick(event){const button=event.target.closest?.('[data-workflow-action]');if(!button||button.closest?.('form'))return;event.preventDefault?.();await executeWorkflowAction(button.getAttribute('data-workflow-action'),button);}
  async function onSubmit(event){const form=event.target.closest?.('[data-workflow-form]');if(!form)return;event.preventDefault?.();const button=event.submitter?.matches?.('[data-workflow-action]')?event.submitter:form.querySelector?.('[data-workflow-action]');if(!button)return;await executeWorkflowAction(button.getAttribute('data-workflow-action'),button);}
  function foldSearch(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
  function onInput(event){
    const appointmentForm=event.target.closest?.('[data-workflow-form="appointment"]');
    if(appointmentForm){
      syncAppointmentFormState(appointmentForm,root);
      return;
    }

    const clientSearch=event.target.closest?.('[data-client-search]');
    if(clientSearch){
      const query=foldSearch(clientSearch.value);
      let visible=0;
      for(const card of root.querySelectorAll?.('[data-client-text]')||[]){
        const match=!query||String(card.getAttribute?.('data-client-text')||'').includes(query);
        card.hidden=!match;
        if(match)visible++;
      }
      const statusNode=root.querySelector?.('[data-client-search-status]');
      if(statusNode)statusNode.textContent=query
        ?`${visible} ${visible===1?'cliente encontrado':'clientes encontrados'}`
        :`Mostrando ${visible} ${visible===1?'cliente':'clientes'}.`;
      return;
    }

    const search=event.target.closest?.('[data-library-search]');
    if(!search)return;
    const query=String(search.value||'').trim();
    const filtered=catalogSearch.search(query,{limit:catalog?.count||367});
    const grid=root.querySelector?.('[data-library-grid]');
    if(grid){const {role}=context();grid.innerHTML=libraryCards(filtered,mediaMap,role);}
    const node=root.querySelector?.('[data-library-status]');
    if(node)node.textContent=`${filtered.length} ${filtered.length===1?'ejercicio visible':'ejercicios visibles'}`;
  }
  return Object.freeze({
    mount(){
      if(mounted)return;
      root.addEventListener('click',onClick);
      root.addEventListener('submit',onSubmit);
      root.addEventListener('input',onInput);
      syncAppointmentFormState(
        root.querySelector?.('[data-workflow-form="appointment"]'),
        root
      );
      mounted=true;
    },
    destroy(){
      if(!mounted)return;
      root.removeEventListener('click',onClick);
      root.removeEventListener('submit',onSubmit);
      root.removeEventListener('input',onInput);
      mounted=false;
    },
  });
}
