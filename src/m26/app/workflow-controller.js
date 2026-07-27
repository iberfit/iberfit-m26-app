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
import {legacyClientDraftPayload} from '../workflows/client-onboarding.js';
import {
  IRI_FIRST_SESSION_STEPS,
  buildIriCommandDraftFromFirstSession,
  firstSessionCompletion,
  flattenFirstSessionDraft,
  normalizeFirstSessionDraft,
  validateFirstSessionDraft,
  validateFirstSessionStep,
} from '../workflows/iri-first-session.js';
import {openIriReportPrint} from '../workflows/iri-report-document.js';

const IRI_DRAFT_SCOPE='iri-first-session';
const PUBLISHED_SESSION_STATES=new Set(['published','publicado','active','activo','enabled','habilitado']);
const IRI_FIELD_LABELS=Object.freeze({
  assessmentDate:'fecha de evaluación',birthDate:'fecha de nacimiento',sexForNorms:'sexo para baremos',email:'correo electrónico',phone:'teléfono',modality:'modalidad',trainingAddress:'dirección de entrenamiento',primaryObjective:'objetivo principal',screeningAccepted:'cribado y seguridad',trainingExperience:'experiencia',availability:'disponibilidad',bodyCompositionSkipReason:'motivo de no realización',bodyCompositionMeasurement:'al menos una medición corporal',mobilitySkipReason:'motivo de no realización',ankleTrials:'mediciones de tobillo',posteriorTrials:'mediciones de cadena posterior',hipRotationResult:'rotación de cadera',squatDepth:'sentadilla asistida',strengthSkipReason:'motivo de no realización',chairStand30s:'silla 30 segundos',pushTest:'prueba de empuje',trxRow:'remo TRX',frontPlank:'plancha frontal',cardioSkipReason:'motivo de no realización',cardioValid:'validez del test',cardioHeartRate:'frecuencia cardiaca final y al minuto',cardioDuration:'duración del test',diagnosisStrengths:'fortalezas',diagnosisPriorities:'prioridades',coachInterpretation:'interpretación del Coach',initialPlan:'plan inicial',reviewAccepted:'revisión profesional',weeklyFrequency:'frecuencia semanal',sessionDurationMinutes:'duración habitual',
});

function values(form){return Object.fromEntries(new FormData(form).entries());}
function ensureValidForm(form){if(typeof form?.checkValidity==='function'&&!form.checkValidity()){form.reportValidity?.();throw new Error('M26_FORM_INVALID');}return form;}
function status(root,scope,message,kind='info'){const node=root.querySelector?.(`[data-workflow-status="${scope}"]`);if(!node)return;node.textContent=message;node.dataset.status=kind;}
function clearStatus(root,scope){const node=root.querySelector?.(`[data-workflow-status="${scope}"]`);if(!node)return;node.textContent='';if(node.dataset)delete node.dataset.status;}
function emit(root,name,detail){root.dispatchEvent(new CustomEvent(name,{bubbles:true,detail}));}
function escape(value){return String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
function normalizedStatus(record){return String(record?.status||record?.estado||record?.body?.status||record?.body?.estado||'').trim().toLowerCase();}
function foldSearch(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
function libraryCards(items,mediaMap,role){return renderExerciseLibraryGroups(items,mediaMap,{role})||'<p class="m26-empty-copy">No hay coincidencias.</p>';}
function recordBody(record={}){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:record;}
function clientRecordId(value){const item=Array.isArray(value)?value[0]:value;return String(item?.clientId||item?.client_id||item?.id||item?.cliente_id||'').trim();}
function clientEmail(record){const body=recordBody(record);return String(record?.email||body?.email||record?.profile?.email||body?.profile?.email||'').trim().toLowerCase();}
function clientName(record){const body=recordBody(record);return String(record?.name||record?.fullName||body?.name||body?.fullName||'Cliente IBERFIT').trim();}
function friendlyError(error){
  const code=String(error?.message||error||'');
  if(/ROLE|FORBIDDEN|CLIENT_CONTEXT|NOT_VISIBLE/.test(code))return 'No tienes permiso o falta seleccionar un cliente válido.';
  if(/CLIENT_CREATE_CANARY_ONLY/.test(code))return 'La creación de clientes está limitada al entorno canary.';
  if(/CLIENT_ONBOARDING_INVALID/.test(code))return 'Revisa los datos esenciales del nuevo expediente.';
  if(/IRI_REMOTE_ENTITY_REQUIRED/.test(code))return 'El expediente todavía no dispone de una entidad IRI remota confirmable.';
  if(/IRI_FIRST_SESSION_INVALID|FORM_INVALID/.test(code))return 'La primera sesión contiene datos pendientes o incoherentes. Revisa la etapa marcada.';
  if(/REPORT_POPUP_BLOCKED/.test(code))return 'El navegador bloqueó la vista del informe. Permite ventanas emergentes para este sitio.';
  if(/DATE|CHRONOLOGY|INVALID|REQUIRED/.test(code))return 'Revisa los campos obligatorios y sus fechas.';
  if(/NETWORK|TIMEOUT|FETCH/.test(code))return 'No fue posible conectar. Tu información local permanece protegida.';
  return 'No fue posible completar la acción. Revisa los datos e inténtalo nuevamente.';
}

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
  clearStatus(root,'appointment');
  return {modality,locationRequired,trainingAddress:trainingAddress||null};
}

export function createWorkflowController({
  root,store,commandBus,catalog,mediaMap,draftRepository=null,createClientDraft=null,
  getRegistry=()=>[],onRender=()=>{},isOnline=()=>globalThis.navigator?.onLine!==false,
}={}){
  if(!root?.addEventListener||!store?.getState||!commandBus?.execute)throw new Error('M26_WORKFLOW_CONTROLLER_REQUIRED');
  let mounted=false,observer=null,iriSaveTimer=null,iriTimer=null;
  const initializedIriForms=new WeakSet();
  const catalogSearch=createExerciseSearchIndex(catalog?.list?.()||[]);

  function context(){const state=store.getState();const role=String(state.identity?.role||'').toLowerCase();const clientId=['client','cliente'].includes(role)?state.identity?.clientId:state.selectedClientId;return {state,role,clientId};}
  function requireCoach(){const {role}=context();if(!['admin','coach'].includes(role))throw new Error('M26_WORKFLOW_ROLE_FORBIDDEN');}
  function requireVisibleClient(clientId){const {state}=context();if(!clientId||(state.collections.clients||[]).every((item)=>item.id!==clientId))throw new Error('M26_CLIENT_NOT_VISIBLE');return clientId;}
  function currentIriRecord(form=null){
    const {clientId,state}=context();const entityId=String(form?.elements?.namedItem?.('entityId')?.value||'');
    const records=(state.collections.iriAssessments||[]).filter((item)=>(item.clientId||item.client_id)===clientId);
    return (entityId?records.find((item)=>String(item.id)===entityId):null)||records.sort((a,b)=>String(b.assessmentDate||b.assessment_date||b.createdAt||'').localeCompare(String(a.assessmentDate||a.assessment_date||a.createdAt||'')))[0]||{};
  }
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
    const stepButtons=[...(form.querySelectorAll?.('[data-iri-step-jump]')||[])];
    stepButtons.forEach((button,index)=>button.classList?.toggle?.('is-complete',Boolean(completion.steps?.[index]?.complete)));
  }
  function syncIriConditionalFields(form){
    if(!form)return;
    const bodySkipped=Boolean(form.elements?.namedItem?.('bodyCompositionSkipped')?.checked);
    const bodyFat=form.elements?.namedItem?.('bodyFatPercent');
    if(bodyFat){bodyFat.required=!bodySkipped;bodyFat.disabled=bodySkipped;if(bodySkipped)bodyFat.removeAttribute?.('required');else bodyFat.setAttribute?.('required','');}
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
  function controlIriTimer(form,action){
    if(!form)return;
    if(action==='reset'){stopIriTimer();const duration=Math.min(180,Math.max(30,Number(form.elements?.namedItem?.('cardioDurationSeconds')?.value)||180));paintIriTimer(form,duration);status(root,'iri','Temporizador reiniciado.','info');return;}
    if(action==='pause'){if(iriTimer?.form===form&&iriTimer.interval){clearInterval(iriTimer.interval);iriTimer.interval=null;status(root,'iri','Temporizador en pausa.','pending');}return;}
    if(action!=='start')return;
    if(iriTimer?.form===form&&iriTimer.interval)return;
    const initial=iriTimer?.form===form?iriTimer.remaining:Math.min(180,Math.max(30,Number(form.elements?.namedItem?.('cardioDurationSeconds')?.value)||180));
    stopIriTimer();iriTimer={form,remaining:initial,interval:null};paintIriTimer(form,initial);status(root,'iri','Prueba cardiorrespiratoria en curso.','pending');
    iriTimer.interval=setInterval(()=>{if(!form.isConnected){stopIriTimer();return;}iriTimer.remaining=Math.max(0,iriTimer.remaining-1);paintIriTimer(form,iriTimer.remaining);if(iriTimer.remaining===0){stopIriTimer();status(root,'iri','Tres minutos completados. Registra la frecuencia cardiaca final y al minuto.','success');}},1000);
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
  async function saveIriDraft({silent=false}={}){
    requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');const draft=iriDraft(form);const {clientId}=context();
    await draftRepository?.save?.(clientId,IRI_DRAFT_SCOPE,draft);computed(form,draft);if(!silent)status(root,'iri','Borrador guardado en este dispositivo.','success');return draft;
  }
  function queueIriSave(){clearTimeout(iriSaveTimer);iriSaveTimer=setTimeout(()=>{void saveIriDraft({silent:true}).catch(()=>{});},650);}
  async function initializeIriForm(form){
    if(!form||initializedIriForms.has(form))return;initializedIriForms.add(form);const {clientId}=context();if(!clientId)return;
    try{const saved=await draftRepository?.load?.(clientId,IRI_DRAFT_SCOPE);if(saved?.value?.clientId===clientId){populateForm(form,flattenFirstSessionDraft(saved.value));status(root,'iri','Borrador recuperado desde este dispositivo.','success');}}
    catch{status(root,'iri','No fue posible recuperar el borrador local.','error');}
    computed(form);setIriStep(form,Number(form.dataset.iriStepIndex||0));
  }
  function scanRouteForms(){const form=root.querySelector?.('[data-workflow-form="iri"]');if(form)void initializeIriForm(form);syncAppointmentFormState(root.querySelector?.('[data-workflow-form="appointment"]'),root);}

  async function createClient(){
    requireCoach();if(typeof createClientDraft!=='function')throw new Error('M26_CLIENT_CREATE_UNAVAILABLE');if(!isOnline())throw new Error('M26_OFFLINE_CLIENT_CREATE_NOT_ALLOWED');
    const form=root.querySelector?.('[data-workflow-form="client-onboarding"]');if(!form)throw new Error('M26_CLIENT_FORM_REQUIRED');ensureValidForm(form);const raw=values(form);const payload=legacyClientDraftPayload(raw);
    status(root,'client-onboarding','Creando expediente protegido…','pending');const result=await createClientDraft(payload);const state=store.getState();const resultId=clientRecordId(result);const created=(state.collections.clients||[]).find((item)=>String(item.id)===resultId)||(state.collections.clients||[]).find((item)=>clientEmail(item)===payload.email);
    if(created?.id){store.selectClient?.(created.id);store.navigate?.('iri');onRender();emit(root,'m26:toast',{message:`Expediente de ${clientName(created)} creado. Continúa con la primera sesión.`});}
    else{form.reset();status(root,'client-onboarding','Expediente creado. Actualiza la cartera para abrirlo.','success');onRender();}
    return result;
  }
  async function completeIri(){
    requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');const current=currentIriRecord(form);const draft=iriDraft(form);const check=validateFirstSessionDraft(draft);
    if(!check.ok){const first=IRI_FIRST_SESSION_STEPS.find((step)=>check.byStep[step]?.length)||'revision';setIriStep(form,IRI_FIRST_SESSION_STEPS.indexOf(first));showStepValidation(form,first,check.byStep[first]);throw new Error(`M26_IRI_FIRST_SESSION_INVALID:${check.errors.join(',')}`);}
    const commandDraft=buildIriCommandDraftFromFirstSession(draft,current);const result=await commandBus.execute(buildIriCommand(commandDraft,Number(current.revision||0)));
    status(root,'iri',result.ok?'Primera sesión e IRI confirmados.':'La evaluación permanece pendiente de revisión.',result.ok?'success':'pending');
    if(result.ok){await draftRepository?.remove?.(draft.clientId,IRI_DRAFT_SCOPE);onRender();}return result;
  }
  async function moveIri(direction){
    requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');const index=Number(form.dataset.iriStepIndex||0);
    if(direction>0){const step=IRI_FIRST_SESSION_STEPS[index];const draft=iriDraft(form);const check=validateFirstSessionStep(draft,step);showStepValidation(form,step,check.errors);if(!check.ok)throw new Error(`M26_IRI_STEP_INVALID:${step}:${check.errors.join(',')}`);await saveIriDraft({silent:true});}
    setIriStep(form,index+direction,{focus:true});computed(form);
  }
  async function jumpIri(index){
    const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)return;const current=Number(form.dataset.iriStepIndex||0);if(index>current){const step=IRI_FIRST_SESSION_STEPS[current];const check=validateFirstSessionStep(iriDraft(form),step);showStepValidation(form,step,check.errors);if(!check.ok){status(root,'iri','Completa la etapa actual antes de avanzar.','error');return;}await saveIriDraft({silent:true});}setIriStep(form,index,{focus:true});computed(form);
  }
  function reportContext(draft){const {state,clientId}=context();const client=(state.collections.clients||[]).find((item)=>item.id===clientId);const identity=state.identity||{};let logoUrl='/public/isotipo-iberfit.png';try{logoUrl=new URL('/public/isotipo-iberfit.png',globalThis.location?.origin||'https://m26-canary.iberfit.cl').href;}catch{}
    return {draft,clientId,clientName:clientName(client),coachName:String(identity.name||identity.fullName||identity.email||'Coach IBERFIT'),logoUrl};
  }
  async function generateIriReport(variant){
    requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');const draft=iriDraft(form);const check=validateFirstSessionDraft(draft);if(!check.ok){const first=IRI_FIRST_SESSION_STEPS.find((step)=>check.byStep[step]?.length)||'revision';setIriStep(form,IRI_FIRST_SESSION_STEPS.indexOf(first));showStepValidation(form,first,check.byStep[first]);throw new Error(`M26_IRI_FIRST_SESSION_INVALID:${check.errors.join(',')}`);}await saveIriDraft({silent:true});const result=openIriReportPrint({...reportContext(draft),variant});status(root,'iri',variant==='client'?'Informe Cliente preparado para guardar como PDF.':'Informe Coach / Admin preparado para guardar como PDF.','success');return result;
  }

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

  async function executeWorkflowAction(action,button){
    const wasDisabled=Boolean(button?.disabled);if(button){button.disabled=true;button.setAttribute?.('aria-busy','true');}
    try{
      if(action==='create-client-draft')await createClient();else if(action==='complete-iri')await completeIri();else if(action==='save-iri-draft')await saveIriDraft();else if(action==='iri-prev')await moveIri(-1);else if(action==='iri-next')await moveIri(1);else if(action==='generate-client-iri-report')await generateIriReport('client');else if(action==='generate-coach-iri-report')await generateIriReport('coach');else if(action==='validate-plan')await validatePlan();else if(action==='create-appointment')await createAppointment();else if(action==='open-session-builder')openBuilder();else if(action==='start-published-session')startSession(button);else if(action==='generate-intelligence')generateIntelligence();else if(action==='manage-publication')await managePublication(button);else if(action==='approve-report')await approveReport();else throw new Error('M26_WORKFLOW_ACTION_UNKNOWN');
    }catch(error){const scope=action?.includes('client')?'client-onboarding':action?.includes('iri')?'iri':action?.includes('plan')?'planning':action?.includes('appointment')?'appointment':action?.includes('intelligence')?'intelligence':action?.includes('report')?'report':button?.dataset?.publicationEntity==='report'?'report':button?.dataset?.publicationEntity==='planning'?'planning':'session';status(root,scope,friendlyError(error),'error');emit(root,'m26:workflow-error',{action,code:String(error?.message||error)});}
    finally{if(button){button.disabled=wasDisabled;button.removeAttribute?.('aria-busy');}}
  }
  async function onClick(event){
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
    const appointmentForm=event.target.closest?.('[data-workflow-form="appointment"]');if(appointmentForm){syncAppointmentFormState(appointmentForm,root);return;}
    const clientSearch=event.target.closest?.('[data-client-search]');if(clientSearch){const query=foldSearch(clientSearch.value);let visible=0;for(const card of root.querySelectorAll?.('[data-client-text]')||[]){const match=!query||String(card.getAttribute?.('data-client-text')||'').includes(query);card.hidden=!match;if(match)visible++;}const statusNode=root.querySelector?.('[data-client-search-status]');if(statusNode)statusNode.textContent=query?`${visible} ${visible===1?'cliente encontrado':'clientes encontrados'}`:`Mostrando ${visible} ${visible===1?'cliente':'clientes'}.`;return;}
    const search=event.target.closest?.('[data-library-search]');if(!search)return;const query=String(search.value||'').trim();const filtered=catalogSearch.search(query,{limit:catalog?.count||367});const grid=root.querySelector?.('[data-library-grid]');if(grid){const {role}=context();grid.innerHTML=libraryCards(filtered,mediaMap,role);}const node=root.querySelector?.('[data-library-status]');if(node)node.textContent=`${filtered.length} ${filtered.length===1?'ejercicio visible':'ejercicios visibles'}`;
  }
  function onChange(event){const iriForm=event.target.closest?.('[data-workflow-form="iri"]');if(!iriForm)return;computed(iriForm);queueIriSave();}

  return Object.freeze({
    mount(){if(mounted)return;root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);root.addEventListener('input',onInput);root.addEventListener('change',onChange);if(typeof MutationObserver==='function'){observer=new MutationObserver(()=>queueMicrotask(scanRouteForms));observer.observe(root,{childList:true,subtree:true});}queueMicrotask(scanRouteForms);mounted=true;},
    destroy(){if(!mounted)return;clearTimeout(iriSaveTimer);stopIriTimer();observer?.disconnect?.();observer=null;root.removeEventListener('click',onClick);root.removeEventListener('submit',onSubmit);root.removeEventListener('input',onInput);root.removeEventListener('change',onChange);mounted=false;},
  });
}
