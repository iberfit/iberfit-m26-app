import {buildIriCommand} from '../workflows/iri-workflow.js';
import {buildCycleCommand} from '../workflows/planning-workflow.js';
import {buildAppointmentCommand,buildConfirmAppointmentCommand} from '../workflows/agenda-workflow.js';
import {applyAdaptiveContext} from '../intelligence/adaptive-context.js';
import {generateSessionProposal} from '../intelligence/session-engine.js';
import {createM26Id} from '../platform/id.js';
import {createExerciseSearchIndex} from '../exercises/search.js';
import {normalizeAppointmentModality,normalizeClientModality} from '../domain/modality.js';
import {buildPublicationCommand,publicationConfig} from '../workflows/publication-workflow.js';
import {buildApproveReportDraftCommand} from '../workflows/report-workflow.js';
import {renderExerciseLibraryGroups} from '../library/exercise-media-ui.js';
import {resolveExerciseMedia} from '../library/exercise-media.js';
import {
  CLIENT_ONBOARDING_DRAFT_SCOPE,CLIENT_ONBOARDING_LOCAL_ID,
  legacyClientDraftPayload,createdClientResultId,clientDraftEmail,
} from '../workflows/client-onboarding.js';
import {
  IRI_FIRST_SESSION_STEPS,
  buildIriCommandDraftFromFirstSession,
  confirmedFirstSessionDraft,
  firstSessionCompletion,
  flattenFirstSessionDraft,
  normalizeFirstSessionDraft,
  validateFirstSessionDraft,
  validateFirstSessionStep,
} from '../workflows/iri-first-session.js';
import {openIriReportPrint} from '../workflows/iri-report-document.js';
import {scoreNormedTest} from '../norms/norms-engine.js';
import {deriveAgeYears} from '../workflows/iri-profile.js';
import {protocolComparabilityWarnings} from '../workflows/iri-protocol-catalog.js';

const IRI_DRAFT_SCOPE='iri-first-session';
const PUBLISHED_SESSION_STATES=new Set(['published','publicado','active','activo','enabled','habilitado']);
const IRI_FIELD_LABELS=Object.freeze({
  assessmentDate:'fecha de evaluación',birthDate:'fecha de nacimiento',sexForNorms:'sexo para baremos',email:'correo electrónico',phone:'teléfono',modality:'modalidad',trainingAddress:'dirección de entrenamiento',primaryObjective:'objetivo principal',screeningAccepted:'cribado y seguridad',trainingExperience:'experiencia',availability:'disponibilidad',bodyCompositionSkipReason:'motivo de no realización',bodyCompositionMeasurement:'al menos una medición corporal',mobilitySkipReason:'motivo de no realización',ankleTrials:'mediciones de tobillo',posteriorTrials:'mediciones de cadena posterior',hipRotationResult:'rotación de cadera',squatDepth:'sentadilla asistida',strengthSkipReason:'motivo de no realización',chairStand30s:'silla 30 segundos',pushTest:'prueba de empuje',trxRow:'remo TRX',frontPlank:'plancha frontal',cardioSkipReason:'motivo de no realización',cardioValid:'validez del test',cardioHeartRate:'frecuencia cardiaca final y al minuto',cardioDuration:'duración del test',diagnosisStrengths:'fortalezas',diagnosisPriorities:'prioridades',coachInterpretation:'interpretación del Coach',initialPlan:'plan inicial',reviewAccepted:'revisión profesional',coreDomains:'al menos dos dominios objetivos completos',weeklyFrequency:'frecuencia semanal',sessionDurationMinutes:'duración habitual',
});
const IRI_ERROR_FIELD_TARGET=Object.freeze({
  bodyCompositionMeasurement:'weightKg',ankleTrials:'ankleLeft1',posteriorTrials:'posteriorLeft1',hipRotationResult:'hipRotationResult',squatDepth:'squatDepth',chairStand30s:'chairStand30s',pushTest:'pushVariant',trxRow:'trxRowRepetitions',frontPlank:'frontPlankSeconds',cardioValid:'cardioValid',cardioHeartRate:'stepFinalHr',cardioDuration:'cardioDurationSeconds',diagnosisStrengths:'diagnosisStrengths',diagnosisPriorities:'diagnosisPriorities',coachInterpretation:'coachInterpretation',initialPlan:'initialPlan',reviewAccepted:'reviewAccepted',bodyCompositionSkipReason:'bodyCompositionSkipReason',mobilitySkipReason:'mobilitySkipReason',strengthSkipReason:'strengthSkipReason',cardioSkipReason:'cardioSkipReason',
});
const ONBOARDING_FIELD_LABELS=Object.freeze({
  name:'nombre completo',email:'correo electrónico',phone:'teléfono',birthDate:'fecha de nacimiento',sexForNorms:'sexo para baremos',modality:'modalidad',weeklyFrequency:'frecuencia semanal',sessionDurationMinutes:'duración habitual',primaryObjective:'objetivo principal',
});

function values(form){return Object.fromEntries(new FormData(form).entries());}
function invalidFormControls(form){return [...(form?.elements||[])].filter((control)=>typeof control?.checkValidity==='function'&&!control.checkValidity());}
function clearControlValidation(control){if(!control)return;control.removeAttribute?.('aria-invalid');control.closest?.('label')?.classList?.remove?.('is-invalid');}
function focusInvalidControl(control){if(!control)return;control.setAttribute?.('aria-invalid','true');control.closest?.('label')?.classList?.add?.('is-invalid');control.scrollIntoView?.({block:'center',behavior:'smooth'});control.focus?.({preventScroll:true});}
function ensureValidForm(form,{code='M26_FORM_INVALID',labels={},summary='Revisa los campos obligatorios'}={}){
  const invalid=invalidFormControls(form);if(!invalid.length)return form;
  for(const control of invalid){control.setAttribute?.('aria-invalid','true');control.closest?.('label')?.classList?.add?.('is-invalid');}
  const first=invalid[0];focusInvalidControl(first);const names=[...new Set(invalid.map((control)=>String(control.name||'').trim()).filter(Boolean))];const readable=names.map((name)=>labels[name]||name).filter(Boolean);const error=new Error(`${code}:${names.join(',')}`);error.userMessage=readable.length?`${summary}: ${readable.join(', ')}.`:`${summary}.`;throw error;
}
const WORKFLOW_STATUS_MEMORY=new WeakMap();
function statusStore(root){let store=WORKFLOW_STATUS_MEMORY.get(root);if(!store){store=new Map();WORKFLOW_STATUS_MEMORY.set(root,store);}return store;}
function paintStatus(root,scope,entry){const node=root?.querySelector?.(`[data-workflow-status="${scope}"]`);if(!node||!entry)return false;const message=String(entry.message||'');const kind=String(entry.kind||'info');if(node.textContent!==message)node.textContent=message;if(node.dataset?.status!==kind)node.dataset.status=kind;return true;}
function status(root,scope,message,kind='info'){const entry={message:String(message||''),kind:String(kind||'info')};statusStore(root).set(scope,entry);paintStatus(root,scope,entry);}
function clearStatus(root,scope,{forget=true}={}){const store=statusStore(root);if(forget)store.delete(scope);const node=root?.querySelector?.(`[data-workflow-status="${scope}"]`);if(!node)return false;let changed=false;if(node.textContent!==''){node.textContent='';changed=true;}if(node.dataset?.status!==undefined){delete node.dataset.status;changed=true;}return changed;}
function clearAllStatuses(root){statusStore(root).clear();for(const node of root?.querySelectorAll?.('[data-workflow-status]')||[]){node.textContent='';if(node.dataset?.status!==undefined)delete node.dataset.status;}}
function restoreStatuses(root){for(const [scope,entry] of statusStore(root))paintStatus(root,scope,entry);}
function wait(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}
async function withTimeout(promise,ms=20_000,code='M26_WORKFLOW_TIMEOUT'){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(code)),ms);})]);}finally{clearTimeout(timer);}}

function emit(root,name,detail){root.dispatchEvent(new CustomEvent(name,{bubbles:true,detail}));}
function escape(value){return String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
function normalizedStatus(record){return String(record?.status||record?.estado||record?.body?.status||record?.body?.estado||'').trim().toLowerCase();}
function foldSearch(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
function libraryCards(items,mediaMap,role){return renderExerciseLibraryGroups(items,mediaMap,{role})||'<p class="m26-empty-copy">No hay coincidencias.</p>';}
function libraryFilterState(root){const out={};for(const node of root.querySelectorAll?.('[data-library-filter]')||[])out[node.getAttribute('data-library-filter')]=foldSearch(node.value);return out;}
function clientFilterState(root){const out={};for(const node of root.querySelectorAll?.('[data-client-filter]')||[])out[node.getAttribute('data-client-filter')]=foldSearch(node.value);return out;}
function filterLibraryItems(items,filters,mediaMap,role){return items.filter((item)=>{const equipment=foldSearch(item.equipment);const pattern=foldSearch(item.pattern);if(filters.equipment&&!equipment.includes(filters.equipment))return false;if(filters.pattern&&!pattern.includes(filters.pattern))return false;if(filters.visual){const has=Boolean(resolveExerciseMedia(mediaMap,item.id,{role}));if(filters.visual==='with-image'&&!has)return false;if(filters.visual==='without-image'&&has)return false;}return true;});}
function recordBody(record={}){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:record;}
function clientRecordId(value){return createdClientResultId(value);}
function clientEmail(record){return clientDraftEmail(record);}
function clientName(record){const body=recordBody(record);return String(record?.name||record?.fullName||body?.name||body?.fullName||'Cliente IBERFIT').trim();}
function friendlyError(error){
  if(error?.userMessage)return String(error.userMessage);
  const code=String(error?.message||error||'');
  if(/ROLE|FORBIDDEN|CLIENT_CONTEXT|NOT_VISIBLE/.test(code))return 'No tienes permiso o falta seleccionar un cliente válido.';
  if(/CLIENT_CREATE_CANARY_ONLY/.test(code))return 'La creación de clientes está limitada al entorno canary.';
  if(/CLIENT_ONBOARDING_BACKEND_REQUIRED/.test(code))return 'La actualización segura del alta todavía no está instalada en el backend. El borrador permanece guardado y no se ha creado ningún expediente.';
  if(/CLIENT_ONBOARDING_BACKEND_NOT_READY/.test(code))return 'El backend de altas no superó su comprobación de seguridad. El borrador permanece guardado y no se enviaron datos.';
  if(/V12_CLIENT_EMAIL_AMBIGUOUS/.test(code))return 'Existen varios registros remotos con ese correo. No se creó otro expediente; el borrador queda guardado para resolver la duplicidad.';
  if(/V12_CLIENT_EMAIL_ASSIGNED_OTHER_COACH/.test(code))return 'Ese correo ya pertenece a un expediente asignado a otro entrenador. No se creó ningún duplicado.';
  if(/V12_CLIENT_ROW_NOT_CREATED/.test(code))return 'El servicio histórico no creó una fila de cliente. El borrador queda guardado y no se mostrará un éxito falso.';
  if(/V12_CLIENT_ASSIGNMENT_NOT_CREATED|V12_CLIENT_NOT_VISIBLE_AFTER_ASSIGNMENT/.test(code))return 'El expediente no quedó asignado y visible para este entrenador. La operación se revirtió y el borrador permanece guardado.';
  if(/V12_COACH_ROLE_REQUIRED/.test(code))return 'La cuenta actual no tiene rol Coach o Administrador para crear expedientes.';
  if(/CLIENT_CREATE_INVALID_RESPONSE/.test(code))return 'El servidor no confirmó un identificador válido. El formulario se conserva y no se mostrará el expediente como creado.';
  if(/CLIENT_CREATE_NOT_PERSISTED/.test(code))return 'El servidor no hizo visible el expediente después de verificar la creación. El borrador queda guardado; no pulses crear otra vez hasta revisar la evidencia técnica.';
  if(/CLIENT_ONBOARDING_INVALID/.test(code))return 'Completa los datos obligatorios del expediente antes de crearlo.';
  if(/IRI_REMOTE_ENTITY_REQUIRED/.test(code))return 'El expediente todavía no dispone de una entidad IRI remota confirmable.';
  if(/IRI_RANGE_INVALID/.test(code))return 'Hay un valor fuera del rango permitido. Revisa el campo resaltado antes de continuar.';
  if(/IRI_CONFIRM_NOT_PERSISTED/.test(code))return 'La evaluación no apareció confirmada en el expediente. El borrador local se conserva para reintentar.';
  if(/IRI_REPORT_REQUIRES_CONFIRMATION/.test(code))return 'Confirma primero la evaluación IRI. Los informes solo se generan desde datos ya guardados en el expediente.';
  if(/IRI_CONFIRMED_REPORT_DATA_INVALID/.test(code))return 'El IRI está confirmado, pero su copia remota no contiene todos los datos necesarios para construir el informe. No se ha modificado el expediente.';
  if(/PLAN_CONFIRM_NOT_PERSISTED/.test(code))return 'El ciclo no apareció guardado en Planificación. El borrador local se conserva.';
  if(/APPOINTMENT_CONFIRM_NOT_PERSISTED/.test(code))return 'La cita no apareció confirmada tras actualizar la agenda. La propuesta permanece intacta.';
  if(/IRI_FIRST_SESSION_INVALID|FORM_INVALID/.test(code))return 'La primera sesión contiene datos pendientes o incoherentes. Revisa la etapa marcada.';
  if(/REPORT_POPUP_BLOCKED/.test(code))return 'El navegador bloqueó la vista del informe. Permite ventanas emergentes para este sitio.';
  if(/SESSION_INPUT_REQUIRED/.test(code))return 'Faltan datos de la propuesta. Revisa objetivo, duración, experiencia y modalidad.';
  if(/SESSION_NOT_ENOUGH_SAFE_EXERCISES/.test(code))return 'No hay suficientes ejercicios compatibles con el material y las restricciones actuales.';
  if(/DATE|CHRONOLOGY|INVALID|REQUIRED/.test(code))return 'Revisa los campos obligatorios y sus fechas.';
  if(/NETWORK|TIMEOUT|FETCH/.test(code))return 'No fue posible conectar. Tu información local permanece protegida.';
  return 'No fue posible completar la acción. Revisa los datos e inténtalo nuevamente.';
}


export function syncIriSkippedGroup(form,{toggleName,fieldNames=[],reasonName}={}){
  if(!form?.elements?.namedItem||!toggleName||!reasonName)return false;
  const skipped=Boolean(form.elements.namedItem(toggleName)?.checked);
  for(const name of fieldNames){
    const field=form.elements.namedItem(name);if(!field)continue;
    if(field.dataset&&field.dataset.iriRequiredBeforeSkip===undefined)field.dataset.iriRequiredBeforeSkip=field.required?'true':'false';
    field.disabled=skipped;
    field.setAttribute?.('aria-disabled',skipped?'true':'false');
    if(skipped){field.required=false;field.removeAttribute?.('required');}
    else if(field.dataset?.iriRequiredBeforeSkip==='true'){field.required=true;field.setAttribute?.('required','');}
  }
  const reason=form.elements.namedItem(reasonName);
  if(reason){
    reason.disabled=!skipped;
    reason.required=skipped;
    reason.setAttribute?.('aria-disabled',skipped?'false':'true');
    if(skipped)reason.setAttribute?.('required','');else reason.removeAttribute?.('required');
  }
  return skipped;
}

export function syncAppointmentFormState(form,root=form?.ownerDocument||null){
  if(!form)return {modality:null,locationRequired:false,trainingAddress:null};
  clearStatus(root,'appointment');
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
    if(locationRequired)locationField.setAttribute?.('required','');else locationField.removeAttribute?.('required');
    if(locationRequired&&trainingAddress&&(!current||current===previousAutofill)){
      locationField.value=trainingAddress;if(locationField.dataset)locationField.dataset.m26AutofilledValue=trainingAddress;
    }else if(!locationRequired&&previousAutofill&&current===previousAutofill){
      locationField.value='';if(locationField.dataset)delete locationField.dataset.m26AutofilledValue;
    }
  }
  if(help){
    help.textContent=locationRequired
      ?trainingAddress?'Se ha propuesto la dirección habitual del expediente. Revísala antes de guardar.':'La ubicación es obligatoria para citas presenciales. Registra también la dirección habitual en el expediente.'
      :modality==='online'?'Añade un enlace o instrucciones únicamente cuando corresponda.':'La sesión guiada se realiza dentro de la aplicación.';
  }
  return {modality,locationRequired,trainingAddress:trainingAddress||null};
}

export function createWorkflowController({
  root,store,commandBus,catalog,mediaMap,draftRepository=null,createClientDraft=null,
  getRegistry=()=>[],onRender=()=>{},refreshState=async()=>{},isOnline=()=>globalThis.navigator?.onLine!==false,
}={}){
  if(!root?.addEventListener||!store?.getState||!commandBus?.execute)throw new Error('M26_WORKFLOW_CONTROLLER_REQUIRED');
  let mounted=false,observer=null,scanQueued=false,iriSaveTimer=null,onboardingSaveTimer=null,iriTimer=null;
  const initializedIriForms=new WeakSet();
  const initializedOnboardingForms=new WeakSet();
  const initializedAppointmentForms=new WeakSet();
  const catalogSearch=createExerciseSearchIndex(catalog?.list?.()||[]);
  function updateLibrary(){const query=String(root.querySelector?.('[data-library-search]')?.value||'').trim();const {role}=context();const filters=libraryFilterState(root);const searched=catalogSearch.search(query,{limit:catalog?.count||367});const filtered=filterLibraryItems(searched,filters,mediaMap,role);const grid=root.querySelector?.('[data-library-grid]');if(grid)grid.innerHTML=libraryCards(filtered,mediaMap,role);const node=root.querySelector?.('[data-library-status]');if(node)node.textContent=`${filtered.length} ${filtered.length===1?'ejercicio visible':'ejercicios visibles'} con los filtros actuales.`;return filtered;}
  function updateClientList(queryOverride=null){const query=foldSearch(queryOverride===null?(root.querySelector?.('[data-client-search]')?.value||''):queryOverride);const filters=clientFilterState(root);const sort=String(root.querySelector?.('[data-client-sort]')?.value||'priority');const grid=root.querySelector?.('[data-client-grid]');const cards=[...(root.querySelectorAll?.('[data-client-text]')||[])];let visible=0;for(const card of cards){const text=String(card.getAttribute?.('data-client-text')||'');const iri=String(card.getAttribute?.('data-client-iri')||'');const modality=String(card.getAttribute?.('data-client-modality')||'');const match=(!query||text.includes(query))&&(!filters.iri||iri===filters.iri)&&(!filters.modality||modality.includes(filters.modality));card.hidden=!match;if(match)visible++;}if(grid){cards.sort((a,b)=>sort==='name'?String(a.dataset?.clientName||'').localeCompare(String(b.dataset?.clientName||''),'es',{sensitivity:'base'}):Number(a.dataset?.clientPriority||99)-Number(b.dataset?.clientPriority||99)||String(a.dataset?.clientName||'').localeCompare(String(b.dataset?.clientName||''),'es',{sensitivity:'base'}));for(const card of cards)grid.appendChild(card);}const node=root.querySelector?.('[data-client-search-status]');if(node){const hasFilters=Boolean(filters.iri||filters.modality);node.textContent=query&&!hasFilters?`${visible} ${visible===1?'cliente encontrado':'clientes encontrados'}`:`${visible} ${visible===1?'cliente visible':'clientes visibles'} con los filtros actuales.`;}return visible;}

  function context(){const state=store.getState();const role=String(state.identity?.role||'').toLowerCase();const clientId=['client','cliente'].includes(role)?state.identity?.clientId:state.selectedClientId;return {state,role,clientId};}
  function requireCoach(){const {role}=context();if(!['admin','coach'].includes(role))throw new Error('M26_WORKFLOW_ROLE_FORBIDDEN');}
  function requireVisibleClient(clientId){const {state}=context();if(!clientId||(state.collections.clients||[]).every((item)=>item.id!==clientId))throw new Error('M26_CLIENT_NOT_VISIBLE');return clientId;}
  function currentIriRecord(form=null){
    const {clientId,state}=context();const entityId=String(form?.elements?.namedItem?.('entityId')?.value||'');
    const records=(state.collections.iriAssessments||[]).filter((item)=>(item.clientId||item.client_id)===clientId);
    return (entityId?records.find((item)=>String(item.id)===entityId):null)||records.sort((a,b)=>String(b.assessmentDate||b.assessment_date||b.createdAt||'').localeCompare(String(a.assessmentDate||a.assessment_date||a.createdAt||'')))[0]||{};
  }
  function recordId(record){return String(record?.id||record?.body?.id||'').trim();}
  function recordClientId(record){return String(record?.clientId||record?.client_id||record?.body?.clientId||record?.body?.client_id||'').trim();}
  async function refreshAndFind(collection,id,clientId,{attempts=3}={}){
    for(let attempt=0;attempt<attempts;attempt++){
      await withTimeout(Promise.resolve(refreshState({reason:`workflow-verify-${collection}`})),15_000,'M26_WORKFLOW_REFRESH_TIMEOUT');
      const found=(store.getState().collections?.[collection]||[]).find((item)=>recordId(item)===String(id)&&(!clientId||recordClientId(item)===String(clientId)));
      if(found)return found;
      if(attempt<attempts-1)await wait(250*(attempt+1));
    }
    return null;
  }
  function invalidNumericFields(form){
    const invalid=[];
    for(const field of form?.querySelectorAll?.('input[type="number"]')||[]){
      if(field.disabled||field.value==='')continue;
      const value=Number(field.value),min=field.min===''?-Infinity:Number(field.min),max=field.max===''?Infinity:Number(field.max);
      if(!Number.isFinite(value)||(Number.isFinite(min)&&value<min)||(Number.isFinite(max)&&value>max))invalid.push(field.name||'valor numérico');
    }
    return invalid;
  }
  function assertIriRawRanges(form){const invalid=invalidNumericFields(form);if(invalid.length){const first=form.elements?.namedItem?.(invalid[0]);first?.focus?.();throw new Error(`M26_IRI_RANGE_INVALID:${invalid.join(',')}`);}}
  function iriRaw(form){
    const raw=values(form);const file=form.querySelector?.('[name="bodyCompositionAttachment"]')?.files?.[0]||null;
    if(file){
      if(file.size>50_000_000)throw new Error('M26_IRI_ATTACHMENT_TOO_LARGE');
      raw.bodyCompositionAttachmentName=String(file.name||'').slice(0,240);
      raw.bodyCompositionAttachmentType=String(file.type||'application/octet-stream').slice(0,120);
      raw.bodyCompositionAttachmentSize=String(file.size||0);
      for(const key of ['Name','Type','Size']){const hidden=form.elements?.namedItem?.(`bodyCompositionAttachment${key}`);if(hidden)hidden.value=raw[`bodyCompositionAttachment${key}`]||'';}
    }
    return raw;
  }
  function iriDraft(form){const {clientId}=context();requireVisibleClient(clientId);return normalizeFirstSessionDraft(iriRaw(form),currentIriRecord(form),clientId);}
  function populateForm(form,data={}){
    for(const [name,value] of Object.entries(data)){
      const field=form.elements?.namedItem?.(name);if(!field||field.type==='file')continue;
      if(field.type==='checkbox')field.checked=Boolean(value);else if(field.value!==undefined)field.value=value??'';
    }
  }
  function computed(form,draft=null){
    if(!form)return;
    syncIriConditionalFields(form);
    const raw=iriRaw(form);const weight=Number(raw.weightKg),height=Number(raw.heightCm);const bmi=Number.isFinite(weight)&&Number.isFinite(height)&&height>0?weight/((height/100)**2):null;
    const bmiField=form.elements?.namedItem?.('bmiPreview');if(bmiField)bmiField.value=bmi?bmi.toFixed(1):'';
    const finalHr=Number(raw.stepFinalHr),oneHr=Number(raw.stepOneMinuteHr);const delta=Number.isFinite(finalHr)&&Number.isFinite(oneHr)?finalHr-oneHr:null;
    const deltaField=form.elements?.namedItem?.('deltaFcPreview');if(deltaField)deltaField.value=delta===null?'':String(delta);
    for(const node of form.querySelectorAll?.('[data-iri-computed="delta"]')||[])node.textContent=delta===null?'—':`${delta} lpm`;
    let normalized=draft;try{normalized=normalized||iriDraft(form);}catch{}
    const completion=normalized?firstSessionCompletion(normalized):{percent:0,steps:[]};
    for(const node of form.querySelectorAll?.('[data-iri-computed="completion"]')||[])node.textContent=`${completion.percent}%`;
    const birthDate=raw.birthDate||normalized?.personProfile?.birthDate;const ageYears=deriveAgeYears(birthDate,raw.assessmentDate||normalized?.assessmentDate||new Date().toISOString().slice(0,10));const normContext={sexForNorms:raw.sexForNorms||normalized?.personProfile?.sexForNorms,ageYears};
    const normSpecs=[['chairStand30s','chair_stand_30s','chair_stand_30s_standard'],['pushUps','push_up_standard','standard_max_valid_reps']];
    for(const [field,testId,protocolId] of normSpecs){const node=form.querySelector?.(`[data-iri-norm="${field}"]`);if(!node)continue;const result=scoreNormedTest({testId,value:raw[field],context:normContext,protocolId});node.textContent=result.scored?`${result.category.label} · referencia ${result.evidence?.sourceId||'validada'}`:raw[field]!==''?'Sin clasificación automática: revisa protocolo, edad y sexo para baremos.':'Introduce un resultado válido para interpretar.';node.dataset.status=result.scored?'success':'neutral';}
    const comparability=form.querySelector?.('[data-iri-comparability]');
    if(comparability&&normalized){const previous=recordBody(currentIriRecord(form))?.protocolRecords||[];const warnings=protocolComparabilityWarnings(previous,normalized.protocolRecords||[]);comparability.textContent=warnings.length?warnings.join(' '):'Protocolos y configuraciones comparables con el registro anterior o sin antecedente disponible.';comparability.dataset.status=warnings.length?'warning':'success';}
    const stepButtons=[...(form.querySelectorAll?.('[data-iri-step-jump]')||[])];
    stepButtons.forEach((button,index)=>button.classList?.toggle?.('is-complete',Boolean(completion.steps?.[index]?.complete)));
  }
  function syncIriConditionalFields(form){
    if(!form)return;
    const bodySkipped=syncIriSkippedGroup(form,{toggleName:'bodyCompositionSkipped',fieldNames:['weightKg','heightCm','bodyFatPercent','leanMassKg','muscleMassKg','bodyWaterPercent','waistCm','visceralFatLevel','bodyCompositionMethod','bodyCompositionDevice','measurementConditions','bodyCompositionAttachment','bodyCompositionNotes','bodyCompositionProtocolConfiguration','bodyCompositionValid','bodyCompositionAdaptationReason','bodyCompositionProtocolStopReason'],reasonName:'bodyCompositionSkipReason'});
    const mobilitySkipped=syncIriSkippedGroup(form,{toggleName:'mobilitySkipped',fieldNames:['ankleLeft1','ankleLeft2','ankleLeft3','ankleRight1','ankleRight2','ankleRight3','posteriorLeft1','posteriorLeft2','posteriorLeft3','posteriorRight1','posteriorRight2','posteriorRight3','anklePain','ankleCompensation','posteriorPain','thomasLeft','thomasRight','thomasPelvicControl','thomasPain','hipRotationResult','hipRotationPain','hipRotationCompensation','squatDepth','squatHeels','squatKnees','squatTrunk','squatShift','squatAssistanceResponse','squatPain','mobilityNotes','ankleProtocolVariant','ankleConfiguration','ankleValid','ankleAdaptationReason','ankleStopReason','posteriorProtocolVariant','posteriorConfiguration','posteriorValid','posteriorAdaptationReason','posteriorStopReason','thomasProtocolVariant','thomasConfiguration','thomasValid','thomasAdaptationReason','thomasStopReason','hipRotationProtocolVariant','hipRotationConfiguration','hipRotationValid','hipRotationAdaptationReason','hipRotationStopReason','squatProtocolVariant','squatConfiguration','squatValid','squatAdaptationReason','squatStopReason'],reasonName:'mobilitySkipReason'});
    const strengthSkipped=syncIriSkippedGroup(form,{toggleName:'strengthSkipped',fieldNames:['chairStand30s','chairHeightCm','chairStandValid','chairStandNotes','pushVariant','pushUps','pushSupportHeightCm','pushValid','pushNotes','trxRowRepetitions','trxHandleHeightCm','trxHeelDistanceCm','trxPosition','trxValid','trxNotes','frontPlankSeconds','sidePlankLeftSeconds','sidePlankRightSeconds','coreQuality','corePain','posteriorChainProtocol','posteriorChainSeconds','posteriorEquipmentCompatible','posteriorNotPerformedReason','posteriorChainPain','strengthNotes','chairStandProtocolVariant','chairStandConfiguration','chairStandAdaptationReason','chairStandStopReason','pushConfiguration','pushAdaptationReason','pushStopReason','trxProtocolVariant','trxConfiguration','trxAdaptationReason','trxStopReason','coreProtocolVariant','coreConfiguration','coreValid','coreAdaptationReason','coreStopReason','posteriorChainConfiguration','posteriorChainValid','posteriorChainAdaptationReason','posteriorChainStopReason'],reasonName:'strengthSkipReason'});
    const cardioSkipped=syncIriSkippedGroup(form,{toggleName:'cardioSkipped',fieldNames:['cardioProtocol','stepHeightCm','cadenceBpm','cardioDurationSeconds','restingHr','stepFinalHr','stepOneMinuteHr','twoMinuteHr','cardioRpe','cardioValid','cardioSymptoms','cardioStopReason','cardioNotes','cardioConfiguration','cardioAdaptationReason'],reasonName:'cardioSkipReason'});
    for(const button of form.querySelectorAll?.('[data-iri-timer-action]')||[]){button.disabled=cardioSkipped;button.setAttribute?.('aria-disabled',cardioSkipped?'true':'false');}
    if(cardioSkipped&&iriTimer?.form===form)stopIriTimer();
    const modality=String(form.elements?.namedItem?.('modality')?.value||'');
    const address=form.elements?.namedItem?.('trainingAddress');
    if(address){const required=['presencial','hibrido'].includes(modality);address.required=required;if(required)address.setAttribute?.('required','');else address.removeAttribute?.('required');}
    const protocol=String(form.elements?.namedItem?.('cardioProtocol')?.value||'');
    const stepHeight=form.elements?.namedItem?.('stepHeightCm');
    if(stepHeight&&(!stepHeight.dataset?.userEdited||stepHeight.dataset?.protocol!==protocol)){
      stepHeight.value=protocol==='iberfit-3min-adapted'?'20':'30.5';
      if(stepHeight.dataset)stepHeight.dataset.protocol=protocol;
    }
  }
  function stopIriTimer(){if(iriTimer?.interval)clearInterval(iriTimer.interval);iriTimer=null;}
  function paintIriTimer(form,remaining){const node=form?.querySelector?.('[data-iri-timer="cardio"] strong');if(!node)return;const safe=Math.max(0,Math.round(Number(remaining)||0));node.textContent=`${String(Math.floor(safe/60)).padStart(2,'0')}:${String(safe%60).padStart(2,'0')}`;}
  function signalIriTimer(frequency=880,durationMs=160){
    try{
      const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AudioContext)return false;
      const audio=new AudioContext();
      const play=()=>{const oscillator=audio.createOscillator();const gain=audio.createGain();oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.14,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+durationMs/1000);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+durationMs/1000);oscillator.addEventListener?.('ended',()=>audio.close?.());};
      if(audio.state==='suspended'&&typeof audio.resume==='function')Promise.resolve(audio.resume()).then(play).catch(()=>audio.close?.());else play();
      return true;
    }catch{return false;}
  }
  function controlIriTimer(form,action){
    if(!form)return;
    if(action==='reset'){stopIriTimer();const duration=Math.min(180,Math.max(30,Number(form.elements?.namedItem?.('cardioDurationSeconds')?.value)||180));paintIriTimer(form,duration);status(root,'iri','Temporizador reiniciado.','info');return;}
    if(action==='pause'){if(iriTimer?.form===form&&iriTimer.interval){clearInterval(iriTimer.interval);iriTimer.interval=null;status(root,'iri','Temporizador en pausa.','pending');}return;}
    if(action!=='start')return;
    if(iriTimer?.form===form&&iriTimer.interval)return;
    const initial=iriTimer?.form===form?iriTimer.remaining:Math.min(180,Math.max(30,Number(form.elements?.namedItem?.('cardioDurationSeconds')?.value)||180));
    stopIriTimer();iriTimer={form,remaining:initial,interval:null};paintIriTimer(form,initial);const audioReady=signalIriTimer(520,140);status(root,'iri',audioReady?'Prueba en curso. Sonido de inicio activado; habrá avisos a 3, 2, 1 y final.':'Prueba en curso. Este navegador no permitió el sonido; mantén visible el temporizador.','pending');
    iriTimer.interval=setInterval(()=>{if(!form.isConnected){stopIriTimer();return;}iriTimer.remaining=Math.max(0,iriTimer.remaining-1);paintIriTimer(form,iriTimer.remaining);if([3,2,1].includes(iriTimer.remaining))signalIriTimer(660,110);if(iriTimer.remaining===0){signalIriTimer(1040,520);stopIriTimer();status(root,'iri','Tres minutos completados. Registra la frecuencia cardiaca final y al minuto.','success');}},1000);
  }

  function setIriStep(form,index,{focus=false}={}){
    const bounded=Math.max(0,Math.min(IRI_FIRST_SESSION_STEPS.length-1,Number(index)||0));form.dataset.iriStepIndex=String(bounded);
    const sections=[...(form.querySelectorAll?.('[data-iri-step]')||[])];sections.forEach((section,itemIndex)=>{const active=itemIndex===bounded;section.hidden=!active;section.classList?.toggle?.('is-active',active);});
    const buttons=[...(form.querySelectorAll?.('[data-iri-step-jump]')||[])];buttons.forEach((button,itemIndex)=>{button.classList?.toggle?.('is-active',itemIndex===bounded);button.setAttribute?.('aria-current',itemIndex===bounded?'step':'false');});
    const progress=form.querySelector?.('[data-iri-progress]');if(progress)progress.style.width=`${Math.round(((bounded+1)/IRI_FIRST_SESSION_STEPS.length)*1000)/10}%`;
    const previous=form.querySelector?.('[data-workflow-action="iri-prev"]');if(previous)previous.disabled=bounded===0;
    const next=form.querySelector?.('[data-workflow-action="iri-next"]');if(next)next.hidden=bounded===IRI_FIRST_SESSION_STEPS.length-1;
    const complete=form.querySelector?.('[data-workflow-action="complete-iri"]');if(complete)complete.hidden=bounded!==IRI_FIRST_SESSION_STEPS.length-1;
    if(focus)sections[bounded]?.querySelector?.('h3')?.focus?.({preventScroll:false});
  }
  function showStepValidation(form,step,errors=[]){
    const node=form.querySelector?.(`[data-iri-step-validation="${step}"]`);if(!node)return;
    node.textContent=errors.length?`Revisa: ${errors.map((item)=>IRI_FIELD_LABELS[item]||item).join(', ')}.`:'Etapa validada.';node.dataset.status=errors.length?'error':'success';
  }
  function focusIriValidationError(form,errors=[]){
    const key=errors[0];const name=IRI_ERROR_FIELD_TARGET[key]||key;const field=form?.elements?.namedItem?.(name)||form?.querySelector?.(`[name="${name}"]`);if(!field)return false;
    field.setAttribute?.('aria-invalid','true');field.scrollIntoView?.({behavior:'smooth',block:'center'});queueMicrotask(()=>field.focus?.({preventScroll:true}));return true;
  }
  async function saveIriDraft({silent=false}={}){
    requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');assertIriRawRanges(form);const draft=iriDraft(form);const {clientId}=context();
    await draftRepository?.save?.(clientId,IRI_DRAFT_SCOPE,draft);computed(form,draft);if(!silent)status(root,'iri','Borrador guardado en este dispositivo.','success');return draft;
  }
  function queueIriSave(){clearTimeout(iriSaveTimer);iriSaveTimer=setTimeout(()=>{void saveIriDraft({silent:true}).catch(()=>{});},650);}
  function onboardingRaw(form){return values(form);}
  async function saveOnboardingDraft(form,{silent=true}={}){
    if(!form)return null;const raw=onboardingRaw(form);await draftRepository?.save?.(CLIENT_ONBOARDING_LOCAL_ID,CLIENT_ONBOARDING_DRAFT_SCOPE,raw);
    if(!silent)status(root,'client-onboarding','Borrador del expediente guardado en este dispositivo.','success');return raw;
  }
  function queueOnboardingSave(form){clearTimeout(onboardingSaveTimer);onboardingSaveTimer=setTimeout(()=>{void saveOnboardingDraft(form).catch(()=>{});},350);}
  function syncOnboardingFormState(form){
    if(!form)return;const modality=form.elements?.namedItem?.('modality');const address=form.elements?.namedItem?.('trainingAddress');if(!address)return;
    const required=['presencial','hibrido'].includes(String(modality?.value||''));address.required=required;if(required)address.setAttribute?.('required','');else address.removeAttribute?.('required');
  }
  async function initializeOnboardingForm(form){
    if(!form||initializedOnboardingForms.has(form))return;initializedOnboardingForms.add(form);
    try{const saved=await draftRepository?.load?.(CLIENT_ONBOARDING_LOCAL_ID,CLIENT_ONBOARDING_DRAFT_SCOPE);if(saved?.value){populateForm(form,saved.value);status(root,'client-onboarding','Borrador del nuevo expediente recuperado desde este dispositivo.','success');}}
    catch{status(root,'client-onboarding','No fue posible recuperar el borrador del expediente.','error');}
    syncOnboardingFormState(form);
  }
  async function initializeIriForm(form){
    if(!form||initializedIriForms.has(form))return;initializedIriForms.add(form);const {clientId}=context();if(!clientId)return;
    try{const saved=await draftRepository?.load?.(clientId,IRI_DRAFT_SCOPE);if(saved?.value?.clientId===clientId){populateForm(form,flattenFirstSessionDraft(saved.value));status(root,'iri','Borrador recuperado desde este dispositivo.','success');}}
    catch{status(root,'iri','No fue posible recuperar el borrador local.','error');}
    computed(form);setIriStep(form,Number(form.dataset.iriStepIndex||0));
  }
  function scanRouteForms(){
    scanQueued=false;
    const onboardingForm=root.querySelector?.('[data-workflow-form="client-onboarding"]');if(onboardingForm)void initializeOnboardingForm(onboardingForm);
    const iriForm=root.querySelector?.('[data-workflow-form="iri"]');if(iriForm)void initializeIriForm(iriForm);
    const appointmentForm=root.querySelector?.('[data-workflow-form="appointment"]');if(appointmentForm&&!initializedAppointmentForms.has(appointmentForm)){initializedAppointmentForms.add(appointmentForm);syncAppointmentFormState(appointmentForm,root);}
    restoreStatuses(root);
  }
  function queueScan(){if(scanQueued)return;scanQueued=true;queueMicrotask(scanRouteForms);}


  async function createClient(){
    requireCoach();if(typeof createClientDraft!=='function')throw new Error('M26_CLIENT_CREATE_UNAVAILABLE');if(!isOnline())throw new Error('M26_OFFLINE_CLIENT_CREATE_NOT_ALLOWED');
    const form=root.querySelector?.('[data-workflow-form="client-onboarding"]');if(!form)throw new Error('M26_CLIENT_FORM_REQUIRED');ensureValidForm(form,{code:'M26_CLIENT_ONBOARDING_INVALID',labels:ONBOARDING_FIELD_LABELS,summary:'Completa los datos obligatorios del expediente'});const raw=values(form);const payload=legacyClientDraftPayload(raw);
    await saveOnboardingDraft(form);status(root,'client-onboarding','Verificando backend y creando expediente protegido…','pending');const outcome=await createClientDraft(payload);const result=outcome?.result||outcome;const state=store.getState();const resultId=clientRecordId(result);const created=outcome?.client||(state.collections.clients||[]).find((item)=>String(item.id)===resultId)||(state.collections.clients||[]).find((item)=>clientEmail(item)===payload.email);
    if(!created?.id)throw new Error('M26_CLIENT_CREATE_NOT_PERSISTED');
    await draftRepository?.remove?.(CLIENT_ONBOARDING_LOCAL_ID,CLIENT_ONBOARDING_DRAFT_SCOPE);store.selectClient?.(created.id);store.navigate?.('iri');onRender();emit(root,'m26:toast',{message:`Expediente de ${clientName(created)} creado. Continúa con la primera sesión.`});
    return result;
  }
  async function completeIri(){
    requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');const current=currentIriRecord(form);const draft=iriDraft(form);const check=validateFirstSessionDraft(draft);
    if(!check.ok){const first=IRI_FIRST_SESSION_STEPS.find((step)=>check.byStep[step]?.length)||'revision';const pending=Object.entries(check.byStep).flatMap(([step,items])=>items.map((item)=>({step,item,label:IRI_FIELD_LABELS[item]||item})));setIriStep(form,IRI_FIRST_SESSION_STEPS.indexOf(first));showStepValidation(form,first,check.byStep[first]);focusIriValidationError(form,check.byStep[first]);const error=new Error(`M26_IRI_FIRST_SESSION_INVALID:${check.errors.join(',')}`);error.userMessage=`No puedes confirmar todavía: faltan ${pending.length} ${pending.length===1?'elemento':'elementos'}. ${pending.map(({label})=>label).join(', ')}.`;throw error;}
    assertIriRawRanges(form);const commandDraft=buildIriCommandDraftFromFirstSession(draft,current);status(root,'iri','Confirmando la evaluación y actualizando el expediente…','pending');
    const result=await withTimeout(commandBus.execute(buildIriCommand(commandDraft,Number(current.revision||0))),20_000,'M26_IRI_CONFIRM_TIMEOUT');
    if(!result.ok){status(root,'iri','La evaluación permanece pendiente de revisión. El borrador local se conserva.','pending');return result;}
    const confirmed=await refreshAndFind('iriAssessments',current.id,draft.clientId);const body=recordBody(confirmed||{});if(!confirmed||!body.firstSessionCompletedAt)throw new Error('M26_IRI_CONFIRM_NOT_PERSISTED');
    await draftRepository?.remove?.(draft.clientId,IRI_DRAFT_SCOPE);status(root,'iri','Primera sesión e IRI confirmados y visibles en el expediente.','success');onRender();return result;
  }
  async function moveIri(direction){
    requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');const index=Number(form.dataset.iriStepIndex||0);
    if(direction>0){assertIriRawRanges(form);const step=IRI_FIRST_SESSION_STEPS[index];const draft=iriDraft(form);const check=validateFirstSessionStep(draft,step);showStepValidation(form,step,check.errors);if(!check.ok){focusIriValidationError(form,check.errors);throw new Error(`M26_IRI_STEP_INVALID:${step}:${check.errors.join(',')}`);}await saveIriDraft({silent:true});}
    setIriStep(form,index+direction,{focus:true});computed(form);
  }
  async function jumpIri(index){
    const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)return;const current=Number(form.dataset.iriStepIndex||0);if(index>current){assertIriRawRanges(form);const step=IRI_FIRST_SESSION_STEPS[current];const check=validateFirstSessionStep(iriDraft(form),step);showStepValidation(form,step,check.errors);if(!check.ok){focusIriValidationError(form,check.errors);status(root,'iri','Completa la etapa actual antes de avanzar.','error');return;}await saveIriDraft({silent:true});}setIriStep(form,index,{focus:true});computed(form);
  }
  function reportContext(draft){const {state,clientId}=context();const client=(state.collections.clients||[]).find((item)=>item.id===clientId);const identity=state.identity||{};let logoUrl='/public/isotipo-iberfit.png';try{logoUrl=new URL('/public/isotipo-iberfit.png',globalThis.location?.origin||'https://m26-canary.iberfit.cl').href;}catch{}
    return {draft,clientId,clientName:clientName(client),coachName:String(identity.name||identity.fullName||identity.email||'Coach IBERFIT'),logoUrl};
  }
  function iriReportStatusScope(){return root.querySelector?.('[data-workflow-form="iri"]')?'iri':'iri-report';}
  async function generateIriReport(variant){
    requireCoach();const confirmedRecord=currentIriRecord();const confirmedBody=recordBody(confirmedRecord);if(!confirmedBody?.firstSessionCompletedAt&&!confirmedBody?.first_session_completed_at)throw new Error('M26_IRI_REPORT_REQUIRES_CONFIRMATION');const {clientId}=context();const draft=confirmedFirstSessionDraft(confirmedRecord,clientId);const check=validateFirstSessionDraft(draft);if(!check.ok){const error=new Error(`M26_IRI_CONFIRMED_REPORT_DATA_INVALID:${check.errors.join(',')}`);error.userMessage=`El IRI confirmado no puede convertirse todavía en informe: ${check.errors.map((item)=>IRI_FIELD_LABELS[item]||item).join(', ')}.`;throw error;}const result=openIriReportPrint({...reportContext(draft),variant});status(root,iriReportStatusScope(),variant==='client'?'Informe Cliente preparado para guardar como PDF.':'Informe Coach / Admin preparado para guardar como PDF.','success');return result;
  }

  async function validatePlan(){requireCoach();const form=root.querySelector?.('[data-workflow-form="planning"]');if(!form)throw new Error('M26_PLAN_FORM_REQUIRED');ensureValidForm(form);const raw=values(form);const {clientId,state}=context();requireVisibleClient(clientId);const draft={id:raw.entityId||createM26Id(),clientId,name:String(raw.name||'').trim(),startDate:raw.startDate,endDate:raw.endDate,goal:String(raw.goal||'').trim(),weeklyFrequency:Number(raw.weeklyFrequency||0)||null,sessionDurationMinutes:Number(raw.sessionDurationMinutes||0)||null,modality:normalizeClientModality(raw.modality)||null};const current=(state.collections.trainingCycles||[]).find((item)=>String(item.id)===String(draft.id)&&(item.clientId||item.client_id)===clientId);await draftRepository?.save?.(clientId,'planning-cycle',draft);status(root,'planning','Validando y guardando el ciclo…','pending');const result=await withTimeout(commandBus.execute(buildCycleCommand(draft,Number(current?.revision||0))),20_000,'M26_PLAN_CONFIRM_TIMEOUT');if(!result.ok){status(root,'planning','El ciclo no quedó confirmado. El borrador local se conserva.','pending');return result;}const confirmed=await refreshAndFind('trainingCycles',draft.id,clientId);if(!confirmed)throw new Error('M26_PLAN_CONFIRM_NOT_PERSISTED');await draftRepository?.remove?.(clientId,'planning-cycle');status(root,'planning','Ciclo validado y visible en Planificación.','success');onRender();return result;}
  async function createAppointment(){requireCoach();const form=root.querySelector?.('[data-workflow-form="appointment"]');if(!form)throw new Error('M26_APPOINTMENT_FORM_REQUIRED');syncAppointmentFormState(form,root);ensureValidForm(form);const raw=values(form);const clientId=requireVisibleClient(String(raw.clientId||''));const start=new Date(raw.startAt),end=new Date(raw.endAt);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))throw new Error('M26_APPOINTMENT_DATE_INVALID');const modality=normalizeAppointmentModality(raw.modality);if(!modality)throw new Error('M26_APPOINTMENT_MODALITY_INVALID');const draft={clientId,startAt:start.toISOString(),endAt:end.toISOString(),modality,location:String(raw.location||'').trim().slice(0,300)};status(root,'appointment','Creando propuesta interna…','pending');const result=await withTimeout(commandBus.execute(buildAppointmentCommand(draft,0)),20_000,'M26_APPOINTMENT_CONFIRM_TIMEOUT');if(!result.ok){status(root,'appointment','La propuesta está pendiente de confirmación.','pending');return result;}await withTimeout(Promise.resolve(refreshState({reason:'appointment-created'})),15_000,'M26_WORKFLOW_REFRESH_TIMEOUT');status(root,'appointment','Propuesta de cita creada. Aún no es visible para el cliente.','success');form.reset();initializedAppointmentForms.delete(form);syncAppointmentFormState(form,root);initializedAppointmentForms.add(form);onRender();return result;}
  async function confirmAppointment(button){requireCoach();if(!isOnline())throw new Error('M26_OFFLINE_APPOINTMENT_CONFIRM_NOT_ALLOWED');const appointmentId=String(button?.dataset?.entityId||'').trim();if(!appointmentId)throw new Error('M26_APPOINTMENT_ID_REQUIRED');const {state}=context();const record=(state.collections.appointments||[]).find((item)=>String(item?.id||item?.body?.id||'')===appointmentId);if(!record)throw new Error('M26_APPOINTMENT_NOT_FOUND');const body=recordBody(record);const clientId=requireVisibleClient(String(record.clientId||record.client_id||body.clientId||body.client_id||''));status(root,'appointment','Confirmando la cita y preparando su visibilidad para el cliente…','pending');const result=await withTimeout(commandBus.execute(buildConfirmAppointmentCommand({clientId,appointmentId},Number(record.revision||body.revision||0))),20_000,'M26_APPOINTMENT_CONFIRM_TIMEOUT');if(!result.ok){status(root,'appointment','La cita sigue como propuesta y requiere revisión.','pending');return result;}const confirmed=await refreshAndFind('appointments',appointmentId,clientId);if(!confirmed||!/confirm/i.test(normalizedStatus(confirmed)))throw new Error('M26_APPOINTMENT_CONFIRM_NOT_PERSISTED');status(root,'appointment','Cita confirmada y visible para el cliente.','success');onRender();return result;}
  function openBuilder(){requireCoach();const {clientId}=context();requireVisibleClient(clientId);emit(root,'m26:open-session-builder',{clientId});status(root,'session','Constructor abierto.','success');}
  function startSession(button){const {clientId,state}=context();requireVisibleClient(clientId);const requestedId=String(button?.dataset?.entityId||'');const candidates=(state.collections.sessions||[]).filter((item)=>(item.clientId||item.client_id)===clientId&&PUBLISHED_SESSION_STATES.has(normalizedStatus(item))).sort((a,b)=>Number(b.revision||b.body?.revision||0)-Number(a.revision||a.body?.revision||0));const session=requestedId?candidates.find((item)=>String(item.id||item.body?.id||'')===requestedId):candidates[0];if(!session)throw new Error('M26_SESSION_PUBLISHED_REQUIRED');emit(root,'m26:start-session',{clientId,session});status(root,'session','Preparando sesión guiada.','success');}
  function generateIntelligence(){
    requireCoach();
    const form=root.querySelector?.('[data-workflow-form="intelligence"]');
    if(!form)throw new Error('M26_INTELLIGENCE_FORM_REQUIRED');
    ensureValidForm(form);
    const raw=values(form);
    const {clientId,state}=context();
    requireVisibleClient(clientId);
    const modality=normalizeClientModality(raw.modality);
    if(!modality)throw new Error('M26_INTELLIGENCE_MODALITY_INVALID');
    const ageValue=String(raw.ageYears??'').trim();
    const ageYears=ageValue===''?null:Number(ageValue);
    const coachQuestion=String(raw.coachQuestion||'').trim().slice(0,1200);
    const input=applyAdaptiveContext({
      clientId,
      goal:raw.goal,
      durationMinutes:Number(raw.durationMinutes),
      experience:raw.experience,
      modality,
      ageYears:Number.isFinite(ageYears)?ageYears:null,
      equipment:String(raw.equipment||'').split(',').map((x)=>x.trim()).filter(Boolean),
      restrictions:[],painAreas:[],contraindications:[],
      coachQuestion,
    },state,clientId);
    const generated=generateSessionProposal(input,catalog);
    const contextWarnings=[];
    if(!Number.isFinite(ageYears))contextWarnings.push('Sin fecha de nacimiento: no se aplicaron criterios dependientes de la edad.');
    const proposal=Object.freeze({...generated,coachQuestion,contextWarnings:Object.freeze(contextWarnings)});
    const preview=root.querySelector?.('[data-intelligence-preview]');
    if(preview)preview.innerHTML=`${coachQuestion?`<section class="m26-intelligence-brief"><p class="m26-eyebrow">Criterio del entrenador</p><p>${escape(coachQuestion)}</p></section>`:''}${contextWarnings.length?`<section class="m26-notice is-warning"><strong>Contexto incompleto</strong><p>${escape(contextWarnings.join(' '))}</p></section>`:''}<section class="m26-notice is-${proposal.requiresManualReview?'warning':'success'}"><strong>${escape(proposal.exercises.length)} ejercicios propuestos</strong><p>${escape(proposal.estimatedMinutes)} min · ${escape(proposal.structure.type)} · revisión del entrenador obligatoria.</p></section><div class="m26-stack">${proposal.exercises.map((item)=>`<article class="m26-list-card"><div><h3>${escape(item.name)}</h3><p>${escape(item.sets)} series · ${escape(item.reps)} · RPE ${escape(item.targetRpe)}</p></div></article>`).join('')}</div>`;
    status(root,'intelligence',proposal.requiresManualReview||contextWarnings.length?'Propuesta conservadora: requiere revisión manual.':'Propuesta lista para revisión.',proposal.requiresManualReview||contextWarnings.length?'pending':'success');
    emit(root,'m26:intelligence-proposal',{proposal});
    return proposal;
  }
  function publicationScope(entity){return entity==='planning'?'planning':entity==='report'?'report':'session';}
  function publicationMessage(action){return ({approve:'Contenido aprobado y pendiente de publicación.',publish:'Contenido publicado para el cliente.',withdraw:'Contenido retirado de la vista del cliente.',archive:'Plan archivado.',reopen:'Plan reabierto como borrador.'})[action]||'Cambio confirmado.';}
  function findPublicationRecord(entity,entityId){const config=publicationConfig(entity);if(!config)throw new Error('M26_PUBLICATION_ENTITY_INVALID');const {state}=context();const record=(state.collections?.[config.collection]||[]).find((item)=>String(item?.id||item?.body?.id||'')===String(entityId||''));if(!record)throw new Error('M26_PUBLICATION_RECORD_NOT_FOUND');const clientId=record.clientId||record.client_id||record.body?.clientId||record.body?.client_id;requireVisibleClient(clientId);return record;}
  async function managePublication(button){requireCoach();if(!isOnline())throw new Error('M26_OFFLINE_PUBLICATION_NOT_ALLOWED');const entity=String(button?.dataset?.publicationEntity||'');const action=String(button?.dataset?.publicationAction||'');const entityId=String(button?.dataset?.entityId||'');const card=button.closest?.('[data-publication-card]');const previewAccepted=Boolean(card?.querySelector?.('[data-publication-preview]')?.checked);const reason=String(card?.querySelector?.('[data-publication-reason]')?.value||'');const {role}=context();const record=findPublicationRecord(entity,entityId);const command=buildPublicationCommand({entity,action,record,role,previewAccepted,reason});const result=await commandBus.execute(command);const scope=publicationScope(entity);status(root,scope,result.ok?publicationMessage(action):'El cambio no está confirmado y requiere revisión.',result.ok?'success':'pending');if(result.ok)onRender();return result;}
  async function approveReport(){requireCoach();if(!isOnline())throw new Error('M26_OFFLINE_PUBLICATION_NOT_ALLOWED');const form=root.querySelector?.('[data-workflow-form="report-approval"]');if(!form)throw new Error('M26_REPORT_FORM_REQUIRED');ensureValidForm(form);const raw=values(form);const {clientId}=context();requireVisibleClient(clientId);const command=buildApproveReportDraftCommand({id:raw.entityId||createM26Id(),clientId,assessmentId:raw.assessmentId,title:raw.title,periodStart:raw.periodStart,periodEnd:raw.periodEnd,summary:raw.summary,conclusions:raw.conclusions,recommendations:raw.recommendations,reviewAccepted:raw.reviewAccepted==='on'},0);const result=await commandBus.execute(command);status(root,'report',result.ok?'Informe aprobado y listo para publicación.':'El informe no está confirmado y requiere revisión.',result.ok?'success':'pending');if(result.ok){form.reset();onRender();}return result;}

  async function executeWorkflowAction(action,button){
    const wasDisabled=Boolean(button?.disabled);if(button){button.disabled=true;button.setAttribute?.('aria-busy','true');}
    try{
      if(action==='create-client-draft')await createClient();else if(action==='complete-iri')await completeIri();else if(action==='save-iri-draft')await saveIriDraft();else if(action==='iri-prev')await moveIri(-1);else if(action==='iri-next')await moveIri(1);else if(action==='generate-client-iri-report')await generateIriReport('client');else if(action==='generate-coach-iri-report')await generateIriReport('coach');else if(action==='validate-plan')await validatePlan();else if(action==='create-appointment')await createAppointment();else if(action==='confirm-appointment')await confirmAppointment(button);else if(action==='open-session-builder')openBuilder();else if(action==='start-published-session')startSession(button);else if(action==='generate-intelligence')generateIntelligence();else if(action==='manage-publication')await managePublication(button);else if(action==='approve-report')await approveReport();else throw new Error('M26_WORKFLOW_ACTION_UNKNOWN');
    }catch(error){const isIriReport=['generate-client-iri-report','generate-coach-iri-report'].includes(action);const scope=isIriReport?iriReportStatusScope():action?.includes('iri')?'iri':action?.includes('client')?'client-onboarding':action?.includes('plan')?'planning':action?.includes('appointment')?'appointment':action?.includes('intelligence')?'intelligence':action?.includes('report')?'report':button?.dataset?.publicationEntity==='report'?'report':button?.dataset?.publicationEntity==='planning'?'planning':'session';status(root,scope,friendlyError(error),'error');emit(root,'m26:workflow-error',{action,code:String(error?.message||error)});}
    finally{if(button){button.disabled=wasDisabled;button.removeAttribute?.('aria-busy');}}
  }
  async function onClick(event){
    const clearClients=event.target.closest?.('[data-client-clear]');if(clearClients){event.preventDefault?.();const search=root.querySelector?.('[data-client-search]');if(search)search.value='';for(const node of root.querySelectorAll?.('[data-client-filter]')||[])node.value='';const sort=root.querySelector?.('[data-client-sort]');if(sort)sort.value='priority';updateClientList();return;}
    const clearLibrary=event.target.closest?.('[data-library-clear]');if(clearLibrary){event.preventDefault?.();const search=root.querySelector?.('[data-library-search]');if(search)search.value='';for(const node of root.querySelectorAll?.('[data-library-filter]')||[])node.value='';updateLibrary();return;}
    const registerProtocol=event.target.closest?.('[data-iri-register-target]');if(registerProtocol){event.preventDefault?.();const form=registerProtocol.closest?.('[data-workflow-form="iri"]');const target=form?.elements?.namedItem?.(registerProtocol.getAttribute?.('data-iri-register-target'));const card=registerProtocol.closest?.('[data-iri-protocol]');if(card)card.open=false;target?.scrollIntoView?.({block:'center',behavior:'smooth'});target?.focus?.();return;}
    const timerButton=event.target.closest?.('[data-iri-timer-action]');if(timerButton){event.preventDefault?.();const form=timerButton.closest?.('[data-workflow-form="iri"]');controlIriTimer(form,timerButton.getAttribute?.('data-iri-timer-action'));return;}
    const jump=event.target.closest?.('[data-iri-step-jump]');if(jump){event.preventDefault?.();await jumpIri(Number(jump.getAttribute?.('data-iri-step-jump')||0));return;}
    const button=event.target.closest?.('[data-workflow-action]');if(!button)return;
    const form=button.closest?.('form');if(form&&button.type==='submit')return;
    event.preventDefault?.();await executeWorkflowAction(button.getAttribute('data-workflow-action'),button);
  }
  async function onSubmit(event){const form=event.target.closest?.('[data-workflow-form]');if(!form)return;event.preventDefault?.();const button=event.submitter?.matches?.('[data-workflow-action]')?event.submitter:form.querySelector?.('[data-workflow-action][type="submit"]');if(!button)return;await executeWorkflowAction(button.getAttribute('data-workflow-action'),button);}
  function onInput(event){
    const iriForm=event.target.closest?.('[data-workflow-form="iri"]');if(iriForm){
      if(event.target?.name==='stepHeightCm'&&event.target.dataset)event.target.dataset.userEdited='true';
      if(event.target?.name==='cardioProtocol'){
        const stepHeight=iriForm.elements?.namedItem?.('stepHeightCm');
        if(stepHeight?.dataset){delete stepHeight.dataset.userEdited;delete stepHeight.dataset.protocol;}
      }
      computed(iriForm);clearStatus(root,'iri');queueIriSave();return;
    }
    const onboardingForm=event.target.closest?.('[data-workflow-form="client-onboarding"]');if(onboardingForm){clearControlValidation(event.target);clearStatus(root,'client-onboarding');queueOnboardingSave(onboardingForm);return;}
    const appointmentForm=event.target.closest?.('[data-workflow-form="appointment"]');if(appointmentForm){clearControlValidation(event.target);clearStatus(root,'appointment');syncAppointmentFormState(appointmentForm,root);return;}
    const clientSearch=event.target.closest?.('[data-client-search]');if(clientSearch){updateClientList(clientSearch.value);return;}
    const search=event.target.closest?.('[data-library-search]');if(search){updateLibrary();return;}
  }
  function onChange(event){const onboardingForm=event.target.closest?.('[data-workflow-form="client-onboarding"]');if(onboardingForm){clearControlValidation(event.target);clearStatus(root,'client-onboarding');syncOnboardingFormState(onboardingForm);queueOnboardingSave(onboardingForm);return;}const clientControl=event.target.closest?.('[data-client-filter],[data-client-sort]');if(clientControl){updateClientList();return;}const filter=event.target.closest?.('[data-library-filter]');if(filter){updateLibrary();return;}const iriForm=event.target.closest?.('[data-workflow-form="iri"]');if(!iriForm)return;computed(iriForm);queueIriSave();}

  function onPageHide(){const form=root.querySelector?.('[data-workflow-form="client-onboarding"]');if(form)void saveOnboardingDraft(form).catch(()=>{});}
  return Object.freeze({
    mount(){if(mounted)return;root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);root.addEventListener('input',onInput);root.addEventListener('change',onChange);globalThis.addEventListener?.('pagehide',onPageHide);if(typeof MutationObserver==='function'){observer=new MutationObserver(()=>queueScan());observer.observe(root,{childList:true,subtree:true});}queueScan();mounted=true;},
    destroy(){if(!mounted)return;clearTimeout(iriSaveTimer);clearTimeout(onboardingSaveTimer);stopIriTimer();observer?.disconnect?.();observer=null;root.removeEventListener('click',onClick);root.removeEventListener('submit',onSubmit);root.removeEventListener('input',onInput);root.removeEventListener('change',onChange);globalThis.removeEventListener?.('pagehide',onPageHide);clearAllStatuses(root);mounted=false;},
  });
}
