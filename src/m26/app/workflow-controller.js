import {buildIriCommand} from '../workflows/iri-workflow.js';
import {clientContentView} from '../publication/client-content.js';
import {openEvolutionReportPreview} from '../workflows/evolution-report-document.js';
import {evolutionPdfActionScope} from '../workflows/evolution-pdf-access.js';
import {applyIriSetupPreset} from '../workflows/iri-setup-presets.js';
import {buildCycleCommand} from '../workflows/planning-workflow.js';
import {planningDraftScope,restorePlanningDraft,listPlanningDrafts,planningFormSignature,finalizeConfirmedPlanningDraft} from '../workflows/planning-draft-safety.js';
import {buildAppointmentCommand,buildConfirmAppointmentCommand,resolveCoachAppointmentSessionLink,santiagoAppointmentInstant} from '../workflows/agenda-workflow.js';
import {applyAdaptiveContext} from '../intelligence/adaptive-context.js';
import {generateSessionProposal} from '../intelligence/session-engine.js';
import {createM26Id} from '../platform/id.js';
import {createExerciseSearchIndex} from '../exercises/search.js';
import {exerciseDisplayName} from '../exercises/names.js';
import {normalizeAppointmentModality,normalizeClientModality} from '../domain/modality.js';
import {initialAssessmentPostCreateArea} from '../domain/initial-assessment.js';
import {trainingServiceActive} from '../domain/training-service.js';
import {buildPublicationCommand,publicationConfig} from '../workflows/publication-workflow.js';
import {mutationFeedback,publicationActionKey} from '../workflows/mutation-feedback.js';
import {actorCanExecuteSession,sessionHasExecutableBlocks,sessionReadyToStart} from '../rc39/session-policy.js';
import {buildApproveReportDraftCommand} from '../workflows/report-workflow.js';
import {reportDraftScope,legacyReportDraftScope,restoreReportDraft,reportApprovalDecision} from '../workflows/report-draft-safety.js';
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
import {
  openIriReportPrint,
  prepareIriReportPrintTarget,
} from '../workflows/iri-report-document.js';
import {scoreNormedTest} from '../norms/norms-engine.js';
import {scoreIriPerformance} from '../norms/iri-scoring.js';
import {deriveAgeYears} from '../workflows/iri-profile.js';
import {protocolComparabilityWarnings} from '../workflows/iri-protocol-catalog.js';
import {rankCoachClientDocuments} from '../productivity/coach-productivity.js';
import {classifyCoachListMeasurement,decideCoachVirtualization,markCoachListMeasurement} from '../productivity/large-list-policy.js';
import {guidedRequiredProgress} from '../ui/guided-input.js';

const IRI_DRAFT_SCOPE='iri-first-session';
const IRI_REMOTE_SYNC_DELAY_MS=4_000;
const PUBLISHED_SESSION_STATES=new Set(['published','publicado','publicada','disponible','en_curso','active','activo','enabled','habilitado']);
const IRI_FIELD_LABELS=Object.freeze({
  assessmentDate:'fecha de evaluación',birthDate:'fecha de nacimiento',sexForNorms:'sexo para baremos',email:'correo electrónico',phone:'teléfono',modality:'modalidad',trainingAddress:'dirección de entrenamiento',primaryObjective:'objetivo principal',screeningAccepted:'cribado y seguridad',trainingExperience:'experiencia',availability:'disponibilidad',bodyCompositionSkipReason:'motivo de no realización',bodyCompositionMeasurement:'al menos una medición corporal',mobilitySkipReason:'motivo de no realización',ankleTrials:'mediciones de tobillo',posteriorTrials:'mediciones de cadena posterior',hipRotationResult:'rotación de cadera',squatDepth:'sentadilla asistida',strengthSkipReason:'motivo de no realización',lowerBodyStrength:'una prueba válida de tren inferior (Silla 30 s o Sentadilla 60 s)',chairStand30s:'silla 30 segundos',pushTest:'prueba de empuje',trxRow:'remo TRX',frontPlank:'plancha frontal',cardioSkipReason:'motivo de no realización',cardioProtocol:'protocolo de capacidad',cardioValid:'validez del test',cardioRepetitions:'repeticiones completas del 1MSTS',cardioHeartRate:'frecuencia cardiaca final y al minuto',cardioHeartRatePair:'frecuencia cardiaca final y al minuto deben registrarse juntas',cardioStepHeight:'altura del escalón',cardioCadence:'cadencia del step test',cardioYmcaStandard:'configuración YMCA estándar',cardioTreadmillLoad:'velocidad e inclinación de la cinta',cardioTreadmillContext:'modo, método de FC y recuperación de la cinta',cardioDuration:'duración del test',diagnosisStrengths:'fortalezas',diagnosisPriorities:'prioridades',coachInterpretation:'interpretación del Coach',initialPlan:'plan inicial',reviewAccepted:'revisión profesional',coreDomains:'al menos dos dominios objetivos completos',weeklyFrequency:'frecuencia semanal',sessionDurationMinutes:'duración habitual',
});
const IRI_ERROR_FIELD_TARGET=Object.freeze({
  bodyCompositionMeasurement:'weightKg',ankleTrials:'ankleLeft1',posteriorTrials:'posteriorLeft1',hipRotationResult:'hipRotationResult',squatDepth:'squatDepth',lowerBodyStrength:'squat60Repetitions',chairStand30s:'chairStand30s',pushTest:'pushVariant',trxRow:'trxRowRepetitions',frontPlank:'frontPlankSeconds',cardioProtocol:'cardioProtocol',cardioValid:'cardioValid',cardioRepetitions:'oneMinuteSitToStandRepetitions',cardioHeartRate:'stepFinalHr',cardioHeartRatePair:'stepFinalHr',cardioStepHeight:'stepHeightCm',cardioCadence:'cadenceBpm',cardioYmcaStandard:'cardioProtocol',cardioTreadmillLoad:'treadmillSpeedKmh',cardioTreadmillContext:'cardioRecoveryMode',cardioDuration:'cardioDurationSeconds',diagnosisStrengths:'diagnosisStrengths',diagnosisPriorities:'diagnosisPriorities',coachInterpretation:'coachInterpretation',initialPlan:'initialPlan',reviewAccepted:'reviewAccepted',bodyCompositionSkipReason:'bodyCompositionSkipReason',mobilitySkipReason:'mobilitySkipReason',strengthSkipReason:'strengthSkipReason',cardioSkipReason:'cardioSkipReason',
});
const ONBOARDING_FIELD_LABELS=Object.freeze({
  name:'nombre completo',email:'correo electrónico',phone:'teléfono',birthDate:'fecha de nacimiento',sexForNorms:'sexo para baremos',modality:'modalidad',weeklyFrequency:'frecuencia semanal',sessionDurationMinutes:'duración habitual',primaryObjective:'objetivo principal',
});
const GUIDED_FORM_FIELD_LABELS=Object.freeze({
  name:'nombre del ciclo',startDate:'fecha de inicio',endDate:'fecha de fin',modality:'modalidad',weeklyFrequency:'frecuencia semanal',sessionDurationMinutes:'duración',goal:'objetivo',clientId:'cliente',startAt:'inicio',endAt:'fin',experience:'experiencia',durationMinutes:'duración',
});

function values(form){return Object.fromEntries(new FormData(form).entries());}
// checkValidity() emits `invalid` synchronously. Reading ValidityState is
// side-effect free, including when this runs inside the invalid handler.
function invalidFormControls(form){return [...(form?.elements||[])].filter((control)=>control?.willValidate!==false&&control?.validity?.valid===false);}
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
function guidedFieldLabel(control){
  const name=String(control?.name||'').trim();
  if(GUIDED_FORM_FIELD_LABELS[name])return GUIDED_FORM_FIELD_LABELS[name];
  const label=control?.labels?.[0]||control?.closest?.('label')||null;
  // A nested selector contributes every option to label.textContent.
  // Read label text nodes without including any nested input options.
  const direct=[...(label?.childNodes||[])]
    .filter(node=>node?.nodeType===3)
    .map(node=>String(node.textContent||'').trim())
    .filter(Boolean).join(' ');
  const containsInput=Boolean(label?.querySelector?.('input,select,textarea,button'));
  const plain=containsInput?'':String(label?.textContent||'');
  const accessible=String(control?.getAttribute?.('aria-label')||
    control?.getAttribute?.('data-field-label')||'');
  const text=String(direct||plain||accessible).replace(/\s+/g,' ').trim();
  return text?text.slice(0,100):name||'dato pendiente';
}
export function syncGuidedWorkflowProgress(form){
  if(!form?.matches?.('[data-guided-required-form]'))return null;
  const progress=guidedRequiredProgress(form);
  const node=form.querySelector?.('[data-guided-required-progress]');
  if(node){
    if(progress.total===0){
      if(node.textContent!=='')node.textContent='';
      if(node.hidden!==true)node.hidden=true;
      if(node.dataset?.status!==undefined)delete node.dataset.status;
      return progress;
    }
    const message=progress.complete
      ?'Datos necesarios completos ('+progress.completedCount+'/'+progress.total+'). Revisa y confirma.'
      :progress.completedCount+' de '+progress.total+' datos necesarios completos · siguiente: '+guidedFieldLabel(progress.first)+'.';
    const nextStatus=progress.complete?'success':'pending';
    if(node.hidden===true)node.hidden=false;
    if(node.textContent!==message)node.textContent=message;
    if(node.dataset?.status!==nextStatus)node.dataset.status=nextStatus;
  }
  return progress;
}
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
  if(/M44_PRIVILEGED_ASSURANCE_REQUIRED|M44_PRIVILEGED_ROLE_REQUIRED/.test(code))return 'Para proteger los informes del cliente, necesitas verificar de nuevo tu acceso seguro como Coach o Admin. Conservamos el borrador; completa la verificación y vuelve a intentarlo.';
  if(/M44_PDF_DOWNLOAD_INTEGRITY_INVALID|M44_PDF_STORAGE_CHECKSUM_MISMATCH/.test(code))return 'La comprobación de integridad del documento ha fallado. No se ha abierto el archivo; consulta con el equipo IBERFIT.';
  if(/M44_PDF_ALREADY_ISSUED_OPEN_RETRY/.test(code))return 'El PDF oficial ya quedó emitido y archivado, pero no pudo abrirse. Accede a él desde el historial de versiones; no hace falta emitirlo de nuevo.';
  if(/M44_PDF_ISSUANCE_NOT_AVAILABLE/.test(code))return 'Este informe todavía no tiene un PDF oficial disponible, o su última versión fue retirada. Puedes leer la versión publicada dentro de la aplicación.';
  if(/M44_PDF_WITHDRAWN_REVISION_CANNOT_BE_REISSUED|M44_PDF_ISSUE_REPLAY_COLLISION/.test(code))return 'Esta versión ya fue retirada o modificada. Para emitir una nueva entrega, el Coach debe preparar, aprobar y publicar una nueva revisión.';
  if(/M44_PDF_REQUEST_TIMEOUT|M44_PDF_STORAGE_READBACK_FAILED|M44_PDF_SIGNED_URL_FAILED/.test(code))return 'No se ha podido confirmar la entrega del archivo. Puedes repetir la acción; se conservará el identificador para evitar duplicar una emisión.';
  if(/M44_PDF_PUBLISHED_REPORT_REQUIRED|M44_PDF_SOURCE_AUTHORIZATION_INVALID|M44_PDF_FINALIZE_STALE_SOURCE/.test(code))return 'Este informe no está publicado o sus datos han cambiado. Actualiza los informes y comprueba la versión antes de emitirlo.';
  if(/M44_PDF_EMISSION_NOT_AVAILABLE|M44_REPORT_GOVERNANCE_BACKEND_DISABLED|M44_PDF_BROKER_CONFIG_MISSING|M44_PDF_BRAND_FONT_FETCH_FAILED/.test(code))return 'La emisión PDF oficial no está disponible en este entorno. El borrador y el informe publicado permanecen intactos.';
  if(/M44_PDF_AUTH_REQUIRED/.test(code))return 'Tu sesión debe renovarse antes de acceder al documento privado. Inicia sesión de nuevo si es necesario.';
  if(/M44_PDF_OFFLINE_UNAVAILABLE/.test(code))return 'Necesitas conexión para emitir, retirar o abrir un documento privado. Vuelve a intentarlo al recuperar la red.';
  if(/M44_PDF_POPUP_BLOCKED/.test(code))return 'El navegador ha bloqueado la pestaña del PDF. Permite abrir una pestaña desde IBERFIT y vuelve a pulsar.';
  if(/M44_PDF_WITHDRAW_REASON_REQUIRED/.test(code))return 'Indica un motivo claro de al menos tres caracteres para retirar esta versión.';
  if(/M44_PDF_HISTORY_UNAVAILABLE|M44_PDF_HISTORY_RESPONSE_INVALID/.test(code))return 'No se pudo consultar el historial de versiones. Puedes volver a intentarlo sin modificar ningún informe.';
  if(/M44_PDF_|M44_REPORT_GOVERNANCE_/.test(code))return 'No se ha podido completar la operación con el informe oficial. Ningún documento debe considerarse emitido sin confirmación del servidor.';
  if(/EXERCISE_NAME_DUPLICATE/.test(code))return 'Ya existe un ejercicio activo con ese nombre. Usa el existente o elige un nombre que lo diferencie.';
  if(/EXERCISE_CREATE_NOT_VISIBLE/.test(code))return 'El ejercicio se creó, pero aún no apareció en el catálogo actualizado. No lo crees de nuevo hasta completar la verificación.';
  if(/CUSTOM_EXERCISE_INVALID|CUSTOM_EXERCISE_LIST_INVALID/.test(code))return 'Revisa los datos del ejercicio personalizado antes de guardarlo.';
  if(/M26_PRIVILEGED_ACTION_TIMEOUT|M26_WEBAUTHN_BACKEND_TIMEOUT/.test(code))return 'La confirmación segura tardó demasiado. El expediente no se ha creado; puedes reintentarlo sin perder el formulario.';
  if(/M26_WEBAUTHN_UNSUPPORTED/.test(code))return 'Este dispositivo no permite la confirmación segura necesaria para crear el expediente. Tu formulario permanece guardado.';
  if(/M26_PRIVILEGED_ACTION_(?:IDENTITY_MISMATCH|ASSURANCE_INVALID|FACTOR_INVALID|CHALLENGE_INVALID|CEREMONY_INVALID|NOT_CONFIRMED|AUTH_REQUIRED)/.test(code))return 'No se pudo confirmar de forma segura tu identidad. El expediente no se ha creado y el formulario permanece guardado.';
  if(/M42_WORKSPACE_ENTRY_BUSY/.test(code))return 'Ya se está preparando una sesión. Espera a que termine antes de abrir otra.';
  if(/M42_WORKSPACE_ALREADY_ACTIVE/.test(code))return 'Tienes una sesión o un borrador abierto. Termínalo o sal de él antes de abrir otro.';
  if(/M42_SESSION_(?:NO_LONGER_VISIBLE|NO_LONGER_AVAILABLE)/.test(code))return 'La sesión ya no está disponible. Actualiza tu planificación y selecciona una sesión habilitada.';
  if(/M42_SESSION_UPDATED_REOPEN/.test(code))return 'Tu Coach ha actualizado esta sesión. Abre de nuevo la versión más reciente antes de empezar.';
  if(/M42_SESSION_ENTRY_HANDLER_MISSING/.test(code))return 'El reproductor no está preparado. Actualiza IBERFIT y vuelve a intentarlo; no se ha iniciado ningún entrenamiento.';
  if(/M42_SESSION_WORKSPACE_UNAVAILABLE/.test(code))return 'No se pudo abrir la sesión. Comprueba su disponibilidad y vuelve a intentarlo.';
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
  if(/M26_TRAINING_SERVICE_NOT_ACTIVE/.test(code))return 'El entrenamiento está en pausa o finalizado. Puedes consultar el historial, pero debes reanudar el servicio antes de iniciar una nueva sesión.';
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

export function appointmentEndFromDuration(startAt,durationMinutes){
  const match=String(startAt||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u);
  const duration=Number(durationMinutes);
  if(!match||!Number.isFinite(duration)||duration<1||duration>24*60)return '';
  const [,year,month,day,hour,minute]=match;
  const date=new Date(Date.UTC(Number(year),Number(month)-1,Number(day),Number(hour),Number(minute),0,0));
  if(Number.isNaN(date.getTime()))return '';
  date.setUTCMinutes(date.getUTCMinutes()+duration);
  const pad=(value)=>String(value).padStart(2,'0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function appointmentModalitySuggestion(clientModality){
  const normalized=normalizeClientModality(clientModality);
  return normalized==='presencial'||normalized==='online'?normalized:'';
}

export function syncAppointmentFormState(form,root=form?.ownerDocument||null){
  if(!form)return {modality:null,locationRequired:false,trainingAddress:null,sessionDurationMinutes:null,suggestedEndAt:null};
  clearStatus(root,'appointment');
  const modalityField=form.elements?.namedItem?.('modality')||form.querySelector?.('[name="modality"]');
  const clientField=form.elements?.namedItem?.('clientId')||form.querySelector?.('[name="clientId"]');
  const sessionField=form.elements?.namedItem?.('sessionId')||form.querySelector?.('[name="sessionId"]');
  const startField=form.elements?.namedItem?.('startAt')||form.querySelector?.('[name="startAt"]');
  const endField=form.elements?.namedItem?.('endAt')||form.querySelector?.('[name="endAt"]');
  const locationField=form.elements?.namedItem?.('location')||form.querySelector?.('[name="location"]');
  const help=form.querySelector?.('#m26-location-help');
  const guidance=form.querySelector?.('#m26-appointment-guidance');
  const selectedOption=clientField?.selectedOptions?.[0]||clientField?.options?.[clientField?.selectedIndex]||null;
  const trainingAddress=String(selectedOption?.dataset?.trainingAddress||'').trim();
  const clientModality=String(selectedOption?.dataset?.clientModality||'').trim();
  const chosenClientId=String(clientField?.value||'').trim();
  for(const option of sessionField?.options||[]){
    if(!option.value)continue;
    option.disabled=String(option.dataset?.clientId||'')!==chosenClientId;
  }
  const selectedSessionOption=sessionField?.selectedOptions?.[0]||null;
  if(selectedSessionOption?.value&&selectedSessionOption.disabled)
    sessionField.value='';
  const activeSessionOption=sessionField?.selectedOptions?.[0]||null;
  const sessionModality=normalizeAppointmentModality(activeSessionOption?.dataset?.modality);
  const suggestedModality=sessionModality||appointmentModalitySuggestion(clientModality);
  const fromSession=Boolean(activeSessionOption?.value);
  const sessionDurationMinutes=fromSession
    ?Number(activeSessionOption?.dataset?.sessionDuration)
    :Number(selectedOption?.dataset?.sessionDuration);
  const validDuration=Number.isFinite(sessionDurationMinutes)&&sessionDurationMinutes>=20&&sessionDurationMinutes<=240
    ?sessionDurationMinutes
    :null;

  if(modalityField){
    let previousAutofill=String(modalityField.dataset?.m26AutofilledValue||'');
    const current=String(modalityField.value||'').trim();
    if(previousAutofill&&current&&current!==previousAutofill){
      if(modalityField.dataset)delete modalityField.dataset.m26AutofilledValue;
      previousAutofill='';
    }
    if(suggestedModality&&(!current||(previousAutofill&&current===previousAutofill))){
      modalityField.value=suggestedModality;
      if(modalityField.dataset)modalityField.dataset.m26AutofilledValue=suggestedModality;
    }else if(!suggestedModality&&previousAutofill&&current===previousAutofill){
      modalityField.value='';
      if(modalityField.dataset)delete modalityField.dataset.m26AutofilledValue;
    }
  }

  const suggestedEndAt=appointmentEndFromDuration(startField?.value,validDuration);
  if(endField){
    let previousAutofill=String(endField.dataset?.m26AutofilledValue||'');
    const current=String(endField.value||'').trim();
    if(previousAutofill&&current&&current!==previousAutofill){
      if(endField.dataset)delete endField.dataset.m26AutofilledValue;
      previousAutofill='';
    }
    if(suggestedEndAt&&(!current||(previousAutofill&&current===previousAutofill))){
      endField.value=suggestedEndAt;
      if(endField.dataset)endField.dataset.m26AutofilledValue=suggestedEndAt;
    }else if(!suggestedEndAt&&previousAutofill&&current===previousAutofill){
      endField.value='';
      if(endField.dataset)delete endField.dataset.m26AutofilledValue;
    }
  }

  const modality=normalizeAppointmentModality(modalityField?.value);
  const locationRequired=modality==='presencial';
  if(locationField){
    const previousAutofill=String(locationField.dataset?.m26AutofilledValue||'');
    const current=String(locationField.value||'').trim();
    locationField.required=locationRequired;
    if(locationRequired)locationField.setAttribute?.('required','');else locationField.removeAttribute?.('required');
    if(locationRequired&&trainingAddress&&(!current||current===previousAutofill)){
      locationField.value=trainingAddress;
      if(locationField.dataset)locationField.dataset.m26AutofilledValue=trainingAddress;
    }else if(!locationRequired&&previousAutofill&&current===previousAutofill){
      locationField.value='';
      if(locationField.dataset)delete locationField.dataset.m26AutofilledValue;
    }
  }
  if(guidance){
    const suggestions=[
      suggestedModality?(sessionModality?'modalidad del entrenamiento':'modalidad del expediente'):null,
      validDuration?(fromSession?'duración del entrenamiento':'duración habitual'):null,
    ].filter(Boolean);
    guidance.textContent=suggestions.length
      ?`IBERFIT ha propuesto ${suggestions.join(' y ')}. Revísalas: cualquier cambio manual prevalece.`
      :'No hay modalidad o duración confirmadas para proponer. Selecciónalas para esta cita.';
  }
  if(help){
    help.textContent=locationRequired
      ?trainingAddress?'Se ha propuesto la dirección habitual del expediente. Revísala antes de guardar.':'La ubicación es obligatoria para citas presenciales. Registra también la dirección habitual en el expediente.'
      :modality==='online'?'Añade un enlace o instrucciones únicamente cuando corresponda.':'La sesión guiada se realiza dentro de la aplicación.';
  }
  return {
    modality,
    locationRequired,
    trainingAddress:trainingAddress||null,
    sessionDurationMinutes:validDuration,
    suggestedEndAt:suggestedEndAt||null,
  };
}

export function createWorkflowController({
  root,store,commandBus,catalog,mediaMap,draftRepository=null,createClientDraft=null,createCustomExercise=null,renameExercise=null,updateExerciseMeasurementProfile=null,refreshCatalog=async()=>catalog,
  getRegistry=()=>[],onRender=()=>{},refreshState=async()=>{},getIriExternalReport=async()=>null,getIriPhotogrammetryReport=async()=>null,ensureIriPhysicalConsent=null,
  issueIriReport=null,getIriReportHistory=null,openIriIssuedReport=null,withdrawIriIssuedReport=null,
  issueEvolutionReport=null,getLatestEvolutionPdf=null,getEvolutionPdfHistory=null,openEvolutionPdfById=null,downloadEvolutionPdf=null,withdrawEvolutionPdf=null,
  getRemoteDraft=null,upsertRemoteDraft=null,deleteRemoteDraft=null,createReportDraft=null,isOnline=()=>globalThis.navigator?.onLine!==false,
}={}){
  if(!root?.addEventListener||!store?.getState||!commandBus?.execute)throw new Error('M26_WORKFLOW_CONTROLLER_REQUIRED');
  let mounted=false,observer=null,scanQueued=false,iriSaveTimer=null,iriRemoteSaveTimer=null,onboardingSaveTimer=null,reportSaveTimer=null,planSaveTimer=null,iriTimer=null,clientListRaf=null,pendingClientQuery=null,clientListScheduledGrid=null;
  let iriRemoteSaveChain=Promise.resolve();
  const iriRemoteRevisionByAssessment=new Map();
  const inFlightMutations=new Set();
  const confirmedPublicationReceipts=new Map();
  const reportSubmissionByClient=new Map();
  let reportDraftChain=Promise.resolve();
  let planDraftChain=Promise.resolve();
  const iriRemoteConflictByAssessment=new Map();
  let clientListMeasurementGrid=null;
  const clientListMeasurements=[];
  const initializedClientGrids=new WeakSet();
  const initializedIriForms=new WeakSet();
  const initializedOnboardingForms=new WeakSet();
  const editedOnboardingForms=new WeakSet();
  const initializedReportForms=new WeakSet();
  const editedReportForms=new WeakSet();
  const reportFormClientIds=new WeakMap();
  let planSelectionSequence=0;
  const initializedPlanForms=new WeakSet();
  const editedPlanForms=new WeakSet();
  const planFormClientIds=new WeakMap();
  const initializedAppointmentForms=new WeakSet();
  let catalogSearch=createExerciseSearchIndex(catalog?.list?.()||[]);
  function updateLibrary(){const query=String(root.querySelector?.('[data-library-search]')?.value||'').trim();const {role}=context();const filters=libraryFilterState(root);const searched=catalogSearch.search(query,{limit:catalog?.count||367});const filtered=filterLibraryItems(searched,filters,mediaMap,role);const grid=root.querySelector?.('[data-library-grid]');if(grid)grid.innerHTML=libraryCards(filtered,mediaMap,role);const node=root.querySelector?.('[data-library-status]');if(node)node.textContent=`${filtered.length} ${filtered.length===1?'ejercicio visible':'ejercicios visibles'} con los filtros actuales.`;return filtered;}
  async function createLibraryExercise(form){
    const {role}=context();
    if(!['coach','admin'].includes(role))throw new Error('M26_CUSTOM_EXERCISE_ROLE_REQUIRED');
    if(!isOnline())throw new Error('M26_CUSTOM_EXERCISE_OFFLINE');
    if(typeof createCustomExercise!=='function')throw new Error('M26_CUSTOM_EXERCISE_UNAVAILABLE');

    ensureValidForm(form,{code:'M26_CUSTOM_EXERCISE_FORM_INVALID',summary:'Completa los datos obligatorios del ejercicio'});
    const raw=values(form);
    const clean=(value,max)=>String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);
    const list=(value,maxItems,maxLength)=>{
      const out=[];const seen=new Set();
      for(const item of String(value??'').split(/[\n,;]+/u)){
        const text=clean(item,maxLength);if(!text)continue;
        const key=foldSearch(text);if(seen.has(key))continue;
        seen.add(key);out.push(text);
      }
      return out.slice(0,maxItems);
    };
    const payload={
      nameEs:clean(raw.nameEs,160),
      pattern:clean(raw.pattern,80),
      intent:clean(raw.intent,80),
      equipment:clean(raw.equipment,80),
      difficulty:clean(raw.difficulty,40),
      primaryMuscles:list(raw.primaryMuscles,12,80),
      secondaryMuscles:list(raw.secondaryMuscles,12,80),
      cues:list(raw.cues,12,240),
      instructionsEs:list(raw.instructionsEs,20,240),
      precautions:list(raw.precautions,12,240),
    };
    if([payload.nameEs,payload.pattern,payload.intent,payload.equipment,payload.difficulty].some((value)=>value.length<2))throw new Error('M26_CUSTOM_EXERCISE_INVALID');

    const button=form.querySelector?.('button[type="submit"]');
    const initialStatus=form.querySelector?.('[data-exercise-create-status]');
    const wasDisabled=Boolean(button?.disabled);
    if(button){button.disabled=true;button.setAttribute?.('aria-busy','true');}
    if(initialStatus){initialStatus.textContent='Creando ejercicio y actualizando el catálogo…';initialStatus.dataset.status='pending';}

    try{
      const result=await createCustomExercise(payload);
      const refreshed=await refreshCatalog();
      if(refreshed?.list){catalog=refreshed;catalogSearch=createExerciseSearchIndex(catalog.list());}
      if(!catalog?.has?.(result.exerciseId))throw new Error('M26_EXERCISE_CREATE_NOT_VISIBLE');

      onRender();
      const search=root.querySelector?.('[data-library-search]');
      if(search)search.value=String(result.nameEs||payload.nameEs);
      for(const node of root.querySelectorAll?.('[data-library-filter]')||[])node.value='';
      updateLibrary();
      const successStatus=root.querySelector?.('[data-exercise-create-status]');
      if(successStatus){successStatus.textContent='Ejercicio creado y disponible en el catálogo y en el constructor de sesiones.';successStatus.dataset.status='success';}
      emit(root,'m26:exercise-created',{exerciseId:result.exerciseId,revision:result.revision||1,reviewStatus:'pendiente'});
      return result;
    }catch(error){
      const node=root.querySelector?.('[data-exercise-create-status]')||initialStatus;
      if(node){node.textContent=friendlyError(error);node.dataset.status='error';}
      emit(root,'m26:workflow-error',{action:'create-custom-exercise',code:String(error?.message||error)});
      throw error;
    }finally{
      if(button){button.disabled=wasDisabled;button.removeAttribute?.('aria-busy');}
    }
  }

  async function renameLibraryExercise(form){
    const {role}=context();
    if(role!=='admin')throw new Error('M26_EXERCISE_RENAME_ADMIN_REQUIRED');
    if(!isOnline())throw new Error('M26_EXERCISE_RENAME_OFFLINE');
    if(typeof renameExercise!=='function')throw new Error('M26_EXERCISE_RENAME_UNAVAILABLE');

    const exerciseId=String(form?.dataset?.exerciseId||'').trim();
    const nameEs=String(form?.elements?.namedItem?.('nameEs')?.value||'')
      .replace(/\s+/gu,' ')
      .trim();
    const expectedRevision=Number(form?.dataset?.expectedRevision||0);

    if(!exerciseId||nameEs.length<2||nameEs.length>160){
      throw new Error('M26_EXERCISE_RENAME_INVALID');
    }

    const button=form.querySelector?.('button[type="submit"]');
    const node=form.querySelector?.('[data-exercise-rename-status]');
    const wasDisabled=Boolean(button?.disabled);

    if(button){
      button.disabled=true;
      button.setAttribute?.('aria-busy','true');
    }

    if(node){
      node.textContent='Validando nombre y generando traducciones…';
      node.dataset.status='pending';
    }

    try{
      const result=await renameExercise({
        exerciseId,
        nameEs,
        expectedRevision,
      });

      const refreshed=await refreshCatalog();

      if(refreshed?.list){
        catalog=refreshed;
        catalogSearch=createExerciseSearchIndex(catalog.list());
      }

      updateLibrary();

      if(node){
        node.textContent='Nombre actualizado globalmente. Traducciones automáticas listas.';
        node.dataset.status='success';
      }

      emit(root,'m26:exercise-renamed',{
        exerciseId,
        revision:result?.revision||null,
        translationStatus:'ready',
      });

      onRender();
      return result;
    }catch(error){
      if(node){
        const code=String(error?.message||error||'');
        node.textContent=/REVISION_CONFLICT/.test(code)
          ?'El ejercicio cambió desde que abriste la ficha. Recarga la biblioteca antes de volver a guardar.'
          :friendlyError(error);
        node.dataset.status='error';
      }

      emit(root,'m26:workflow-error',{
        action:'rename-exercise',
        code:String(error?.message||error),
      });

      return null;
    }finally{
      if(button){
        button.disabled=wasDisabled;
        button.removeAttribute?.('aria-busy');
      }
    }
  }
  async function updateLibraryMeasurementProfile(form){
    const {role}=context();
    if(role!=='admin')throw new Error('M26_EXERCISE_PROFILE_ADMIN_REQUIRED');
    if(!isOnline())throw new Error('M26_EXERCISE_PROFILE_OFFLINE');
    if(typeof updateExerciseMeasurementProfile!=='function')throw new Error('M26_EXERCISE_PROFILE_UNAVAILABLE');
    const exerciseId=String(form?.dataset?.exerciseId||'').trim();
    const profile=String(form?.elements?.namedItem?.('measurementProfile')?.value??'').trim();
    const expectedRevision=Number(form?.dataset?.expectedRevision??0);
    if(!exerciseId||!['','strength','isometric','endurance','intervals','carry','mobility','power'].includes(profile)||
       !Number.isSafeInteger(expectedRevision)||expectedRevision<0)
      throw new Error('M26_EXERCISE_PROFILE_INVALID');
    const button=form.querySelector?.('button[type="submit"]');
    const node=form.querySelector?.('[data-exercise-measurement-status]');
    const wasDisabled=Boolean(button?.disabled);
    if(button){button.disabled=true;button.setAttribute?.('aria-busy','true');}
    if(node){node.textContent='Guardando perfil y verificando revisión…';node.dataset.status='pending';}
    try{
      const saved=await updateExerciseMeasurementProfile({exerciseId,profile,expectedRevision});
      try{
        const refreshed=await refreshCatalog();
        if(!refreshed?.list||!refreshed?.has?.(exerciseId))throw new Error('M26_EXERCISE_PROFILE_REFRESH_UNAVAILABLE');
        catalog=refreshed;
        catalogSearch=createExerciseSearchIndex(catalog.list());
        updateLibrary();
        onRender();
      }catch(refreshError){
        if(node){node.textContent='Perfil guardado. No se pudo refrescar la biblioteca; vuelve a abrirla para ver el cambio.';node.dataset.status='warning';}
        emit(root,'m26:workflow-error',{action:'refresh-exercise-profile',code:String(refreshError?.message||refreshError)});
        return saved;
      }
      const live=root.querySelector?.('[data-exercise-measurement-form][data-exercise-id="'+exerciseId+'"] [data-exercise-measurement-status]');
      if(live){live.textContent='Perfil de registro actualizado.';live.dataset.status='success';}
      emit(root,'m26:exercise-measurement-profile-updated',{exerciseId,profile:profile||null,revision:saved.measurementProfileRevision});
      return saved;
    }catch(error){
      if(node){
        node.textContent=/REVISION_CONFLICT/.test(String(error?.message||''))
          ?'Otro cambio se guardó antes. Actualiza la biblioteca y vuelve a revisar el perfil.'
          :friendlyError(error);
        node.dataset.status='error';
      }
      emit(root,'m26:workflow-error',{action:'update-exercise-measurement-profile',code:String(error?.message||error)});
      return null;
    }finally{
      if(button){button.disabled=wasDisabled;button.removeAttribute?.('aria-busy');}
    }
  }
  function markClientListDecision(grid,decision){
    if(!grid||!decision)return false;
    const values={
      'data-list-virtualization-decision':decision.decision,
      'data-list-virtualization-reason':decision.reason,
      'data-list-runtime-samples':decision.runtimeSamples,
      'data-list-automatic-adoption':decision.automaticAdoption?'true':'false',
    };
    for(const [name,value] of Object.entries(values))grid.setAttribute?.(name,String(value));
    return true;
  }
  function reorderClientCards(grid,cards,ranked,visibleIds){
    if(!grid)return false;
    const ordered=[
      ...ranked.map((item)=>cards[Number(item.id)]).filter(Boolean),
      ...cards.filter((_,index)=>!visibleIds.has(String(index))),
    ];
    const current=[...(grid.children||[])];
    const orderChanged=current.length!==ordered.length||ordered.some((card,index)=>current[index]!==card);
    if(!orderChanged)return false;
    const fragment=grid.ownerDocument?.createDocumentFragment?.()||globalThis.document?.createDocumentFragment?.();
    if(fragment){
      for(const card of ordered)fragment.appendChild(card);
      grid.appendChild(fragment);
      return true;
    }
    for(const card of ordered)grid.appendChild(card);
    return true;
  }
  function cancelScheduledClientListUpdate(){
    if(clientListRaf!==null){
      try{globalThis.cancelAnimationFrame?.(clientListRaf);}catch{}
      clientListRaf=null;
    }
    pendingClientQuery=null;
    clientListScheduledGrid=null;
  }
  function scheduleClientListUpdate(queryOverride=null){
    pendingClientQuery=queryOverride;
    clientListScheduledGrid=root.querySelector?.('[data-client-grid]')||null;
    if(clientListRaf!==null)return;
    const raf=globalThis.requestAnimationFrame;
    if(typeof raf!=='function'){
      const query=pendingClientQuery;
      pendingClientQuery=null;
      updateClientList(query);
      return;
    }
    clientListRaf=raf(()=>{
      clientListRaf=null;
      const query=pendingClientQuery;
      const scheduledGrid=clientListScheduledGrid;
      pendingClientQuery=null;
      clientListScheduledGrid=null;
      const currentGrid=root.querySelector?.('[data-client-grid]')||null;
      if(scheduledGrid&&scheduledGrid!==currentGrid)return;
      updateClientList(query);
    });
  }
  function updateClientList(queryOverride=null){
    const clock=()=>globalThis.performance?.now?.()??Date.now();
    const started=clock();
    const query=String(queryOverride===null?(root.querySelector?.('[data-client-search]')?.value||''):queryOverride).trim();
    const filters=clientFilterState(root);
    const sort=String(root.querySelector?.('[data-client-sort]')?.value||'priority');
    const grid=root.querySelector?.('[data-client-grid]');
    const cards=[...(grid?.querySelectorAll?.('[data-client-text]')||root.querySelectorAll?.('[data-client-text]')||[])];
    if(grid!==clientListMeasurementGrid){
      clientListMeasurementGrid=grid;
      clientListMeasurements.length=0;
    }
    const documents=cards.map((card,index)=>({
      id:String(index),
      name:String(card.dataset?.clientName||''),
      text:String(card.getAttribute?.('data-client-text')||''),
      iri:String(card.getAttribute?.('data-client-iri')||''),
      modality:String(card.getAttribute?.('data-client-modality')||''),
      stage:String(card.getAttribute?.('data-client-stage')||''),
      priority:Number(card.dataset?.clientPriority||99),
    }));
    const ranked=rankCoachClientDocuments(documents,{query,filters,sort});
    const visibleIds=new Set(ranked.map((item)=>item.id));
    for(let index=0;index<cards.length;index++){
      const hidden=!visibleIds.has(String(index));
      if(cards[index].hidden!==hidden)cards[index].hidden=hidden;
    }
    reorderClientCards(grid,cards,ranked,visibleIds);
    const visible=ranked.length;
    const measurement=classifyCoachListMeasurement({count:cards.length,visibleCount:visible,elapsedMs:clock()-started});
    clientListMeasurements.push(measurement);
    if(clientListMeasurements.length>3)clientListMeasurements.splice(0,clientListMeasurements.length-3);
    const decision=decideCoachVirtualization(clientListMeasurements);
    markCoachListMeasurement(grid,measurement);
    markClientListDecision(grid,decision);
    const node=root.querySelector?.('[data-client-search-status]');
    if(node){
      const hasFilters=Boolean(filters.iri||filters.modality||filters.stage);
      node.textContent=query&&!hasFilters
        ?`${visible} ${visible===1?'cliente encontrado':'clientes encontrados'} con búsqueda tolerante.`
        :`${visible} ${visible===1?'cliente visible':'clientes visibles'} con los filtros actuales.`;
    }
    return visible;
  }

  function context(){const state=store.getState();const role=String(state.identity?.role||'').toLowerCase();const clientId=['client','cliente'].includes(role)?state.identity?.clientId:state.selectedClientId;return {state,role,clientId};}
  function requireCoach(){const {role}=context();if(!['admin','coach'].includes(role))throw new Error('M26_WORKFLOW_ROLE_FORBIDDEN');}
  function requireVisibleClient(clientId){const {state}=context();if(!clientId||(state.collections.clients||[]).every((item)=>item.id!==clientId))throw new Error('M26_CLIENT_NOT_VISIBLE');return clientId;}
  function requireActiveTrainingService(clientId){
    const {state}=context();
    const client=(state.collections.clients||[]).find((item)=>String(item?.id||'')===String(clientId||''));
    if(!client||!trainingServiceActive(client))throw new Error('M26_TRAINING_SERVICE_NOT_ACTIVE');
    return clientId;
  }
  function currentIriRecord(form=null){
    const {clientId,state}=context();const entityId=String(form?.elements?.namedItem?.('entityId')?.value||state.selectedIriAssessmentId||'');
    const records=(state.collections.iriAssessments||[]).filter((item)=>{
      if((item.clientId||item.client_id)!==clientId)return false;
      const body=recordBody(item);
      const type=String(item.assessmentType||item.assessment_type||body.assessmentType||body.assessment_type||'').trim().toLowerCase();
      return !type||type==='inicial';
    });
    return (entityId?records.find((item)=>String(item.id)===entityId):null)||records.sort((a,b)=>String(b.assessmentDate||b.assessment_date||b.updatedAt||b.updated_at||b.createdAt||b.created_at||'').localeCompare(String(a.assessmentDate||a.assessment_date||a.updatedAt||a.updated_at||a.createdAt||a.created_at||'')))[0]||{};
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
      if(!['application/pdf','image/jpeg','image/png'].includes(String(file.type||'')))throw new Error('M26_IRI_ATTACHMENT_TYPE_INVALID');
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
    const hrValue=(value)=>value===null||value===undefined||String(value).trim()===''?NaN:Number(value);
    const finalHr=hrValue(raw.stepFinalHr),oneHr=hrValue(raw.stepOneMinuteHr),twoHr=hrValue(raw.twoMinuteHr);
    const delta=Number.isFinite(finalHr)&&Number.isFinite(oneHr)?finalHr-oneHr:null;
    const deltaTwo=Number.isFinite(finalHr)&&Number.isFinite(twoHr)?finalHr-twoHr:null;
    const deltaField=form.elements?.namedItem?.('deltaFcPreview');if(deltaField)deltaField.value=delta===null?'':String(delta);
    const deltaTwoField=form.elements?.namedItem?.('deltaFc2Preview');if(deltaTwoField)deltaTwoField.value=deltaTwo===null?'':String(deltaTwo);
    for(const node of form.querySelectorAll?.('[data-iri-computed="delta"]')||[])node.textContent=delta===null?'—':`${delta} lpm`;
    let normalized=draft;try{normalized=normalized||iriDraft(form);}catch{}
    const completion=normalized?firstSessionCompletion(normalized):{percent:0,steps:[]};
    for(const node of form.querySelectorAll?.('[data-iri-computed="completion"]')||[])node.textContent=`${completion.percent}%`;
    const birthDate=raw.birthDate||normalized?.personProfile?.birthDate;
    let ageYears=null;
    try{ageYears=deriveAgeYears(birthDate,raw.assessmentDate||normalized?.assessmentDate||new Date().toISOString().slice(0,10));}catch{}
    const normContext={sexForNorms:raw.sexForNorms||normalized?.personProfile?.sexForNorms,ageYears};
    let scoring=null;
    try{scoring=normalized?scoreIriPerformance({...normalized,ageYears}):null;}catch{}
    if(normalized){
      const derived={
        'ankle-left':normalized.mobility?.ankle?.leftBest,
        'ankle-right':normalized.mobility?.ankle?.rightBest,
        'ankle-diff':normalized.mobility?.ankle?.asymmetryCm,
        'posterior-diff':normalized.mobility?.posteriorChain?.asymmetryCm,
      };
      for(const [key,value] of Object.entries(derived)){
        const node=form.querySelector?.(`[data-iri-computed="${key}"]`);
        if(!node)continue;
        node.textContent=value===null||value===undefined||!Number.isFinite(Number(value))?'—':`${Number(value).toFixed(1)} cm`;
      }
    }
    const mobilityTests=scoring?.domainScores?.mobility?.tests||[];
    const normResults={
      ankleLeft:mobilityTests.find((item)=>item.side==='left'||item.side==='bilateral')||null,
      ankleRight:mobilityTests.find((item)=>item.side==='right')||null,
      chairStand30s:scoring?.domainScores?.strength?.tests?.[0]||null,
      oneMinuteSitToStandRepetitions:scoring?.domainScores?.cardio?.tests?.[0]||null,
      pushUps:normalized?.protocolRecords?.find((record)=>record.testId==='push-test')?.normEligible
        ?scoreNormedTest({testId:'push_up_standard',value:raw.pushUps,context:normContext,protocolId:'standard_max_valid_reps'}):null,
    };
    for(const [field,result] of Object.entries(normResults)){
      const node=form.querySelector?.(`[data-iri-norm="${field}"]`);if(!node)continue;
      const hasValue=field==='ankleLeft'?mobilityTests.some((item)=>item.side==='left'||item.side==='bilateral'):field==='ankleRight'?mobilityTests.some((item)=>item.side==='right'):raw[field]!==''&&raw[field]!==undefined;
      node.textContent=result?.scored?`${result.grade10?.toFixed?.(1)??Number(result.score||0)/10}/10 · ${result.category?.label||'Referencia disponible'}${result.percentileLabel?` · ${result.percentileLabel}`:''}`:hasValue?'Sin nota automática: revisa protocolo, validez, edad y sexo para baremos.':'Introduce un resultado válido para interpretar.';
      node.dataset.status=result?.scored?'success':'neutral';
    }
    const scoreHost=form.querySelector?.('[data-iri-score-summary]');
    if(scoreHost&&scoring){
      const sexLabel=scoring.context?.sexForNorms==='female'?'Mujer':scoring.context?.sexForNorms==='male'?'Hombre':'Pendiente';
      const global=scoring.global||{};const domains=scoring.domainScores||{};
      const domain=(key)=>domains[key]?.score10===null||domains[key]?.score10===undefined?'—':`${Number(domains[key].score10).toFixed(1)}/10`;
      const strengths=(scoring.insights?.strengths||[]).map((item)=>`<li>${escapeHtml(item)}</li>`).join('');
      const priorities=(scoring.insights?.priorities||[]).map((item)=>`<li>${escapeHtml(item)}</li>`).join('');
      const suggestions=(strengths||priorities)?`<div class="m26-content-grid m26-iri-score-insights">${strengths?`<section><h5>Fortalezas sugeridas</h5><ul>${strengths}</ul></section>`:''}${priorities?`<section><h5>Prioridades sugeridas</h5><ul>${priorities}</ul></section>`:''}</div><p class="m26-notice">Sugerencias para revisar: el Coach decide si son relevantes y cómo trasladarlas al plan.</p>`:'';
      scoreHost.innerHTML=`<div class="m26-panel-heading"><div><p class="m26-eyebrow">Puntuación funcional IRI</p><h4>${global.available?`${Number(global.score10).toFixed(1)}/10`:'Pendiente de cobertura'}</h4><p>Baremo: ${sexLabel} · ${Number.isFinite(Number(scoring.context?.ageYears))?Math.round(Number(scoring.context.ageYears))+' años':'edad pendiente'} · motor ${scoring.engineVersion}</p></div><span class="m26-badge ${global.confidence==='high'?'is-success':'is-neutral'}">${global.coverage?.scoredDomains||0}/3 dominios</span></div><div class="m26-review-summary"><div><span>Movilidad</span><strong>${domain('mobility')}</strong></div><div><span>Fuerza funcional</span><strong>${domain('strength')}</strong></div><div><span>Capacidad funcional</span><strong>${domain('cardio')}</strong></div><div><span>Confianza</span><strong>${global.confidence==='high'?'Alta':global.confidence==='moderate'?'Moderada':'Insuficiente'}</strong></div></div>${suggestions}<p class="m26-notice">La nota resume posición funcional frente a referencias compatibles. No es un diagnóstico clínico; la composición corporal y la fotogrametría no alteran esta nota.</p>`;
    }
    const comparability=form.querySelector?.('[data-iri-comparability]');
    if(comparability&&normalized){const previous=recordBody(currentIriRecord(form))?.protocolRecords||[];const warnings=protocolComparabilityWarnings(previous,normalized.protocolRecords||[]);comparability.textContent=warnings.length?warnings.join(' '):'Protocolos y configuraciones comparables con el registro anterior o sin antecedente disponible.';comparability.dataset.status=warnings.length?'warning':'success';}
    const stepButtons=[...(form.querySelectorAll?.('[data-iri-step-jump]')||[])];
    stepButtons.forEach((button,index)=>button.classList?.toggle?.('is-complete',Boolean(completion.steps?.[index]?.complete)));
  }
  function setIriConditionalControl(field,{enabled=true,required=false,readonly=false}={}){
    if(!field)return;
    field.disabled=!enabled;
    field.required=Boolean(enabled&&required);
    field.readOnly=Boolean(enabled&&readonly);
    field.setAttribute?.('aria-disabled',enabled?'false':'true');
    if(field.required)field.setAttribute?.('required','');else field.removeAttribute?.('required');
    if(field.readOnly)field.setAttribute?.('readonly','');else field.removeAttribute?.('readonly');
  }
  function syncIriCardioProtocol(form,{skipped=false}={}){
    const protocolField=form?.elements?.namedItem?.('cardioProtocol');
    const protocol=String(protocolField?.value||'');
    const legacyOption=[...(protocolField?.options||[])].find((option)=>option.value==='iberfit-3min-adapted');
    if(legacyOption&&protocol!=='iberfit-3min-adapted')legacyOption.disabled=true;

    const is1msts=protocol==='1msts-standard';
    const isYmca=protocol==='ymca-3min-standard';
    const isTreadmill=protocol==='treadmill-3min-field';
    const isLegacy=protocol==='iberfit-3min-adapted';
    const hasProtocol=is1msts||isYmca||isTreadmill||isLegacy;

    const previous=String(form.dataset?.iriCardioProtocol||'');
    if(previous&&previous!==protocol&&iriTimer?.form===form)stopIriTimer();
    if(form.dataset)form.dataset.iriCardioProtocol=protocol;

    for(const panel of form.querySelectorAll?.('[data-iri-cardio-panel]')||[]){
      const panelKind=String(panel.getAttribute?.('data-iri-cardio-panel')||'');
      const visible=panelKind==='1msts-standard'?is1msts:panelKind==='step'?isYmca||isLegacy:panelKind===protocol;
      panel.hidden=!visible;
    }

    const chair=form.elements?.namedItem?.('cardioChairHeightCm');
    const repetitions=form.elements?.namedItem?.('oneMinuteSitToStandRepetitions');
    const stepHeight=form.elements?.namedItem?.('stepHeightCm');
    const cadence=form.elements?.namedItem?.('cadenceBpm');
    const duration=form.elements?.namedItem?.('cardioDurationSeconds');
    const finalHr=form.elements?.namedItem?.('stepFinalHr');
    const recoveryHr=form.elements?.namedItem?.('stepOneMinuteHr');
    const treadmillSpeed=form.elements?.namedItem?.('treadmillSpeedKmh');
    const treadmillIncline=form.elements?.namedItem?.('treadmillInclinePercent');
    const treadmillMode=form.elements?.namedItem?.('treadmillLocomotionMode');
    const hrMethod=form.elements?.namedItem?.('cardioHrMethod');
    const recoveryMode=form.elements?.namedItem?.('cardioRecoveryMode');

    setIriConditionalControl(chair,{enabled:!skipped&&is1msts,required:is1msts});
    setIriConditionalControl(repetitions,{enabled:!skipped&&is1msts,required:is1msts});
    setIriConditionalControl(stepHeight,{enabled:!skipped&&(isYmca||isLegacy),required:isYmca||isLegacy,readonly:isYmca});
    setIriConditionalControl(cadence,{enabled:!skipped&&(isYmca||isLegacy),required:isYmca||isLegacy,readonly:isYmca});
    setIriConditionalControl(duration,{enabled:!skipped&&hasProtocol,required:hasProtocol,readonly:true});
    setIriConditionalControl(finalHr,{enabled:!skipped&&hasProtocol,required:isYmca||isLegacy||isTreadmill});
    setIriConditionalControl(recoveryHr,{enabled:!skipped&&hasProtocol,required:isYmca||isLegacy||isTreadmill});
    setIriConditionalControl(treadmillSpeed,{enabled:!skipped&&isTreadmill,required:isTreadmill});
    setIriConditionalControl(treadmillIncline,{enabled:!skipped&&isTreadmill,required:isTreadmill});
    setIriConditionalControl(treadmillMode,{enabled:!skipped&&isTreadmill,required:isTreadmill});
    setIriConditionalControl(hrMethod,{enabled:!skipped&&isTreadmill,required:isTreadmill});
    setIriConditionalControl(recoveryMode,{enabled:!skipped&&isTreadmill,required:isTreadmill});

    if(!skipped&&is1msts&&duration)duration.value='60';
    if(!skipped&&(isYmca||isTreadmill||isLegacy)&&duration)duration.value='180';
    if(!skipped&&isYmca){
      if(stepHeight)stepHeight.value='30.5';
      if(cadence)cadence.value='96';
    }

    const title=form.querySelector?.('[data-iri-cardio-title]');
    const subtitle=form.querySelector?.('[data-iri-cardio-subtitle]');
    const timerCopy=form.querySelector?.('[data-iri-cardio-timer-copy]');
    if(title)title.textContent=is1msts?'1MSTS · 60 segundos':isYmca?'YMCA Step Test · 3 minutos':isTreadmill?'Cinta · 3 minutos':isLegacy?'Step adaptado histórico':'Selecciona una prueba';
    if(subtitle)subtitle.textContent=is1msts?'Capacidad funcional · repeticiones completas':isYmca?'Fitness cardiorrespiratorio · 30,5 cm · 96 bpm':isTreadmill?'Carga submáxima individual · HRR 1 y 2 min · sin baremo externo':isLegacy?'Sólo continuidad histórica; sin baremos YMCA':'IBERFIT mostrará únicamente los campos del protocolo elegido.';
    if(timerCopy)timerCopy.textContent=is1msts?'Cuenta atrás de 60 segundos.':isYmca||isTreadmill||isLegacy?'Cuenta atrás de 180 segundos.':'El temporizador se configura al elegir la prueba.';

    const timerDisabled=skipped||!hasProtocol;
    for(const button of form.querySelectorAll?.('[data-iri-timer-action]')||[]){
      button.disabled=timerDisabled;
      button.setAttribute?.('aria-disabled',timerDisabled?'true':'false');
    }
    if(timerDisabled&&iriTimer?.form===form)stopIriTimer();
    if(!iriTimer||iriTimer.form!==form)paintIriTimer(form,is1msts?60:(isYmca||isTreadmill||isLegacy)?180:0);
    return Object.freeze({protocol,is1msts,isYmca,isLegacy,hasProtocol});
  }
  function syncIriConditionalFields(form){
    if(!form)return;
    const bodySkipped=syncIriSkippedGroup(form,{toggleName:'bodyCompositionSkipped',fieldNames:['weightKg','heightCm','bodyFatPercent','fatMassKg','leanMassKg','muscleMassKg','bodyWaterPercent','waistCm','visceralFatLevel','bodyCompositionMethod','bodyCompositionDevice','measurementConditions','bodyCompositionAttachment','bodyCompositionNotes','bodyCompositionProtocolConfiguration','bodyCompositionValid','bodyCompositionAdaptationReason','bodyCompositionProtocolStopReason'],reasonName:'bodyCompositionSkipReason'});
    const mobilitySkipped=syncIriSkippedGroup(form,{toggleName:'mobilitySkipped',fieldNames:['ankleSkipped','ankleSkipReason','posteriorMobilitySkipped','posteriorMobilitySkipReason','hipRotationSkipped','hipRotationSkipReason','mobilitySquatSkipped','mobilitySquatSkipReason','ankleLeft1','ankleLeft2','ankleLeft3','ankleRight1','ankleRight2','ankleRight3','posteriorLeft1','posteriorLeft2','posteriorLeft3','posteriorRight1','posteriorRight2','posteriorRight3','anklePain','ankleCompensation','posteriorPain','thomasLeft','thomasRight','thomasPelvicControl','thomasPain','hipRotationResult','hipRotationPain','hipRotationCompensation','squatDepth','squatHeels','squatKnees','squatTrunk','squatShift','squatAssistanceResponse','squatPain','mobilityNotes','ankleProtocolVariant','ankleConfiguration','ankleValid','ankleAdaptationReason','ankleStopReason','posteriorProtocolVariant','posteriorConfiguration','posteriorValid','posteriorAdaptationReason','posteriorStopReason','thomasProtocolVariant','thomasConfiguration','thomasValid','thomasAdaptationReason','thomasStopReason','hipRotationProtocolVariant','hipRotationConfiguration','hipRotationValid','hipRotationAdaptationReason','hipRotationStopReason','squatProtocolVariant','squatConfiguration','squatValid','squatAdaptationReason','squatStopReason'],reasonName:'mobilitySkipReason'});
    if(!mobilitySkipped){
      syncIriSkippedGroup(form,{toggleName:'ankleSkipped',fieldNames:['ankleLeft1','ankleLeft2','ankleLeft3','ankleRight1','ankleRight2','ankleRight3','anklePain','ankleCompensation','ankleProtocolVariant','ankleConfiguration','ankleValid','ankleAdaptationReason','ankleStopReason'],reasonName:'ankleSkipReason'});
      syncIriSkippedGroup(form,{toggleName:'posteriorMobilitySkipped',fieldNames:['posteriorLeft1','posteriorLeft2','posteriorLeft3','posteriorRight1','posteriorRight2','posteriorRight3','posteriorPain','posteriorProtocolVariant','posteriorConfiguration','posteriorValid','posteriorAdaptationReason','posteriorStopReason'],reasonName:'posteriorMobilitySkipReason'});
      syncIriSkippedGroup(form,{toggleName:'hipRotationSkipped',fieldNames:['hipRotationResult','hipRotationPain','hipRotationCompensation','hipRotationProtocolVariant','hipRotationConfiguration','hipRotationValid','hipRotationAdaptationReason','hipRotationStopReason'],reasonName:'hipRotationSkipReason'});
      syncIriSkippedGroup(form,{toggleName:'mobilitySquatSkipped',fieldNames:['squatDepth','squatHeels','squatKnees','squatTrunk','squatShift','squatAssistanceResponse','squatPain','squatProtocolVariant','squatConfiguration','squatValid','squatAdaptationReason','squatStopReason'],reasonName:'mobilitySquatSkipReason'});
    }

    const strengthSkipped=syncIriSkippedGroup(form,{toggleName:'strengthSkipped',fieldNames:['lowerBodySkipped','lowerBodySkipReason','pushSkipped','pushSkipReason','trxSkipped','trxSkipReason','coreSkipped','coreSkipReason','chairStand30s','chairHeightCm','chairStandValid','chairStandNotes','squat60Repetitions','squat60DepthCriterion','squat60Stance','squat60Valid','squat60Notes','squat60ProtocolVariant','squat60Configuration','squat60AdaptationReason','squat60StopReason','pushDurationSeconds','pushVariant','pushUps','pushSupportHeightCm','pushValid','pushNotes','trxDurationSeconds','trxRowRepetitions','trxHandleHeightCm','trxHeelDistanceCm','trxBodyAngleDeg','trxPosition','trxValid','trxNotes','frontPlankSeconds','sidePlankLeftSeconds','sidePlankRightSeconds','coreQuality','corePain','posteriorChainProtocol','posteriorChainSeconds','posteriorEquipmentCompatible','posteriorNotPerformedReason','posteriorChainPain','strengthNotes','chairStandProtocolVariant','chairStandConfiguration','chairStandAdaptationReason','chairStandStopReason','pushConfiguration','pushAdaptationReason','pushStopReason','trxProtocolVariant','trxConfiguration','trxAdaptationReason','trxStopReason','coreProtocolVariant','coreConfiguration','coreValid','coreAdaptationReason','coreStopReason','posteriorChainConfiguration','posteriorChainValid','posteriorChainAdaptationReason','posteriorChainStopReason'],reasonName:'strengthSkipReason'});
    if(!strengthSkipped){
      syncIriSkippedGroup(form,{toggleName:'lowerBodySkipped',fieldNames:['chairStand30s','chairHeightCm','chairStandValid','chairStandNotes','squat60Repetitions','squat60DepthCriterion','squat60Stance','squat60Valid','squat60Notes','chairStandProtocolVariant','chairStandConfiguration','chairStandAdaptationReason','chairStandStopReason','squat60ProtocolVariant','squat60Configuration','squat60AdaptationReason','squat60StopReason'],reasonName:'lowerBodySkipReason'});
      syncIriSkippedGroup(form,{toggleName:'pushSkipped',fieldNames:['pushDurationSeconds','pushVariant','pushUps','pushSupportHeightCm','pushValid','pushNotes','pushConfiguration','pushAdaptationReason','pushStopReason'],reasonName:'pushSkipReason'});
      syncIriSkippedGroup(form,{toggleName:'trxSkipped',fieldNames:['trxDurationSeconds','trxRowRepetitions','trxHandleHeightCm','trxHeelDistanceCm','trxBodyAngleDeg','trxPosition','trxValid','trxNotes','trxProtocolVariant','trxConfiguration','trxAdaptationReason','trxStopReason'],reasonName:'trxSkipReason'});
      syncIriSkippedGroup(form,{toggleName:'coreSkipped',fieldNames:['frontPlankSeconds','sidePlankLeftSeconds','sidePlankRightSeconds','coreQuality','corePain','coreProtocolVariant','coreConfiguration','coreValid','coreAdaptationReason','coreStopReason'],reasonName:'coreSkipReason'});
    }

    const cardioSkipped=syncIriSkippedGroup(form,{toggleName:'cardioSkipped',fieldNames:['cardioProtocol','cardioChairHeightCm','oneMinuteSitToStandRepetitions','stepHeightCm','cadenceBpm','treadmillSpeedKmh','treadmillInclinePercent','treadmillLocomotionMode','cardioHrMethod','cardioRecoveryMode','cardioDurationSeconds','restingHr','stepFinalHr','stepOneMinuteHr','twoMinuteHr','cardioRpe','cardioValid','cardioSymptoms','cardioStopReason','cardioNotes','cardioConfiguration','cardioAdaptationReason'],reasonName:'cardioSkipReason'});
    syncIriCardioProtocol(form,{skipped:cardioSkipped});
    const modality=String(form.elements?.namedItem?.('modality')?.value||'');
    const address=form.elements?.namedItem?.('trainingAddress');
    if(address){const required=['presencial','hibrido'].includes(modality);address.required=required;if(required)address.setAttribute?.('required','');else address.removeAttribute?.('required');}
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
    if(action==='reset'){stopIriTimer();const protocol=String(form.elements?.namedItem?.('cardioProtocol')?.value||'');const duration=protocol==='1msts-standard'?60:['ymca-3min-standard','treadmill-3min-field','iberfit-3min-adapted'].includes(protocol)?180:0;paintIriTimer(form,duration);status(root,'iri','Temporizador reiniciado.','info');return;}
    if(action==='pause'){if(iriTimer?.form===form&&iriTimer.interval){clearInterval(iriTimer.interval);iriTimer.interval=null;status(root,'iri','Temporizador en pausa.','pending');}return;}
    if(action!=='start')return;
    if(iriTimer?.form===form&&iriTimer.interval)return;
    const protocol=String(form.elements?.namedItem?.('cardioProtocol')?.value||'');const expectedDuration=protocol==='1msts-standard'?60:['ymca-3min-standard','treadmill-3min-field','iberfit-3min-adapted'].includes(protocol)?180:0;if(!expectedDuration){status(root,'iri','Selecciona primero un protocolo de capacidad.','error');return;}const initial=iriTimer?.form===form?iriTimer.remaining:expectedDuration;
    stopIriTimer();iriTimer={form,remaining:initial,interval:null,protocol};paintIriTimer(form,initial);const audioReady=signalIriTimer(520,140);status(root,'iri',audioReady?'Prueba en curso. Sonido de inicio activado; habrá avisos a 3, 2, 1 y final.':'Prueba en curso. Este navegador no permitió el sonido; mantén visible el temporizador.','pending');
    iriTimer.interval=setInterval(()=>{if(!form.isConnected){stopIriTimer();return;}iriTimer.remaining=Math.max(0,iriTimer.remaining-1);paintIriTimer(form,iriTimer.remaining);if([3,2,1].includes(iriTimer.remaining))signalIriTimer(660,110);if(iriTimer.remaining===0){const completedProtocol=iriTimer.protocol;signalIriTimer(1040,520);stopIriTimer();status(root,'iri',completedProtocol==='1msts-standard'?'60 segundos completados. Registra las repeticiones completas, RPE y síntomas; la FC es opcional.':'180 segundos completados. Registra FC final, recuperación, RPE y síntomas.','success');}},1000);
  }

  function setIriStep(form,index,{focus=false}={}){
    const bounded=Math.max(0,Math.min(IRI_FIRST_SESSION_STEPS.length-1,Number(index)||0));form.dataset.iriStepIndex=String(bounded);
    const sections=[...(form.querySelectorAll?.('[data-iri-step]')||[])];sections.forEach((section,itemIndex)=>{const active=itemIndex===bounded;section.hidden=!active;section.classList?.toggle?.('is-active',active);});
    const buttons=[...(form.querySelectorAll?.('[data-iri-step-jump]')||[])];buttons.forEach((button,itemIndex)=>{button.classList?.toggle?.('is-active',itemIndex===bounded);button.setAttribute?.('aria-current',itemIndex===bounded?'step':'false');});
    const progress=form.querySelector?.('[data-iri-progress]');if(progress)progress.setAttribute?.('data-progress-step',String(bounded+1));
    const previous=form.querySelector?.('[data-workflow-action="iri-prev"]');if(previous){const disabled=bounded===0;previous.disabled=disabled;previous.setAttribute?.('aria-disabled',disabled?'true':'false');}
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
  function assertNormContextAccepted(form){
    const control=form?.elements?.namedItem?.('normContextAccepted');
    if(control?.checked)return true;
    const error=new Error('M26_IRI_NORM_CONTEXT_CONFIRMATION_REQUIRED');
    error.userMessage='Antes de confirmar, verifica la fecha de nacimiento y el sexo utilizado para los baremos.';
    try{control?.focus?.();}catch{}
    throw error;
  }
  function assertNoUnpersistedIriAttachment(form){
    const file=form?.querySelector?.('[name="bodyCompositionAttachment"]')?.files?.[0]||null;
    if(!file)return true;
    const error=new Error('M26_IRI_EXTERNAL_REPORT_NOT_PERSISTED');
    error.userMessage='El informe de bioimpedancia está seleccionado, pero todavía no está guardado. Pulsa «Subir y guardar informe» o elimina la selección antes de confirmar.';
    try{form?.querySelector?.('[data-iri-external-report-action="upload"]')?.focus?.();}catch{}
    throw error;
  }
  function assertPhysicalAssessmentConsent(form){
    const control=form?.elements?.namedItem?.('physicalAssessmentConsent');
    if(control?.checked)return true;
    const error=new Error('M26_IRI_PHYSICAL_CONSENT_REQUIRED');
    error.userMessage='Antes de continuar, registra que la persona ha aceptado realizar la evaluación física IRI.';
    try{control?.focus?.();}catch{}
    throw error;
  }
  function iriDraftStorageScope(draft=null,form=null){
    const assessmentId=String(draft?.assessmentId||recordId(currentIriRecord(form))||'').trim();
    return assessmentId?`${IRI_DRAFT_SCOPE}:${assessmentId}`:IRI_DRAFT_SCOPE;
  }
  function iriDraftMatchesCurrent(value,clientId,form=null){
    if(!value||String(value.clientId||'')!==String(clientId||''))return false;
    const currentAssessmentId=String(recordId(currentIriRecord(form))||'').trim();
    const savedAssessmentId=String(value.assessmentId||'').trim();
    return !currentAssessmentId||!savedAssessmentId||savedAssessmentId===currentAssessmentId;
  }
  function iriRemoteDraftKey(clientId,assessmentId){return `${String(clientId||'').trim()}:${String(assessmentId||'').trim()}`;}
  function iriCanonicalJson(value){
    const normalize=(item)=>{
      if(Array.isArray(item))return item.map(normalize);
      if(item&&typeof item==='object'){
        const out={};
        for(const key of Object.keys(item).sort())out[key]=normalize(item[key]);
        return out;
      }
      return item;
    };
    try{return JSON.stringify(normalize(value));}catch{return '';}
  }
  function iriDraftsEquivalent(a,b){return Boolean(a&&b)&&iriCanonicalJson(a)===iriCanonicalJson(b);}
  function paintIriRemoteConflict(form,conflict=null){
    const panel=form?.querySelector?.('[data-iri-remote-conflict]');
    if(!panel)return;
    panel.hidden=!conflict;
    if(!conflict)return;
    const copy=panel.querySelector?.('[data-iri-remote-conflict-copy]');
    if(copy)copy.textContent=conflict.missing
      ?'El respaldo remoto cambió mientras editabas y ahora ya no existe. Tu borrador local se conserva; puedes volver a publicarlo desde este dispositivo.'
      :'Existe otro borrador remoto más reciente o diferente. IBERFIT conserva ambos y no sobrescribirá ninguno hasta que elijas cuál continuar.';
    const remoteButton=panel.querySelector?.('[data-iri-remote-conflict-action="use-remote"]');
    if(remoteButton){remoteButton.disabled=conflict.missing===true||!conflict.draft;remoteButton.setAttribute?.('aria-disabled',remoteButton.disabled?'true':'false');}
  }
  function setIriRemoteConflict(clientId,assessmentId,conflict,form=null){
    const key=iriRemoteDraftKey(clientId,assessmentId);
    if(conflict)iriRemoteConflictByAssessment.set(key,Object.freeze({...conflict}));
    else iriRemoteConflictByAssessment.delete(key);
    paintIriRemoteConflict(form,conflict||null);
  }
  async function persistIriRemoteDraft(clientId,draft,form=null){
    if(typeof upsertRemoteDraft!=='function'||!isOnline())return false;
    const assessmentId=String(draft?.assessmentId||recordId(currentIriRecord(form))||'').trim();
    if(!assessmentId)return false;
    const key=iriRemoteDraftKey(clientId,assessmentId);
    if(iriRemoteConflictByAssessment.has(key))return false;
    const snapshot=structuredClone(draft);
    const payload={
      clientId,
      assessmentId,
      revision:Number(currentIriRecord(form)?.revision||0),
      remoteRevision:Math.max(0,Number(iriRemoteRevisionByAssessment.get(key))||0),
      draft:snapshot,
    };
    const queued=iriRemoteSaveChain.catch(()=>{}).then(()=>Promise.resolve(upsertRemoteDraft(payload)));
    iriRemoteSaveChain=queued.then(()=>undefined,()=>undefined);
    try{
      const result=await queued;
      if(result?.conflict===true){
        const conflict=Object.freeze({
          revision:Math.max(0,Number(result.revision)||0),
          clientRevision:Math.max(0,Number(result.clientRevision)||0),
          updatedAt:result.updatedAt||null,
          draft:result.draft&&typeof result.draft==='object'?structuredClone(result.draft):null,
          missing:result.missing===true,
        });
        setIriRemoteConflict(clientId,assessmentId,conflict,form);
        emit(root,'m26:workflow-error',{action:'save-iri-draft-remote-conflict',code:'M26_IRI_REMOTE_DRAFT_CONFLICT'});
        status(root,'iri','Hay cambios distintos en otro dispositivo. Tus cambios siguen guardados aquí; elige qué borrador continuar antes de sincronizar.','error');
        return false;
      }
      if(result?.saved===true){
        iriRemoteRevisionByAssessment.set(key,Math.max(1,Number(result.revision)||1));
        setIriRemoteConflict(clientId,assessmentId,null,form);
        return true;
      }
      return false;
    }
    catch(error){
      emit(root,'m26:workflow-error',{action:'save-iri-draft-remote',code:String(error?.message||error||'M26_IRI_REMOTE_DRAFT_SAVE_FAILED')});
      return false;
    }
  }
  async function persistIriDraftBackup(clientId,draft,form=null,{syncRemote=true}={}){
    let local=false,remote=false;
    if(draftRepository?.save){
      try{await draftRepository.save(clientId,iriDraftStorageScope(draft,form),draft);local=true;}
      catch(error){emit(root,'m26:workflow-error',{action:'save-iri-draft-local',code:String(error?.message||error||'M26_IRI_LOCAL_DRAFT_SAVE_FAILED')});}
    }
    if(syncRemote)remote=await persistIriRemoteDraft(clientId,draft,form);
    return Object.freeze({local,remote});
  }
  async function clearIriDraftBackups(clientId,draft,form=null){
    clearTimeout(iriSaveTimer);
    clearTimeout(iriRemoteSaveTimer);
    await iriRemoteSaveChain.catch(()=>{});
    for(const scope of new Set([iriDraftStorageScope(draft,form),IRI_DRAFT_SCOPE])){
      try{await draftRepository?.remove?.(clientId,scope);}
      catch(error){emit(root,'m26:workflow-error',{action:'delete-iri-draft-local',code:String(error?.message||error||'M26_IRI_LOCAL_DRAFT_DELETE_FAILED')});}
    }
    const assessmentId=String(draft?.assessmentId||recordId(currentIriRecord(form))||'').trim();
    if(assessmentId){
      const key=iriRemoteDraftKey(clientId,assessmentId);
      iriRemoteRevisionByAssessment.delete(key);
      iriRemoteConflictByAssessment.delete(key);
    }
    if(assessmentId&&typeof deleteRemoteDraft==='function'&&isOnline()){
      try{await Promise.resolve(deleteRemoteDraft(clientId,assessmentId));}
      catch(error){emit(root,'m26:workflow-error',{action:'delete-iri-draft-remote',code:String(error?.message||error||'M26_IRI_REMOTE_DRAFT_DELETE_FAILED')});}
    }
  }
  async function saveIriDraft({silent=false,syncRemote=true}={}){
    requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');assertIriRawRanges(form);const draft=iriDraft(form);const {clientId}=context();
    const saved=await persistIriDraftBackup(clientId,draft,form,{syncRemote});
    try{computed(form,draft);}catch{}
    if(!silent){
      const message=saved.remote?'Borrador guardado y sincronizado de forma segura.':saved.local?'Borrador guardado en este dispositivo. La sincronización remota queda pendiente.':'La etapa sigue abierta, pero no fue posible actualizar el respaldo del borrador.';
      status(root,'iri',message,saved.remote?'success':saved.local?'pending':'error');
    }
    return draft;
  }
  function queueIriSave(){
    clearTimeout(iriSaveTimer);
    iriSaveTimer=setTimeout(()=>{void saveIriDraft({silent:true,syncRemote:false}).catch(()=>{});},650);
    clearTimeout(iriRemoteSaveTimer);
    iriRemoteSaveTimer=setTimeout(()=>{void saveIriDraft({silent:true,syncRemote:true}).catch(()=>{});},IRI_REMOTE_SYNC_DELAY_MS);
  }
  function assertNoIriRemoteConflict(clientId,assessmentId,form=null){
    const key=iriRemoteDraftKey(clientId,assessmentId);
    if(!iriRemoteConflictByAssessment.has(key))return true;
    paintIriRemoteConflict(form,iriRemoteConflictByAssessment.get(key));
    const error=new Error('M26_IRI_REMOTE_DRAFT_CONFLICT');
    error.userMessage='Hay dos borradores distintos del IRI. Elige cuál continuar antes de confirmar la evaluación.';
    throw error;
  }
  async function resolveIriRemoteConflict(form,action){
    requireCoach();
    const {clientId}=context();
    const assessmentId=String(recordId(currentIriRecord(form))||'').trim();
    const key=iriRemoteDraftKey(clientId,assessmentId);
    const conflict=iriRemoteConflictByAssessment.get(key);
    if(!assessmentId||!conflict)return false;
    if(action==='use-remote'){
      if(!conflict.draft||conflict.missing===true){
        status(root,'iri','Ese respaldo remoto ya no está disponible. El borrador de este dispositivo permanece intacto.','error');
        return false;
      }
      populateForm(form,flattenFirstSessionDraft(conflict.draft));
      try{await draftRepository?.save?.(clientId,iriDraftStorageScope(conflict.draft,form),conflict.draft);}catch(error){emit(root,'m26:workflow-error',{action:'resolve-iri-draft-conflict-local',code:String(error?.message||error||'M26_IRI_LOCAL_DRAFT_SAVE_FAILED')});}
      iriRemoteRevisionByAssessment.set(key,Math.max(0,Number(conflict.revision)||0));
      setIriRemoteConflict(clientId,assessmentId,null,form);
      try{computed(form,conflict.draft);}catch{}
      status(root,'iri','Respaldo remoto recuperado. Este dispositivo continúa desde esa versión.','success');
      return true;
    }
    if(action==='keep-local'){
      iriRemoteRevisionByAssessment.set(key,Math.max(0,Number(conflict.revision)||0));
      setIriRemoteConflict(clientId,assessmentId,null,form);
      const draft=iriDraft(form);
      const synced=await persistIriRemoteDraft(clientId,draft,form);
      if(synced){
        status(root,'iri','Se ha conservado este dispositivo y el respaldo remoto quedó actualizado explícitamente.','success');
        return true;
      }
      if(!iriRemoteConflictByAssessment.has(key))status(root,'iri','El borrador local sigue protegido, pero la sincronización remota queda pendiente.','pending');
      return false;
    }
    return false;
  }
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
    try{const saved=await draftRepository?.load?.(CLIENT_ONBOARDING_LOCAL_ID,CLIENT_ONBOARDING_DRAFT_SCOPE);if(saved?.value&&!editedOnboardingForms.has(form)){populateForm(form,saved.value);status(root,'client-onboarding','Borrador del nuevo expediente recuperado desde este dispositivo.','success');}}
    catch{status(root,'client-onboarding','No fue posible recuperar el borrador del expediente.','error');}
    syncOnboardingFormState(form);
  }
  async function initializeIriForm(form){
    if(!form||initializedIriForms.has(form))return;initializedIriForms.add(form);const {clientId}=context();if(!clientId)return;
    const scope=iriDraftStorageScope(null,form);
    const currentAssessmentId=String(recordId(currentIriRecord(form))||'').trim();
    const remoteKey=iriRemoteDraftKey(clientId,currentAssessmentId);
    let localRecord=null,remoteRecord=null,localLoadFailed=false,remoteLoadFailed=false;
    try{
      try{
        localRecord=await draftRepository?.load?.(clientId,scope);
        if(!localRecord?.value&&scope!==IRI_DRAFT_SCOPE){
          const legacy=await draftRepository?.load?.(clientId,IRI_DRAFT_SCOPE);
          const legacyAssessmentId=String(legacy?.value?.assessmentId||'').trim();
          if(legacy?.value?.clientId===clientId&&(!legacyAssessmentId||legacyAssessmentId===currentAssessmentId)){
            localRecord=legacy;
            try{await draftRepository?.save?.(clientId,scope,legacy.value);}
            catch(error){emit(root,'m26:workflow-error',{action:'cache-iri-draft-local-migration',code:String(error?.message||error||'M26_IRI_LOCAL_DRAFT_CACHE_FAILED')});}
          }
        }
        if(localRecord?.value&&!iriDraftMatchesCurrent(localRecord.value,clientId,form))localRecord=null;
      }catch(error){
        localLoadFailed=true;
        localRecord=null;
        emit(root,'m26:workflow-error',{action:'load-iri-draft-local',code:String(error?.message||error||'M26_IRI_LOCAL_DRAFT_LOAD_FAILED')});
      }

      if(currentAssessmentId&&typeof getRemoteDraft==='function'&&isOnline()){
        try{
          const result=await Promise.resolve(getRemoteDraft(clientId,currentAssessmentId));
          iriRemoteRevisionByAssessment.set(remoteKey,result?.found===true?Math.max(1,Number(result.revision)||1):0);
          if(result?.found===true&&String(result.assessmentId||'')===currentAssessmentId&&iriDraftMatchesCurrent(result.draft,clientId,form)){
            remoteRecord={value:structuredClone(result.draft),updatedAt:result.updatedAt||null,remote:true,revision:Math.max(1,Number(result.revision)||1),clientRevision:Math.max(0,Number(result.clientRevision)||0)};
          }
        }catch(error){
          remoteLoadFailed=true;
          emit(root,'m26:workflow-error',{action:'load-iri-draft-remote',code:String(error?.message||error||'M26_IRI_REMOTE_DRAFT_LOAD_FAILED')});
        }
      }

      const diverged=Boolean(localRecord?.value&&remoteRecord?.value&&!iriDraftsEquivalent(localRecord.value,remoteRecord.value));
      if(diverged){
        const conflict=Object.freeze({revision:remoteRecord.revision,clientRevision:remoteRecord.clientRevision,updatedAt:remoteRecord.updatedAt,draft:structuredClone(remoteRecord.value),missing:false});
        setIriRemoteConflict(clientId,currentAssessmentId,conflict,form);
        populateForm(form,flattenFirstSessionDraft(localRecord.value));
        status(root,'iri','Hay un borrador distinto en otro dispositivo. IBERFIT conserva ambos; elige cuál continuar antes de sincronizar.','error');
      }else{
        setIriRemoteConflict(clientId,currentAssessmentId,null,form);
        const localTime=localRecord?.updatedAt?new Date(localRecord.updatedAt).getTime():0;
        const remoteTime=remoteRecord?.updatedAt?new Date(remoteRecord.updatedAt).getTime():0;
        const selected=remoteRecord&&(!localRecord||remoteTime>=localTime)?remoteRecord:localRecord;
        if(selected?.value){
          populateForm(form,flattenFirstSessionDraft(selected.value));
          if(selected===remoteRecord){
            try{await draftRepository?.save?.(clientId,scope,remoteRecord.value);}
            catch(error){emit(root,'m26:workflow-error',{action:'cache-iri-draft-remote-locally',code:String(error?.message||error||'M26_IRI_REMOTE_DRAFT_LOCAL_CACHE_FAILED')});}
            status(root,'iri',localLoadFailed?'Borrador recuperado desde el respaldo seguro. El almacenamiento local de este dispositivo no respondió, pero no se perdió información.':'Borrador recuperado desde el respaldo seguro.','success');
          }else{
            status(root,'iri','Borrador recuperado desde este dispositivo.','success');
            if(isOnline()&&typeof upsertRemoteDraft==='function'&&!remoteRecord)void persistIriRemoteDraft(clientId,selected.value,form);
          }
        }else if(localLoadFailed){
          status(root,'iri',remoteLoadFailed?'No fue posible leer el borrador de este dispositivo ni consultar el respaldo seguro. No introduzcas datos nuevos hasta recuperar la conexión.':'No se pudo leer el borrador local y no hay un respaldo remoto disponible para esta evaluación.','error');
        }else if(remoteLoadFailed){
          status(root,'iri','No se pudo consultar el respaldo seguro. Si existía un borrador local, se mantiene sin sobrescribir.','pending');
        }
      }
    }
    catch(error){
      emit(root,'m26:workflow-error',{action:'initialize-iri-draft',code:String(error?.message||error||'M26_IRI_DRAFT_INITIALIZE_FAILED')});
      status(root,'iri','No fue posible restaurar el borrador del IRI. Los respaldos existentes no se han sobrescrito.','error');
    }
    computed(form);setIriStep(form,Number(form.dataset.iriStepIndex||0));
  }
  const boundIriSetupToggles=new Set();
  function onIriSetupToggle(event){
    event.preventDefault?.();
    event.stopPropagation?.();
    const button=event.currentTarget;
    const panel=button?.closest?.('[data-iri-setup]')?.querySelector?.('[data-iri-setup-content]');
    if(!panel)return;
    const expand=panel.hidden===true;
    panel.hidden=!expand;
    button.setAttribute('aria-expanded',expand?'true':'false');
  }
  function bindIriSetupToggle(form){
    const button=form?.querySelector?.('[data-iri-setup-toggle]');
    if(!button||boundIriSetupToggles.has(button))return;
    boundIriSetupToggles.add(button);
    button.addEventListener('click',onIriSetupToggle);
    // Keep the native button inert until the real handler is present; no mobile
    // tap can be swallowed by the microtask/MutationObserver binding window.
    button.setAttribute('data-iri-setup-ready','');
    button.disabled=false;
    button.setAttribute('aria-disabled','false');
  }
  function scanRouteForms(){
    scanQueued=false;
    // Route replacements must not retain detached buttons and their listeners.
    for(const previous of boundIriSetupToggles){
      if(!previous.isConnected){
        previous.removeEventListener('click',onIriSetupToggle);
        boundIriSetupToggles.delete(previous);
      }
    }
    const onboardingForm=root.querySelector?.('[data-workflow-form="client-onboarding"]');if(onboardingForm)void initializeOnboardingForm(onboardingForm);
    const iriForm=root.querySelector?.('[data-workflow-form="iri"]');
    if(iriForm){
      // Bind before asynchronous draft restoration; direct listener is attached
      // to the actual actionable element and never depends on bubbling through
      // scrollable mobile shell ancestors.
      bindIriSetupToggle(iriForm);
      void initializeIriForm(iriForm);
    }
    const appointmentForm=root.querySelector?.('[data-workflow-form="appointment"]');if(appointmentForm&&!initializedAppointmentForms.has(appointmentForm)){initializedAppointmentForms.add(appointmentForm);syncAppointmentFormState(appointmentForm,root);}
    const reportForm=root.querySelector?.('[data-workflow-form="report-approval"]');if(reportForm)void initializeReportForm(reportForm);
    const planForm=root.querySelector?.('[data-workflow-form="planning"]');if(planForm)void initializePlanForm(planForm);
    for(const guidedForm of root.querySelectorAll?.('[data-guided-required-form]')||[])syncGuidedWorkflowProgress(guidedForm);
    const clientGrid=root.querySelector?.('[data-client-grid]');if(clientGrid&&!initializedClientGrids.has(clientGrid)){initializedClientGrids.add(clientGrid);scheduleClientListUpdate();}
    restoreStatuses(root);
  }
  function queueScan(){if(scanQueued)return;scanQueued=true;queueMicrotask(scanRouteForms);}


  async function createClient(){
    requireCoach();if(typeof createClientDraft!=='function')throw new Error('M26_CLIENT_CREATE_UNAVAILABLE');if(!isOnline())throw new Error('M26_OFFLINE_CLIENT_CREATE_NOT_ALLOWED');
    const form=root.querySelector?.('[data-workflow-form="client-onboarding"]');if(!form)throw new Error('M26_CLIENT_FORM_REQUIRED');ensureValidForm(form,{code:'M26_CLIENT_ONBOARDING_INVALID',labels:ONBOARDING_FIELD_LABELS,summary:'Completa los datos obligatorios del expediente'});const raw=values(form);const payload=legacyClientDraftPayload(raw);
    await saveOnboardingDraft(form);status(root,'client-onboarding','Verificando backend y creando expediente protegido…','pending');const outcome=await createClientDraft(payload);const result=outcome?.result||outcome;const state=store.getState();const resultId=clientRecordId(result);const created=outcome?.client||(state.collections.clients||[]).find((item)=>String(item.id)===resultId)||(state.collections.clients||[]).find((item)=>clientEmail(item)===payload.email);
    if(!created?.id)throw new Error('M26_CLIENT_CREATE_NOT_PERSISTED');
    const nextArea=initialAssessmentPostCreateArea(payload.initialAssessmentMode);
    await draftRepository?.remove?.(CLIENT_ONBOARDING_LOCAL_ID,CLIENT_ONBOARDING_DRAFT_SCOPE);store.selectClient?.(created.id);store.navigate?.(nextArea);onRender();emit(root,'m26:toast',{message:nextArea==='iri'?`Expediente de ${clientName(created)} creado. Continúa con el Diagnóstico IRI inicial.`:`Expediente de ${clientName(created)} creado. El Diagnóstico IRI queda disponible para realizarlo después.`});
    return result;
  }
  async function completeIri(){
    requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');const current=currentIriRecord(form);const draft=iriDraft(form);const check=validateFirstSessionDraft(draft);
    if(!check.ok){const first=IRI_FIRST_SESSION_STEPS.find((step)=>check.byStep[step]?.length)||'revision';const pending=Object.entries(check.byStep).flatMap(([step,items])=>items.map((item)=>({step,item,label:IRI_FIELD_LABELS[item]||item})));setIriStep(form,IRI_FIRST_SESSION_STEPS.indexOf(first));showStepValidation(form,first,check.byStep[first]);focusIriValidationError(form,check.byStep[first]);const error=new Error(`M26_IRI_FIRST_SESSION_INVALID:${check.errors.join(',')}`);error.userMessage=`No puedes confirmar todavía: faltan ${pending.length} ${pending.length===1?'elemento':'elementos'}. ${pending.map(({label})=>label).join(', ')}.`;throw error;}
    assertPhysicalAssessmentConsent(form);assertNormContextAccepted(form);assertNoUnpersistedIriAttachment(form);assertIriRawRanges(form);assertNoIriRemoteConflict(draft.clientId,current.id,form);const commandDraft=buildIriCommandDraftFromFirstSession(draft,current);await persistIriDraftBackup(draft.clientId,draft,form);
    if(typeof ensureIriPhysicalConsent!=='function')throw new Error('M26_IRI_PHYSICAL_CONSENT_SERVICE_UNAVAILABLE');
    status(root,'iri','Registrando consentimiento y confirmando la evaluación…','pending');
    await withTimeout(Promise.resolve(ensureIriPhysicalConsent({clientId:draft.clientId,assessmentId:current.id,accepted:true,note:'Consentimiento para evaluación física IRI registrado al confirmar el punto de partida inicial.'})),15_000,'M26_IRI_PHYSICAL_CONSENT_TIMEOUT');
    const result=await withTimeout(commandBus.execute(buildIriCommand(commandDraft,Number(current.revision||0))),20_000,'M26_IRI_CONFIRM_TIMEOUT');
    if(!result.ok){const reason=String(result?.response?.reason||'');if(result.kind==='conflict'&&reason==='V26_IRI_PROFILE_REVISION_CONFLICT'){status(root,'iri','La ficha cambió mientras preparabas el IRI. El borrador se conserva: revisa de nuevo los datos del expediente antes de confirmar.','error');return result;}status(root,'iri','La evaluación permanece pendiente de revisión. El borrador local se conserva.','pending');return result;}
    const confirmed=await refreshAndFind('iriAssessments',current.id,draft.clientId);const body=recordBody(confirmed||{});if(!confirmed||!body.firstSessionCompletedAt)throw new Error('M26_IRI_CONFIRM_NOT_PERSISTED');
    await clearIriDraftBackups(draft.clientId,draft,form);status(root,'iri','Primera sesión e IRI confirmados y visibles en el expediente.','success');onRender();return result;
  }
  async function persistPhysicalConsentBeforeTesting(form,draft){
    assertPhysicalAssessmentConsent(form);
    const current=currentIriRecord(form),assessmentId=recordId(current);
    if(!assessmentId)throw new Error('M26_IRI_PHYSICAL_CONSENT_ASSESSMENT_REQUIRED');
    if(typeof ensureIriPhysicalConsent!=='function')throw new Error('M26_IRI_PHYSICAL_CONSENT_SERVICE_UNAVAILABLE');
    if(!isOnline()){
      status(root,'iri','Consentimiento registrado en el borrador. Sin conexión: se verificará en el servidor antes de confirmar el IRI.','pending');
      return Object.freeze({ok:false,deferred:true,reason:'offline'});
    }
    status(root,'iri','Registrando consentimiento antes de iniciar las pruebas físicas…','pending');
    try{
      return await withTimeout(Promise.resolve(ensureIriPhysicalConsent({
        clientId:draft.clientId,
        assessmentId,
        accepted:true,
        note:'Consentimiento para evaluación física IRI registrado antes de iniciar movilidad, fuerza y capacidad de esfuerzo.'
      })),15_000,'M26_IRI_PHYSICAL_CONSENT_TIMEOUT');
    }catch(error){
      const code=String(error?.message||error||'');
      if(/NETWORK|FETCH|TIMEOUT|OFFLINE|AbortError/i.test(code)){
        emit(root,'m26:workflow-error',{action:'persist-iri-physical-consent-deferred',code});
        status(root,'iri','No se pudo sincronizar el consentimiento ahora. La evaluación puede continuar y se verificará obligatoriamente antes de confirmar.','pending');
        return Object.freeze({ok:false,deferred:true,reason:'connectivity'});
      }
      throw error;
    }
  }
  async function moveIri(direction){
    requireCoach();const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');const index=Number(form.dataset.iriStepIndex||0);
    if(direction>0){assertIriRawRanges(form);const step=IRI_FIRST_SESSION_STEPS[index];if(step==='entrevista')assertPhysicalAssessmentConsent(form);const draft=iriDraft(form);const check=validateFirstSessionStep(draft,step);showStepValidation(form,step,check.errors);if(!check.ok){focusIriValidationError(form,check.errors);throw new Error(`M26_IRI_STEP_INVALID:${step}:${check.errors.join(',')}`);}if(step==='entrevista')await persistPhysicalConsentBeforeTesting(form,draft);await saveIriDraft({silent:true});}
    setIriStep(form,index+direction,{focus:true});try{computed(form);}catch{}
  }
  function confirmedIriAllowsDirectReview(form){
    const body=recordBody(currentIriRecord(form));
    return Boolean(body?.firstSessionCompletedAt||body?.first_session_completed_at);
  }
  async function jumpIri(index){
    const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)return;
    const current=Number(form.dataset.iriStepIndex||0);
    const confirmedReview=confirmedIriAllowsDirectReview(form);
    const target=confirmedReview?index:(index>current+1?current+1:index);
    if(!confirmedReview&&target>current){assertIriRawRanges(form);const step=IRI_FIRST_SESSION_STEPS[current];if(step==='entrevista')assertPhysicalAssessmentConsent(form);const draft=iriDraft(form);const check=validateFirstSessionStep(draft,step);showStepValidation(form,step,check.errors);if(!check.ok){focusIriValidationError(form,check.errors);status(root,'iri','Completa la etapa actual antes de avanzar.','error');return;}if(step==='entrevista')await persistPhysicalConsentBeforeTesting(form,draft);await saveIriDraft({silent:true});}
    if(!confirmedReview&&index>current+1)status(root,'iri','El IRI avanza etapa a etapa para no omitir validaciones ni consentimientos.','info');
    setIriStep(form,target,{focus:true});try{computed(form);}catch{}
  }
  function reportContext(draft){const {state,clientId}=context();const client=(state.collections.clients||[]).find((item)=>item.id===clientId);const identity=state.identity||{};const lifecycle=String(client?.lifecycleStatus||client?.lifecycle_status||client?.lifecycle?.status||'').trim().toLowerCase();const coachName=String(identity.name||identity.fullName||identity.email||'Coach IBERFIT');const coachIdentity=[identity.name,identity.fullName,identity.email].filter(Boolean).join(' ').toLowerCase();let logoUrl='/public/isotipo-iberfit.png';let signatureUrl=/carlos|iberfit\.cl@gmail\.com/u.test(coachIdentity)?'/m26/assets/iberfit-signature-carlos.svg':'';try{const origin=globalThis.location?.origin||'https://m26-canary.iberfit.cl';logoUrl=new URL('/public/isotipo-iberfit.png',origin).href;if(signatureUrl)signatureUrl=new URL(signatureUrl,origin).href;}catch{}
    return {draft,clientId,clientName:clientName(client),coachName,logoUrl,signatureUrl,iriOnly:lifecycle==='iri_only'};
  }
  function iriReportStatusScope(){return root.querySelector?.('[data-workflow-form="iri"]')?'iri':'iri-report';}
  async function generateIriReport(variant){
    const {role,clientId,state}=context();
    if(variant!=='client'&&!['admin','coach'].includes(role))throw new Error('M26_WORKFLOW_ROLE_FORBIDDEN');
    if(variant==='coach')requireCoach();
    requireVisibleClient(clientId);
    const confirmedRecord=currentIriRecord();const confirmedBody=recordBody(confirmedRecord);if(!confirmedBody?.firstSessionCompletedAt&&!confirmedBody?.first_session_completed_at)throw new Error('M26_IRI_REPORT_REQUIRES_CONFIRMATION');const draft=confirmedFirstSessionDraft(confirmedRecord,clientId);const check=validateFirstSessionDraft(draft);if(!check.ok){const error=new Error(`M26_IRI_CONFIRMED_REPORT_DATA_INVALID:${check.errors.join(',')}`);error.userMessage=`El IRI confirmado no puede convertirse todavía en informe: ${check.errors.map((item)=>IRI_FIELD_LABELS[item]||item).join(', ')}.`;throw error;}
    let externalReport=null;let photogrammetryReport=null;let printTarget=null;
    try{
      printTarget=prepareIriReportPrintTarget();
      if(!printTarget)throw new Error('M26_IRI_REPORT_POPUP_BLOCKED');
      [externalReport,photogrammetryReport]=await Promise.all([
        getIriExternalReport(draft.assessmentId,{variant}),
        getIriPhotogrammetryReport(draft.assessmentId,{variant}),
      ]);
      const result=openIriReportPrint({...reportContext(draft),variant,externalReport,photogrammetryReport,printTarget});status(root,iriReportStatusScope(),variant==='client'?'Informe Cliente preparado para guardar como PDF.':'Informe Coach / Admin preparado para guardar como PDF.','success');return result;
    }catch(error){try{printTarget?.close?.();}catch{}throw error;}
  }

  function iriIssuedHistoryHost(){return root.querySelector?.('[data-iri-issued-history]')||null;}
  function iriIssuedDate(value){
    const date=new Date(value||'');
    return Number.isNaN(date.getTime())?'Fecha no disponible':new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(date);
  }
  function renderIriIssuedHistory(history){
    const host=iriIssuedHistoryHost();if(!host)return false;
    const items=Array.isArray(history?.items)?history.items:[];
    if(!items.length){
      host.innerHTML='<div class="m26-notice"><strong>Sin documentos emitidos</strong><p>Generar una vista previa no crea una emisión. Las versiones definitivas aparecerán aquí.</p></div>';
      return true;
    }
    const manager=history?.manager===true;
    host.innerHTML=`<div class="m26-issued-report-list">${items.map((item)=>{
      const label=item.audience==='cliente'?'Cliente':'Coach / Admin';
      const withdrawn=item.withdrawn===true;
      const hash=item.artifactSha256?escape(String(item.artifactSha256).slice(0,12)+'…'):'';
      const withdrawal=manager&&!withdrawn
        ?`<input type="text" data-iri-withdraw-reason maxlength="1200" minlength="3" placeholder="Motivo de retirada" aria-label="Motivo de retirada"><button type="button" data-workflow-action="withdraw-issued-iri-report" data-issuance-id="${escape(item.issuanceId)}">Retirar</button>`
        :'';
      return `<article class="m26-issued-report-item${withdrawn?' is-withdrawn':''}" data-iri-issued-item="${escape(item.issuanceId)}"><div><span>${escape(label)} · v${Number(item.version||0)}</span><strong>${escape(iriIssuedDate(item.issuedAt))}</strong><small>${withdrawn?'Retirado':hash?'SHA-256 '+hash:'Documento inmutable'}</small></div><div class="m26-inline-actions"><button type="button" data-workflow-action="open-issued-iri-report" data-issuance-id="${escape(item.issuanceId)}">${withdrawn?'Abrir versión retirada':'Abrir PDF emitido'}</button>${withdrawal}</div>${withdrawn&&manager&&item.withdrawnReason?`<p class="m26-field-help">Motivo: ${escape(item.withdrawnReason)}</p>`:''}</article>`;
    }).join('')}</div>`;
    return true;
  }
  async function loadIriIssuedHistory(){
    if(typeof getIriReportHistory!=='function')throw new Error('M26_IRI_REPORT_GOVERNANCE_UNAVAILABLE');
    const assessmentId=recordId(currentIriRecord());
    if(!assessmentId)throw new Error('M26_IRI_REPORT_ASSESSMENT_INVALID');
    status(root,iriReportStatusScope(),'Cargando historial de documentos emitidos…','pending');
    const history=await withTimeout(Promise.resolve(getIriReportHistory(assessmentId)),35_000,'M26_IRI_REPORT_HISTORY_TIMEOUT');
    renderIriIssuedHistory(history);
    status(root,iriReportStatusScope(),'Historial documental actualizado.','success');
    return history;
  }
  async function issueIriReportDocument(variant){
    requireCoach();
    if(typeof issueIriReport!=='function')throw new Error('M26_IRI_REPORT_GOVERNANCE_UNAVAILABLE');
    const record=currentIriRecord(),assessmentId=recordId(record),body=recordBody(record);
    if(!assessmentId||(!body?.firstSessionCompletedAt&&!body?.first_session_completed_at))throw new Error('M26_IRI_REPORT_REQUIRES_CONFIRMATION');
    let target=null;
    try{target=prepareIriReportPrintTarget();}catch{}
    status(root,iriReportStatusScope(),variant==='client'?'Emitiendo y archivando el PDF Cliente…':'Emitiendo y archivando el dossier Coach / Admin…','pending');
    try{
      const issued=await withTimeout(Promise.resolve(issueIriReport(assessmentId,{variant})),180_000,'M26_IRI_REPORT_EMISSION_TIMEOUT');
      if(issued?.signedUrl&&target?.location?.replace)target.location.replace(issued.signedUrl);else try{target?.close?.();}catch{}
      try{const history=await getIriReportHistory?.(assessmentId);if(history)renderIriIssuedHistory(history);}catch{}
      status(root,iriReportStatusScope(),`Documento emitido y archivado como versión ${Number(issued?.version||0)}. La versión emitida queda inmutable.`,'success');
      return issued;
    }catch(error){try{target?.close?.();}catch{}throw error;}
  }
  async function openIriIssued(button){
    if(typeof openIriIssuedReport!=='function')throw new Error('M26_IRI_REPORT_GOVERNANCE_UNAVAILABLE');
    const issuanceId=String(button?.dataset?.issuanceId||'').trim();
    if(!issuanceId)throw new Error('M26_IRI_REPORT_ISSUANCE_INVALID');
    let target=null;
    try{target=prepareIriReportPrintTarget();}catch{}
    try{
      const opened=await withTimeout(Promise.resolve(openIriIssuedReport(issuanceId)),35_000,'M26_IRI_REPORT_OPEN_TIMEOUT');
      if(!opened?.signedUrl)throw new Error('M26_IRI_REPORT_SIGNED_URL_REQUIRED');
      if(target?.location?.replace)target.location.replace(opened.signedUrl);
      else throw new Error('M26_IRI_REPORT_POPUP_BLOCKED');
      return opened;
    }catch(error){try{target?.close?.();}catch{}throw error;}
  }
  async function withdrawIriIssued(button){
    requireCoach();
    if(typeof withdrawIriIssuedReport!=='function')throw new Error('M26_IRI_REPORT_GOVERNANCE_UNAVAILABLE');
    const issuanceId=String(button?.dataset?.issuanceId||'').trim();
    const item=button?.closest?.('[data-iri-issued-item]');
    const reason=String(item?.querySelector?.('[data-iri-withdraw-reason]')?.value||'').trim();
    if(reason.length<3)throw new Error('M26_IRI_REPORT_WITHDRAW_REASON_INVALID');
    status(root,iriReportStatusScope(),'Retirando la versión sin alterar el artefacto archivado…','pending');
    await withTimeout(Promise.resolve(withdrawIriIssuedReport(issuanceId,reason)),35_000,'M26_IRI_REPORT_WITHDRAW_TIMEOUT');
    await loadIriIssuedHistory();
    status(root,iriReportStatusScope(),'Versión retirada. El historial permanece íntegro y auditable.','success');
  }

  async function updatePlanDraftChoices(form,{restoreSingle=false}={}){
    const picker=form?.querySelector?.('[data-plan-draft-choice]');
    const clientId=planFormClientIds.get(form);
    if(!picker||!clientId||!draftRepository?.list)return;
    const candidates=await listPlanningDrafts(draftRepository,clientId);
    if(!root.contains?.(form)||context().clientId!==clientId)return;
    const id=String(form.elements?.namedItem?.('entityId')?.value||'').trim();
    const doc=form.ownerDocument;
    picker.replaceChildren();
    const blank=doc.createElement('option');blank.value='';blank.textContent='Crear un ciclo nuevo';picker.append(blank);
    for(const record of candidates){
      const draft=record.value,option=doc.createElement('option');
      option.value=String(draft.id);
      option.textContent=[String(draft.name||'Ciclo sin nombre').slice(0,100),[draft.startDate,draft.endDate].filter(Boolean).join(' → ')].filter(Boolean).join(' · ');
      picker.append(option);
    }
    picker.value=candidates.some(x=>String(x.value.id)===id)?id:'';
    if(!restoreSingle||editedPlanForms.has(form))return;
    const candidate=id?candidates.find(x=>String(x.value.id)===id):candidates.length===1?candidates[0]:null;
    if(candidate){
      const saved=await restorePlanningDraft(draftRepository,clientId,candidate.value.id);
      if(!saved?.value||editedPlanForms.has(form)||!root.contains?.(form)||context().clientId!==clientId)return;
      if(id&&String(form.elements?.namedItem?.('entityId')?.value||'')!==id)return;
      populateForm(form,saved.value);
      picker.value=String(saved.value.id);
      syncGuidedWorkflowProgress(form);
      status(root,'planning','Borrador de ciclo recuperado desde este dispositivo.','success');
    }else if(!id&&candidates.length>1){
      status(root,'planning','Hay varios ciclos guardados. Selecciona cuál continuar o crea uno nuevo.','info');
    }
  }
  async function selectPlanDraft(form,selectedId){
    const clientId=planFormClientIds.get(form);
    requireCoach();requireVisibleClient(clientId);
    if(clientId!==context().clientId)return;
    const seq=++planSelectionSequence;
    clearTimeout(planSaveTimer);planSaveTimer=null;
    await planDraftChain;
    if(seq!==planSelectionSequence)return;
    if(editedPlanForms.has(form)){
      await savePlanDraft(form,{silent:true});
      editedPlanForms.delete(form);
    }
    if(seq!==planSelectionSequence||!root.contains?.(form)||context().clientId!==clientId)return;
    if(!selectedId){
      form.reset();
      for(const field of ['entityId','name','startDate','endDate','goal','weeklyFrequency','sessionDurationMinutes','modality']){
        const control=form.elements?.namedItem?.(field);if(control)control.value='';
      }
      syncGuidedWorkflowProgress(form);
      status(root,'planning','Nuevo ciclo preparado. Los borradores anteriores se conservan.','info');
      await updatePlanDraftChoices(form);
      return;
    }
    const saved=await restorePlanningDraft(draftRepository,clientId,selectedId);
    if(seq!==planSelectionSequence||!root.contains?.(form)||context().clientId!==clientId)return;
    if(!saved?.value){
      status(root,'planning','No encontramos ese ciclo guardado. Los otros borradores no se han modificado.','error');
      return;
    }
    populateForm(form,saved.value);
    syncGuidedWorkflowProgress(form);
    status(root,'planning','Ciclo recuperado para continuar.','success');
    await updatePlanDraftChoices(form);
  }
  function planDraftPayload(raw,clientId,stableId){
    return {id:stableId,clientId,name:String(raw.name||'').trim(),
      startDate:raw.startDate||'',endDate:raw.endDate||'',goal:String(raw.goal||'').trim(),
      weeklyFrequency:raw.weeklyFrequency||'',sessionDurationMinutes:raw.sessionDurationMinutes||'',modality:raw.modality||''};
  }
  async function savePlanDraft(form,{silent=false}={}){
    requireCoach();
    if(!form)throw new Error('M26_PLAN_FORM_REQUIRED');
    if(!draftRepository?.save)throw new Error('M26_PLAN_DRAFT_STORAGE_UNAVAILABLE');
    const {clientId}=context();requireVisibleClient(clientId);
    if(planFormClientIds.has(form)&&planFormClientIds.get(form)!==clientId)throw new Error('M26_PLAN_DRAFT_CLIENT_CONTEXT_CHANGED');
    const raw=values(form),stableId=String(raw.entityId||'').trim()||createM26Id();
    const scope=planningDraftScope(stableId);
    // Pin identity synchronously: overlapping autosaves cannot invent a second ID.
    const entityControl=form.elements?.namedItem?.('entityId');if(entityControl)entityControl.value=stableId;
    const draft=planDraftPayload(raw,clientId,stableId);
    const write=planDraftChain.then(()=>draftRepository.save(clientId,scope,draft));
    planDraftChain=write.catch(()=>{});await write;
    if(!silent)status(root,'planning','Borrador del ciclo guardado en este dispositivo. Puedes validarlo cuando completes los datos.','success');
    try{await updatePlanDraftChoices(form);}catch(error){emit(root,'m26:workflow-warning',{action:'plan-draft-selector',code:String(error?.message||error)});}
    return draft;
  }
  function queuePlanSave(form){
    clearTimeout(planSaveTimer);
    planSaveTimer=setTimeout(()=>{
      planSaveTimer=null;
      if(!root.contains?.(form)||planFormClientIds.get(form)!==context().clientId)return;
      void savePlanDraft(form,{silent:true}).catch(error=>{
        status(root,'planning','No fue posible guardar este borrador. Conserva la pantalla abierta y revisa el almacenamiento local.','error');
        emit(root,'m26:workflow-error',{action:'autosave-plan-draft',code:String(error?.message||error)});
      });
    },650);
  }
  async function initializePlanForm(form){
    if(!form||initializedPlanForms.has(form))return;
    initializedPlanForms.add(form);
    const {clientId}=context();planFormClientIds.set(form,clientId);
    if(!clientId||!draftRepository?.load)return;
    try{await updatePlanDraftChoices(form,{restoreSingle:true});}
    catch(error){
      status(root,'planning','No fue posible recuperar los borradores. Ningún ciclo guardado se ha eliminado.','error');
      emit(root,'m26:workflow-error',{action:'load-plan-draft',code:String(error?.message||error)});
    }
  }

  // A remote ACK and local draft removal must be serialized with autosaves;
  // later edits, a switched client and a changed cycle must survive cleanup.
  async function settleConfirmedPlanDraft(form,clientId,stableId,signature){
    await planDraftChain;
    // No local repository is a storage limitation, not a server rejection.
    if(!draftRepository)return {cleaned:true,reason:'no-local-repository'};
    return finalizeConfirmedPlanningDraft(draftRepository,clientId,stableId,{
      isCurrent:()=>Boolean(root.contains?.(form)&&context().clientId===clientId
        &&planFormClientIds.get(form)===clientId
        &&String(form.elements?.namedItem?.('entityId')?.value||'').trim()===stableId),
      readEditedDraft:()=>{
        const raw=values(form);
        return planningFormSignature(raw)===signature?null:planDraftPayload(raw,clientId,stableId);
      },
    });
  }

  // Same-tab duplicate submissions must share one server operation. In
  // particular, both clicks must not race before the remote draft is loaded.
  // A failed ACK leaves the persisted draft intact for explicit recovery.
  let planValidationPending=null;
  async function validatePlan(){
    if(planValidationPending)return planValidationPending;
    const operation=performValidatePlan();
    planValidationPending=operation;
    void operation.then(
      ()=>{if(planValidationPending===operation)planValidationPending=null;},
      ()=>{if(planValidationPending===operation)planValidationPending=null;}
    );
    return operation;
  }
  async function performValidatePlan(){
    requireCoach();
    clearTimeout(planSaveTimer);planSaveTimer=null;
    await planDraftChain;
    const form=root.querySelector?.('[data-workflow-form="planning"]');
    if(!form)throw new Error('M26_PLAN_FORM_REQUIRED');
    ensureValidForm(form);
    const raw=values(form);
    const {clientId,state}=context();
    requireVisibleClient(clientId);
    const records=(state.collections.trainingCycles||[]).filter(item=>recordClientId(item)===String(clientId));
    const sameCycle=(item)=>String(recordBody(item).name||item.name||'').trim()===String(raw.name||'').trim()
      &&String(recordBody(item).startDate||item.startDate||'').slice(0,10)===String(raw.startDate||'')
      &&String(recordBody(item).endDate||item.endDate||'').slice(0,10)===String(raw.endDate||'');
    let backup=null;
    const visibleId=String(raw.entityId||'').trim();
    try{
      if(visibleId)backup=await restorePlanningDraft(draftRepository,clientId,visibleId);
      else{
        const legacy=await draftRepository?.load?.(clientId,'planning-cycle');
        if(legacy?.value?.clientId===clientId&&sameCycle(legacy.value))backup=legacy;
      }
    }catch(error){emit(root,'m26:workflow-warning',{action:'validate-plan',code:'M43_PLAN_LOCAL_DRAFT_LOAD_UNAVAILABLE'});}
    const saved=backup?.value&&typeof backup.value==='object'?backup.value:null;
    const stableId=visibleId
      ||(saved?.clientId===clientId&&sameCycle(saved)?String(saved.id||''):null)
      ||(records.find(sameCycle)?.id||null)
      ||createM26Id();
    const scoped=planningDraftScope(stableId);
    const entityControl=form.elements?.namedItem?.('entityId');if(entityControl)entityControl.value=stableId;
    const validatedFormSnapshot=planningFormSignature(values(form));
    const draft={id:stableId,clientId,name:String(raw.name||'').trim(),
      startDate:raw.startDate,endDate:raw.endDate,goal:String(raw.goal||'').trim(),
      weeklyFrequency:Number(raw.weeklyFrequency||0)||null,
      sessionDurationMinutes:Number(raw.sessionDurationMinutes||0)||null,
      modality:normalizeClientModality(raw.modality)||null};
    const current=records.find(item=>recordId(item)===stableId)||null;
    // A complete valid online cycle must remain submittable when browser
    // storage is unavailable. Keep the form and report local storage errors,
    // but do not present them as a missing field or a server rejection.
    try{await draftRepository?.save?.(clientId,scoped,draft);}
    catch(error){emit(root,'m26:workflow-warning',{action:'validate-plan',code:'M26_PLAN_LOCAL_DRAFT_SAVE_UNAVAILABLE'});}
    // A previously acknowledged save may have failed only its refresh. Never
    // create another entity or issue PLAN_VALIDAR against validated revision 1.
    const existingBody=current?recordBody(current):null;
    const sameValidated=existingBody
      &&String(existingBody.name||'').trim()===draft.name
      &&String(existingBody.goal||'').trim()===draft.goal
      &&String(existingBody.startDate||'').slice(0,10)===draft.startDate
      &&String(existingBody.endDate||'').slice(0,10)===draft.endDate
      &&Number(existingBody.weeklyFrequency)===draft.weeklyFrequency
      &&Number(existingBody.sessionDurationMinutes)===draft.sessionDurationMinutes
      &&String(existingBody.modality||'')===String(draft.modality||'');
    const statusNow=current?normalizedStatus(current):'';
    if(sameValidated&&['validado','aprobado','publicado'].includes(statusNow)){
      let cleanup={cleaned:false};
      try{cleanup=await settleConfirmedPlanDraft(form,clientId,stableId,validatedFormSnapshot);}
      catch(error){emit(root,'m26:workflow-warning',{action:'validate-plan',code:'M26_PLAN_DRAFT_CLEANUP_PENDING'});}
      if(!cleanup.cleaned){
        status(root,'planning','El ciclo ya estaba confirmado. Se conservan los cambios locales o la limpieza pendiente, sin volver a enviarlo.','pending');
        return {ok:true,kind:'already-confirmed',refreshPending:true,localDraftOk:false};
      }
      editedPlanForms.delete(form);
      status(root,'planning','El ciclo ya estaba guardado y confirmado. No se creó ningún duplicado.','success');
      onRender();
      return {ok:true,kind:'already-confirmed'};
    }
    if(current&&['publicado','aprobado','archivado'].includes(statusNow)){
      const error=new Error('M35_PLAN_NEW_VERSION_REQUIRED');
      error.userMessage='Este ciclo ya tiene una decisión de publicación. Conservamos los cambios locales; prepara una nueva versión antes de modificar el contenido confirmado.';
      throw error;
    }
    let revision=Number(current?.revision||0);
    if(current&&statusNow==='validado'){
      status(root,'planning','Preparando una nueva revisión del ciclo anterior…','pending');
      const reopening=await withTimeout(commandBus.execute({
        type:'PLAN_REABRIR',entityType:'planning',entityId:stableId,clientId,
        baseRevision:revision,reason:'Cambio del ciclo revisado y confirmado por el Coach.',
        payload:{patch:{status:'borrador',visibleToClient:false}},
      }),20_000,'M35_PLAN_REOPEN_TIMEOUT');
      if(!reopening.ok){
        status(root,'planning','El ciclo cambió en otro dispositivo. Conservamos el borrador: revisa la versión actual.','error');
        return reopening;
      }
      revision=Number(reopening.response?.remoteRevision||revision+1);
    }
    status(root,'planning','Validando y guardando el ciclo…','pending');
    const result=await withTimeout(commandBus.execute(buildCycleCommand(draft,revision)),20_000,'M26_PLAN_CONFIRM_TIMEOUT');
    if(!result.ok){
      const feedback=mutationFeedback(result,{subject:'El ciclo'});
      status(root,'planning',feedback.message,feedback.kind);
      return result;
    }
    // A transport ACK and a UI refresh are different outcomes. Do not tell
    // the Coach validation failed when the server committed successfully.
    let confirmed=null;
    try{confirmed=await refreshAndFind('trainingCycles',stableId,clientId);}
    catch{}
    if(!confirmed||normalizedStatus(confirmed)!=='validado'){
      emit(root,'m26:workflow-warning',{action:'validate-plan',code:'M26_PLAN_CONFIRM_NOT_PERSISTED'});
      status(root,'planning','El servidor confirmó el ciclo. La vista todavía no refleja la versión guardada; conserva el borrador y actualiza antes de repetir la validación.','pending');
      return {...result,refreshOk:false};
    }
    let localDraftOk=false;
    try{
      const cleanup=await settleConfirmedPlanDraft(form,clientId,stableId,validatedFormSnapshot);
      localDraftOk=cleanup.cleaned===true;
    }catch(error){
      emit(root,'m26:workflow-warning',{action:'validate-plan',code:'M26_PLAN_DRAFT_CLEANUP_PENDING'});
    }
    if(!localDraftOk){
      status(root,'planning','El servidor confirmó el ciclo. Los cambios posteriores o el borrador pendiente de limpieza se conservan. Revisa antes de volver a validar.','pending');
      return {...result,refreshPending:true,localDraftOk:false};
    }
    // Local cleanup is not a second server confirmation. Preserve the ACK and
    // the editable draft if the browser storage is temporarily unavailable.
    if(localDraftOk)editedPlanForms.delete(form);
    const settled=localDraftOk?result:{...result,refreshPending:true,localDraftOk:false};
    const feedback=mutationFeedback(settled,{success:'Ciclo validado y visible en Planificación.',subject:'El ciclo'});
    status(root,'planning',feedback.message,feedback.kind);
    if(localDraftOk&&result.refreshOk!==false)onRender();
    return settled;
  }
  async function createAppointment(){requireCoach();const form=root.querySelector?.('[data-workflow-form="appointment"]');if(!form)throw new Error('M26_APPOINTMENT_FORM_REQUIRED');syncAppointmentFormState(form,root);ensureValidForm(form);const raw=values(form);const clientId=requireVisibleClient(String(raw.clientId||''));const start=santiagoAppointmentInstant(raw.startAt),end=santiagoAppointmentInstant(raw.endAt);const modality=normalizeAppointmentModality(raw.modality);if(!modality)throw new Error('M26_APPOINTMENT_MODALITY_INVALID');const draft={clientId,startAt:start,endAt:end,modality,location:String(raw.location||'').trim().slice(0,300)};
    const selectedId=String(raw.sessionId||'').trim();
    const linked=resolveCoachAppointmentSessionLink(context().state,{clientId,sessionId:selectedId});
    if(linked){
      draft.sessionId=linked.id;
      draft.title=linked.title||'Sesión IBERFIT';
      // A mismatched ownership cannot be corrected by a UI dropdown.
      // Keep manual modality choices, but do not claim the appointment
      // represents a different training delivery than the published plan.
      if(linked.deliveryModality&&linked.deliveryModality!==modality)
        throw new Error('M26_APPOINTMENT_LINKED_MODALITY_MISMATCH');
    }
    const command=buildAppointmentCommand(draft,0);
    status(root,'appointment','Creando propuesta interna…','pending');
    const result=await withTimeout(commandBus.execute(command),20_000,'M26_APPOINTMENT_CONFIRM_TIMEOUT');
    const feedback=mutationFeedback(result,{success:'Propuesta de cita creada. Aún no es visible para el cliente.',subject:'La cita'});
    if(!feedback.confirmed){status(root,'appointment',feedback.message,feedback.kind);return result;}
    let refreshed=result.refreshOk!==false;
    if(refreshed){try{await withTimeout(Promise.resolve(refreshState({reason:'appointment-created'})),15_000,'M26_WORKFLOW_REFRESH_TIMEOUT');}catch{refreshed=false;}}
    const persisted=refreshed
      ?(context().state.collections.appointments||[]).find(item=>
        String(item?.id||item?.body?.id||'')===command.entityId&&
        String(item?.clientId||item?.client_id||item?.body?.clientId||'')===clientId)
      :null;
    const persistedSession=persisted?.sessionId??persisted?.session_id??
      persisted?.body?.sessionId??persisted?.body?.session_id??null;
    const linkVerified=!linked||String(persistedSession||'')===linked.id;
    status(root,'appointment',
      !refreshed?'El servidor confirmó la propuesta, pero la vista no se pudo actualizar. Comprueba la Agenda antes de crear otra.'
      :!linkVerified?'La cita se ha creado, pero no se ha podido verificar su entrenamiento vinculado. Revisa Agenda antes de confirmarla.'
      :feedback.message,
      refreshed&&linkVerified?feedback.kind:'pending');
    if(!refreshed||!linkVerified){
      // The server might already have committed CITA_CREAR. Never clear the
      // form or offer an easy duplicate before the Coach reconciles Agenda.
      form.dataset.m26AppointmentUnverified=command.entityId;
      const submit=form.querySelector?.('[data-workflow-action="create-appointment"]');
      if(submit){submit.disabled=true;submit.setAttribute?.('aria-disabled','true');}
      return {...result,refreshOk:false};
    }
    form.reset();initializedAppointmentForms.delete(form);
    syncAppointmentFormState(form,root);initializedAppointmentForms.add(form);onRender();
    return result;}
  async function confirmAppointment(button){requireCoach();if(!isOnline())throw new Error('M26_OFFLINE_APPOINTMENT_CONFIRM_NOT_ALLOWED');const appointmentId=String(button?.dataset?.entityId||'').trim();if(!appointmentId)throw new Error('M26_APPOINTMENT_ID_REQUIRED');const {state}=context();const record=(state.collections.appointments||[]).find((item)=>String(item?.id||item?.body?.id||'')===appointmentId);if(!record)throw new Error('M26_APPOINTMENT_NOT_FOUND');const body=recordBody(record);const clientId=requireVisibleClient(String(record.clientId||record.client_id||body.clientId||body.client_id||''));status(root,'appointment','Confirmando la cita y preparando su visibilidad para el cliente…','pending');const result=await withTimeout(commandBus.execute(buildConfirmAppointmentCommand({clientId,appointmentId},Number(record.revision||body.revision||0))),20_000,'M26_APPOINTMENT_CONFIRM_TIMEOUT');if(!result.ok){const feedback=mutationFeedback(result,{subject:'La cita'});status(root,'appointment',feedback.message,feedback.kind);return result;}
    let confirmed=null;
    if(result.refreshOk!==false){try{confirmed=await refreshAndFind('appointments',appointmentId,clientId);}catch{}}
    if(!confirmed||!/confirm/i.test(normalizedStatus(confirmed))){
      status(root,'appointment','El servidor confirmó la cita, pero la Agenda aún no refleja el cambio. Actualiza antes de confirmarla otra vez.','pending');
      return {...result,refreshOk:false};
    }
    status(root,'appointment','Cita confirmada y visible para el cliente.','success');onRender();return result;}
  function reuseSession(button){requireCoach();const sessionId=String(button?.dataset?.entityId||'').trim();if(!sessionId)throw new Error('M26_SESSION_REUSE_ID_REQUIRED');const {clientId,state}=context();requireVisibleClient(clientId);const source=(state.collections.sessions||[]).find((item)=>String(item?.id||item?.body?.id||'')===sessionId&&String(item?.clientId||item?.client_id||item?.body?.clientId||item?.body?.client_id||'')===clientId);if(!source)throw new Error('M26_SESSION_REUSE_NOT_VISIBLE');emit(root,'m26:open-session-builder',{clientId,sourceSession:source});status(root,'session','Sesión cargada como borrador independiente. La original no se modifica.','success');}  function openBuilder(button){requireCoach();const {clientId:activeClientId}=context();const requested=String(button?.dataset?.clientId||activeClientId||'').trim();const clientId=requireVisibleClient(requested);emit(root,'m26:open-session-builder',{clientId});status(root,'session','Constructor abierto.','success');}
  async function startSession(button){
    const {clientId,state,role}=context();
    requireVisibleClient(clientId);
    requireActiveTrainingService(clientId);
    const requestedId=String(button?.dataset?.entityId||'');
    const eligible=(state.collections.sessions||[])
      .filter((item)=>(item.clientId||item.client_id||item.body?.clientId||item.body?.client_id)===clientId&&PUBLISHED_SESSION_STATES.has(normalizedStatus(item)))
      .sort((a,b)=>Number(b.revision||b.body?.revision||0)-Number(a.revision||a.body?.revision||0));
    const candidate=requestedId?eligible.find((item)=>String(item.id||item.body?.id||'')===requestedId):null;
    // Do not pick the newest supervised session merely because it was published last.
    const session=requestedId?candidate:eligible.find((item)=>actorCanExecuteSession({role,session:item})&&sessionHasExecutableBlocks(item));
    if(!session)throw new Error('M26_SESSION_PUBLISHED_REQUIRED');
    const resumeExisting=['client','cliente'].includes(String(role||'').toLowerCase())&&
      normalizedStatus(session)==='en_curso'&&
      actorCanExecuteSession({role,session})&&sessionHasExecutableBlocks(session);
    if(!sessionReadyToStart(session)&&!resumeExisting){
      const error=new Error('M38_SESSION_NOT_YET_AVAILABLE');
      error.userMessage=normalizedStatus(session)==='en_curso'
        ?'Esta sesión ya está iniciada. Recupera el entrenamiento activo en lugar de empezar otro.'
        :'Esta sesión se puede consultar, pero todavía no está habilitada para comenzar. Tu Coach puede revisar su disponibilidad.';
      throw error;
    }
    if(!actorCanExecuteSession({role,session})){
      const error=new Error('M26_SESSION_EXECUTION_FORBIDDEN');
      error.userMessage='Esta sesión la dirige tu Coach. Consulta la información de la sesión, pero no puedes iniciarla desde Cliente.';
      throw error;
    }
    if(!sessionHasExecutableBlocks(session)){
      const error=new Error('M26_SESSION_BLOCKS_NOT_EXECUTABLE');
      error.userMessage='Esta sesión no tiene ejercicios ejecutables. Pide a tu Coach que revise su publicación.';
      throw error;
    }
    const request={clientId,session,completion:null};
    status(root,'session',resumeExisting?'Recuperando tu entrenamiento en curso…':
      role==='client'?'Preparando tu sesión guiada…':'Preparando sesión…','pending');
    emit(root,'m26:start-session',request);
    // Event dispatch alone is not a successful workspace handoff. If the
    // controller was not mounted (or a stale shell lost its listener), a
    // missing async acknowledgement must fail closed, never paint success.
    if(!request.completion||typeof request.completion.then!=='function')
      throw new Error('M42_SESSION_ENTRY_HANDLER_MISSING');
    const opened=await request.completion;
    if(opened!==true)throw new Error('M42_SESSION_WORKSPACE_UNAVAILABLE');
    // Do not call a queued or merely published session "started".
    status(root,'session',resumeExisting?
      'Entrenamiento recuperado del servidor. Continúa donde lo dejaste.':
      'Sesión abierta. Confirma Inicio para comenzar el entrenamiento.','success');
  }
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
    const evidence=proposal.rationale?.contextEvidence||{};
    const contextBits=[];
    if(Number.isFinite(Number(evidence.adherence)))contextBits.push(`Adherencia ${Math.round(Number(evidence.adherence)*100)}%`);
    if(Number.isFinite(Number(evidence.averageRpe)))contextBits.push(`RPE medio ${Math.round(Number(evidence.averageRpe)*10)/10}`);
    if(Number(evidence.historyExerciseCount||0)>0)contextBits.push(`${Number(evidence.historyExerciseCount)} ejercicios con historial`);
    if(evidence.iriAvailable)contextBits.push('IRI disponible');
    const contextLabel=contextBits.length?contextBits.join(' · '):'Contexto histórico limitado: revisar manualmente.';
    const preview=root.querySelector?.('[data-intelligence-preview]');
    if(preview)preview.innerHTML=`${coachQuestion?`<section class="m26-intelligence-brief"><p class="m26-eyebrow">Criterio del entrenador</p><p>${escape(coachQuestion)}</p></section>`:''}${contextWarnings.length?`<section class="m26-notice is-warning"><strong>Contexto incompleto</strong><p>${escape(contextWarnings.join(' '))}</p></section>`:''}<section class="m26-notice is-${proposal.requiresManualReview?'warning':'success'}"><strong>${escape(proposal.exercises.length)} ejercicios propuestos</strong><p>${escape(proposal.estimatedMinutes)} min · ${escape(proposal.structure.type)} · revisión del entrenador obligatoria.</p></section><div class="m26-stack">${proposal.exercises.map((item)=>`<article class="m26-list-card"><div><h3>${escape(exerciseDisplayName(catalog.get(item.exerciseId)||item))}</h3><p>${escape(item.sets)} series · ${escape(item.reps)} · RPE ${escape(item.targetRpe)}${item.previousLoad!==null&&item.previousLoad!==undefined?` · última carga ${escape(item.previousLoad)} kg`:''}</p><small>${escape(item.loadInstruction||'Carga a revisar por el entrenador')}</small></div></article>`).join('')}</div>`;
    status(root,'intelligence',proposal.requiresManualReview||contextWarnings.length?'Propuesta conservadora: requiere revisión manual.':'Propuesta lista para revisión.',proposal.requiresManualReview||contextWarnings.length?'pending':'success');
    emit(root,'m26:intelligence-proposal',{proposal});
    return proposal;
  }
  function publicationScope(entity){return entity==='planning'?'planning':entity==='report'?'report':'session';}
  function publicationMessage(action){return ({approve:'Contenido aprobado y pendiente de publicación.',publish:'Contenido publicado para el cliente.',withdraw:'Contenido retirado de la vista del cliente.',archive:'Plan archivado.',reopen:'Plan reabierto como borrador.'})[action]||'Cambio confirmado.';}
  function findPublicationRecord(entity,entityId){const config=publicationConfig(entity);if(!config)throw new Error('M26_PUBLICATION_ENTITY_INVALID');const {state}=context();const record=(state.collections?.[config.collection]||[]).find((item)=>String(item?.id||item?.body?.id||'')===String(entityId||''));if(!record)throw new Error('M26_PUBLICATION_RECORD_NOT_FOUND');const clientId=record.clientId||record.client_id||record.body?.clientId||record.body?.client_id;requireVisibleClient(clientId);return record;}
  async function managePublication(button){
    requireCoach();
    if(!isOnline())throw new Error('M26_OFFLINE_PUBLICATION_NOT_ALLOWED');
    const entity=String(button?.dataset?.publicationEntity||'');
    const action=String(button?.dataset?.publicationAction||'');
    const entityId=String(button?.dataset?.entityId||'');
    const card=button.closest?.('[data-publication-card]');
    const previewAccepted=Boolean(card?.querySelector?.('[data-publication-preview]')?.checked);
    const reason=String(card?.querySelector?.('[data-publication-reason]')?.value||'');
    const {role}=context();
    const record=findPublicationRecord(entity,entityId);
    const receiptKey=[entity,entityId,action,Number(record?.revision??record?.body?.revision??0)].join(':');
    if(confirmedPublicationReceipts.has(receiptKey)){
      status(root,publicationScope(entity),'El servidor ya confirmó este cambio. Actualiza la vista antes de volver a solicitarlo.','pending');
      return confirmedPublicationReceipts.get(receiptKey);
    }
    const command=buildPublicationCommand({entity,action,record,role,previewAccepted,reason});
    status(root,publicationScope(entity),'Confirmando el cambio con el servidor…','pending');
    const result=await commandBus.execute(command);
    if(result?.ok===true)confirmedPublicationReceipts.set(receiptKey,result);
    const feedback=mutationFeedback(result,{success:publicationMessage(action),subject:'Este contenido'});
    status(root,publicationScope(entity),feedback.message,feedback.kind);
    if(feedback.confirmed&&result.refreshOk!==false&&!result.refreshPending)onRender();
    return result;
  }
  // Drafts are keyed by stable report identity, not merely by the IRI assessment.
  // A client can prepare separate weekly, monthly and IRI-related documents.
  async function availableReportDrafts(clientId,assessmentId){
    if(!draftRepository?.list)return [];
    const records=await draftRepository.list(clientId);
    const found=new Map();
    for(const record of records){
      const draft=record?.value,id=String(draft?.id||'').trim();
      if(!id||String(draft?.clientId||'')!==String(clientId)||String(draft?.assessmentId||'')!==String(assessmentId||''))continue;
      let scoped;
      try{scoped=reportDraftScope(id);}catch{continue;}
      if(record.scope!==scoped&&!(assessmentId&&record.scope===legacyReportDraftScope(assessmentId)))continue;
      const existing=found.get(id);
      if(!existing||record.scope===scoped&&existing.scope!==scoped)found.set(id,record);
    }
    return [...found.values()].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  }
  async function updateReportDraftChoices(form,{restoreSingle=false}={}){
    const picker=form?.querySelector?.('[data-report-draft-choice]');
    if(!picker)return;
    const {clientId}=context(),assessmentId=String(form.elements?.namedItem?.('assessmentId')?.value||'').trim();
    if(!clientId)return;
    const candidates=await availableReportDrafts(clientId,assessmentId);
    if(!root.contains?.(form)||context().clientId!==clientId)return;
    const current=String(form.elements?.namedItem?.('entityId')?.value||'').trim();
    const document=form.ownerDocument;
    picker.replaceChildren();
    const empty=document.createElement('option');empty.value='';empty.textContent='Preparar un informe nuevo';picker.append(empty);
    for(const record of candidates){
      const draft=record.value;
      const option=document.createElement('option');option.value=String(draft.id);
      option.textContent=[String(draft.title||'Informe sin título').slice(0,72),[draft.periodStart,draft.periodEnd].filter(Boolean).join(' → ')].filter(Boolean).join(' · ');
      picker.append(option);
    }
    picker.value=candidates.some(record=>String(record.value?.id)===current)?current:'';
    if(!restoreSingle)return;
    if(candidates.length===1){
      const selected=candidates[0];
      if(editedReportForms.has(form)||String(form.elements?.namedItem?.('entityId')?.value||'').trim())return;
      const saved=await restoreReportDraft(draftRepository,clientId,assessmentId,selected.value.id);
      if(!saved?.value||context().clientId!==clientId||!root.contains?.(form))return;
      populateForm(form,{...saved.value,reviewAccepted:saved.value.reviewAccepted===true});
      picker.value=String(saved.value.id);
      syncGuidedWorkflowProgress(form);
      status(root,'report','Borrador de informe recuperado desde este dispositivo.','success');
    }else if(candidates.length>1){
      status(root,'report','Tienes varios borradores guardados. Selecciona el que quieras continuar o prepara un informe nuevo.','info');
    }
  }
  function onBeforeReportSwitch(event){
    const form=root.querySelector?.('[data-workflow-form="report-approval"]');
    if(!form||!event?.detail)return;
    clearTimeout(reportSaveTimer);reportSaveTimer=null;
    if(!editedReportForms.has(form)){event.detail.wait=reportDraftChain;return;}
    event.detail.wait=saveReportDraft(form,{silent:true}).then(()=>{
      editedReportForms.delete(form);
    });
  }
  async function selectReportDraft(form,selectedId){
    const {clientId}=context();
    requireVisibleClient(clientId);
    if(reportFormClientIds.get(form)!==clientId)return;
    clearTimeout(reportSaveTimer);reportSaveTimer=null;
    await reportDraftChain;
    // Flush the previous edited document before changing its identity.
    if(editedReportForms.has(form)){
      await saveReportDraft(form,{silent:true});
      editedReportForms.delete(form);
    }
    if(!root.contains?.(form)||context().clientId!==clientId)return;
    if(!selectedId){
      form.reset();
      const entity=form.elements?.namedItem?.('entityId');if(entity)entity.value='';
      syncGuidedWorkflowProgress(form);
      status(root,'report','Nuevo informe preparado. Los borradores anteriores se conservan.','info');
      await updateReportDraftChoices(form);
      return;
    }
    const assessmentId=String(form.elements?.namedItem?.('assessmentId')?.value||'').trim();
    const saved=await restoreReportDraft(draftRepository,clientId,assessmentId,selectedId);
    if(!saved?.value||!root.contains?.(form)||context().clientId!==clientId){
      status(root,'report','Este borrador no está disponible. No se modificó ningún otro informe.','error');
      return;
    }
    populateForm(form,{...saved.value,reviewAccepted:saved.value.reviewAccepted===true});
    syncGuidedWorkflowProgress(form);
    status(root,'report','Borrador seleccionado y recuperado.','success');
    await updateReportDraftChoices(form);
  }
  async function saveReportDraft(form,{silent=false}={}){
    requireCoach();
    if(!form)throw new Error('M26_REPORT_FORM_REQUIRED');
    if(!draftRepository?.save)throw new Error('M26_REPORT_DRAFT_STORAGE_UNAVAILABLE');
    const {clientId}=context();
    requireVisibleClient(clientId);
    if(reportFormClientIds.has(form)&&reportFormClientIds.get(form)!==clientId)throw new Error('M26_REPORT_DRAFT_CLIENT_CONTEXT_CHANGED');
    const raw=values(form);
    const assessmentId=String(raw.assessmentId||'').trim();
    const type=String(raw.reportType||'');
    if(!assessmentId&&!['post-session','weekly','monthly','quarterly','year-in-iberfit'].includes(type))throw new Error('M26_REPORT_ASSESSMENT_REQUIRED');
    const stableId=String(raw.entityId||'').trim()||createM26Id();
    const scoped=reportDraftScope(stableId);
    const idField=form.elements?.namedItem?.('entityId');
    if(idField)idField.value=stableId;
    const payload={...raw,id:stableId,entityId:stableId,clientId,assessmentId:assessmentId||null,
      reviewAccepted:raw.reviewAccepted==='on'};
    const write=reportDraftChain.then(()=>draftRepository.save(clientId,scoped,payload));
    reportDraftChain=write.catch(()=>{});
    await write;
    if(!silent)status(root,'report','Borrador del informe guardado en este dispositivo. Puedes completarlo después.','success');
    try{await updateReportDraftChoices(form);}catch(error){emit(root,'m26:workflow-warning',{action:'report-draft-selector',code:String(error?.message||error)});}
    return payload;
  }
  function queueReportSave(form){
    clearTimeout(reportSaveTimer);
    reportSaveTimer=setTimeout(()=>{
      reportSaveTimer=null;
      if(!root.contains?.(form)||reportFormClientIds.get(form)!==context().clientId)return;
      void saveReportDraft(form,{silent:true}).catch(error=>{
      status(root,'report','No fue posible guardar el borrador en este dispositivo. Conserva esta pantalla y revisa el almacenamiento.','error');
      emit(root,'m26:workflow-error',{action:'autosave-report-draft',code:String(error?.message||error)});
    });},650);
  }
  async function initializeReportForm(form){
    if(!form||initializedReportForms.has(form))return;
    initializedReportForms.add(form);
    const {clientId}=context();
    reportFormClientIds.set(form,clientId);
    const assessmentId=String(form.elements?.namedItem?.('assessmentId')?.value||'').trim();
    if(!clientId||!draftRepository?.load)return;
    try{
      await updateReportDraftChoices(form,{restoreSingle:true});
    }catch(error){
      status(root,'report','No fue posible recuperar los borradores. Ningún dato ha sido borrado.','error');
      emit(root,'m26:workflow-error',{action:'load-report-draft',code:String(error?.message||error)});
    }
  }

  async function approveReport(){
    requireCoach();
    clearTimeout(reportSaveTimer);reportSaveTimer=null;
    await reportDraftChain;
    if(!isOnline())throw new Error('M26_OFFLINE_PUBLICATION_NOT_ALLOWED');
    const form=root.querySelector?.('[data-workflow-form="report-approval"]');
    if(!form)throw new Error('M26_REPORT_FORM_REQUIRED');
    ensureValidForm(form);
    const raw=values(form),{clientId}=context();
    requireVisibleClient(clientId);
    const content={
      clientId,assessmentId:raw.assessmentId,title:raw.title,
      periodStart:raw.periodStart,periodEnd:raw.periodEnd,summary:raw.summary,
      conclusions:raw.conclusions,recommendations:raw.recommendations,
      reviewAccepted:raw.reviewAccepted==='on',
      ...(raw.reportType?{reportType:raw.reportType}:{}),
      ...(raw.coachComment?{coachComment:raw.coachComment}:{}),
    };
    const previous=reportSubmissionByClient.get(clientId);
    const fallbackId=String(raw.entityId||'').trim()||createM26Id();
    let savedReport=null;
    try{savedReport=await saveReportDraft(form,{silent:true});}
    catch(error){
      const idField=form.elements?.namedItem?.('entityId');
      if(idField)idField.value=fallbackId;
      emit(root,'m26:workflow-warning',{action:'approve-report',code:'M26_REPORT_LOCAL_DRAFT_SAVE_UNAVAILABLE'});
    }
    const stableId=String(raw.entityId||savedReport?.id||fallbackId).trim();
    // Materialize premium evidence before refresh/re-render can replace the editor.
    const prepared=buildApproveReportDraftCommand({id:stableId,...content},0);
    const fingerprint=JSON.stringify(prepared.payload.patch);
    const existing=previous?.id===stableId&&previous?.fingerprint===fingerprint?previous:null;
    if(existing?.result?.ok===true){
      status(root,'report','El servidor ya confirmó este informe. Consulta su versión antes de volver a aprobarlo.','pending');
      return existing.result;
    }
    // A fresh canonical snapshot is mandatory: a second tab/device may have
    // approved this ID since this editor was last rendered.
    try{
      await withTimeout(Promise.resolve(refreshState({reason:'report-approval-revision-preflight'})),15_000,'M43_REPORT_REMOTE_PREFLIGHT_TIMEOUT');
    }catch(error){
      status(root,'report','No pudimos comprobar la última revisión del informe. Conservamos el borrador; vuelve a intentarlo cuando se recupere la conexión.','error');
      throw new Error('M43_REPORT_REMOTE_PREFLIGHT_UNAVAILABLE',{cause:error});
    }
    if(context().clientId!==clientId)throw new Error('M26_REPORT_DRAFT_CLIENT_CONTEXT_CHANGED');
    const remote=reportApprovalDecision(store.getState().collections?.reports||[],clientId,prepared.payload.patch);
    if(remote.kind==='new-version-required'){
      status(root,'report','Este informe ya está aprobado con otro contenido. Tu borrador permanece guardado; crea una nueva versión independiente para no sobrescribir la publicada.','error');
      throw new Error('M43_REPORT_NEW_VERSION_REQUIRED');
    }
    if(remote.kind==='already-approved'){
      status(root,'report','Este informe ya estaba aprobado en el servidor. No se envió otra aprobación.','success');
      return {ok:true,kind:'already-confirmed',refreshOk:true};
    }
    let baseRevision=remote.baseRevision;
    if(remote.kind==='create'){
      const type=String(prepared.payload.patch.reportType||'');
      if(!['post-session','weekly','monthly','quarterly','year-in-iberfit'].includes(type)){
        status(root,'report','Este formato requiere un documento previo confirmado o un circuito específico. No se ha enviado la aprobación.','error');
        throw new Error('M44_REPORT_CREATION_TYPE_NOT_SUPPORTED');
      }
      if(typeof createReportDraft!=='function'){
        status(root,'report','La creación segura de informes todavía no está disponible. Borrador conservado.','pending');
        throw new Error('M44_REPORT_CREATE_BACKEND_NOT_READY');
      }
      status(root,'report','Creando documento privado y verificando las evidencias en el servidor…','pending');
      // The server creates only a private draft with revision 1. It rejects
      // stale activity, wrong client, duplicated ID and unconfirmed workouts.
      let created=null;
      try{
        created=await withTimeout(Promise.resolve(createReportDraft({
          clientId,reportId:stableId,draft:prepared.payload.patch,
        })),20_000,'M44_REPORT_CREATE_TIMEOUT');
      }catch(error){
        if(/M44_PRIVILEGED_ASSURANCE_REQUIRED|M44_PRIVILEGED_ROLE_REQUIRED/.test(String(error?.message||error||''))){
          status(root,'report',friendlyError(error),'error');
          throw new Error('M44_PRIVILEGED_ASSURANCE_REQUIRED',{cause:error});
        }
        status(root,'report','No se confirmó la creación privada. El borrador permanece guardado: puedes reintentar tras comprobar la conexión.','error');
        throw new Error('M44_REPORT_CREATE_UNCONFIRMED',{cause:error});
      }
      if(created?.ok!==true||Number(created.remoteRevision)!==1)
        throw new Error('M44_REPORT_CREATE_NOT_CONFIRMED');
      baseRevision=1;
    }
    reportSubmissionByClient.set(clientId,{id:stableId,fingerprint,result:null});
    const command={...prepared,baseRevision};
    const result=await commandBus.execute(command);
    if(result?.ok===true)reportSubmissionByClient.set(clientId,{id:stableId,fingerprint,result});
    const feedback=mutationFeedback(result,{success:'Informe aprobado y listo para publicación.',subject:'El informe'});
    status(root,'report',feedback.message,feedback.kind);
    if(!feedback.confirmed)return result;
    let confirmed=null;
    try{confirmed=await refreshAndFind('reports',stableId,clientId,{attempts:2});}
    catch(error){emit(root,'m26:workflow-warning',{action:'approve-report',code:'M43_REPORT_ACK_REFRESH_PENDING'});}
    if(!confirmed||!['aprobado','approved','publicado','published'].includes(normalizedStatus(confirmed))){
      status(root,'report','El servidor confirmó el informe, pero aún no vemos su revisión. Conservamos el borrador y no enviaremos otra aprobación a ciegas.','pending');
      return {...result,refreshPending:true};
    }
    let cleanupOk=true;
    try{await draftRepository?.remove?.(clientId,reportDraftScope(stableId));}
    catch(error){
      cleanupOk=false;
      emit(root,'m26:workflow-warning',{action:'approve-report',code:'M26_REPORT_DRAFT_CLEANUP_PENDING'});
    }
    if(cleanupOk){
      reportSubmissionByClient.delete(clientId);
      form.reset();
      onRender();
    }else{
      status(root,'report','Informe aprobado y confirmado. Conservamos el borrador local porque su limpieza está pendiente.','pending');
    }
    return cleanupOk?result:{...result,refreshPending:true,localDraftOk:false};
  }

  function issuedHistoryHost(button){
    return button?.closest?.('[data-m44-pdf-card]')?.querySelector?.('[data-m44-pdf-history]')||null;
  }
  async function showIssuedEvolutionHistory(button){
    if(!isOnline())throw new Error('M44_PDF_OFFLINE_UNAVAILABLE');
    const host=issuedHistoryHost(button);
    if(!host||typeof getEvolutionPdfHistory!=='function')throw new Error('M44_PDF_HISTORY_UNAVAILABLE');
    const {clientId,role,state}=context(),id=String(button?.dataset?.entityId||'');
    const scope=evolutionPdfActionScope({state,role,clientId,reportId:id,action:'history'});
    if(!scope.allowed)throw new Error(scope.code);
    host.textContent='Consultando las versiones emitidas...';
    try{
      const history=await getEvolutionPdfHistory(id);
      const document=host.ownerDocument||globalThis.document;
      host.replaceChildren();
      if(!history.items.length){
        const empty=document.createElement('p');
        empty.className='m26-field-help';
        empty.textContent='Todavía no hay ningún PDF oficial emitido para este informe.';
        host.append(empty);return history;
      }
      const title=document.createElement('p');
      title.className='m26-eyebrow';
      title.textContent=history.items.length===1?'1 versión documentada':history.items.length+' versiones documentadas';
      host.append(title);
      for(const item of history.items){
        const line=document.createElement('div');
        line.className='m26-inline-actions m44-pdf-version';
        line.dataset.m44VersionRow='true';
        const caption=document.createElement('span');
        const date=item.issuedAt?new Date(item.issuedAt):null;
        const readable=date&&!Number.isNaN(date.getTime())?date.toLocaleDateString('es-CL'):'fecha no disponible';
        caption.textContent='Versión '+item.version+' · '+readable+(item.withdrawn?' · Retirada':' · Disponible');
        line.append(caption);
        if(item.withdrawn){
          if(history.manager&&item.withdrawnReason){
            const reason=document.createElement('small');
            reason.textContent='Motivo: '+item.withdrawnReason;
            line.append(reason);
          }
        }else{
          const open=document.createElement('button');
          open.type='button';open.dataset.workflowAction='open-issued-evolution-pdf';
          open.dataset.entityId=id;open.dataset.issuanceId=item.issuanceId;
          open.textContent='Abrir PDF';line.append(open);
          if(history.manager){
            const label=document.createElement('label');
            label.textContent='Motivo de retirada';
            const input=document.createElement('input');
            input.type='text';input.required=true;input.minLength=3;input.maxLength=500;
            input.placeholder='Indica por qué se retira esta versión';
            input.dataset.m44WithdrawReason='true';label.append(input);line.append(label);
            const withdraw=document.createElement('button');
            withdraw.type='button';withdraw.dataset.workflowAction='withdraw-issued-evolution-pdf';
            withdraw.dataset.entityId=id;withdraw.dataset.issuanceId=item.issuanceId;
            withdraw.textContent='Retirar esta versión';line.append(withdraw);
          }
        }
        host.append(line);
      }
      return history;
    }catch(error){
      host.textContent='No se pudo consultar el historial. Pulsa «Consultar versiones PDF» para volver a intentarlo.';
      throw error;
    }
  }
  async function withdrawIssuedEvolutionPdf(button){
    requireCoach();
    if(!isOnline())throw new Error('M44_PDF_OFFLINE_UNAVAILABLE');
    if(typeof withdrawEvolutionPdf!=='function')throw new Error('M44_PDF_WITHDRAW_UNAVAILABLE');
    const row=button?.closest?.('[data-m44-version-row]');
    const reason=String(row?.querySelector?.('[data-m44-withdraw-reason]')?.value||'').trim();
    if(reason.length<3||reason.length>500)throw new Error('M44_PDF_WITHDRAW_REASON_REQUIRED');
    const id=String(button?.dataset?.issuanceId||'');
    await withdrawEvolutionPdf(id,reason);
    const host=issuedHistoryHost(button);
    if(host){
      const container=host.closest('[data-m44-pdf-card]');
      const refresh=container?.querySelector('[data-workflow-action="show-issued-evolution-history"]');
      if(refresh)await showIssuedEvolutionHistory(refresh).catch(()=>{});
    }
    status(root,'report','Versión retirada con trazabilidad. No se permiten nuevas descargas; las copias previamente guardadas por una persona no pueden recuperarse a distancia.','success');
  }

  async function handleIssuedEvolutionPdf(button,{issue=false}={}){
    if(!isOnline())throw new Error('M44_PDF_OFFLINE_UNAVAILABLE');
    const {role,clientId,state}=context();
    const id=String(button?.dataset?.entityId||'').trim();
    const scope=evolutionPdfActionScope({state,role,clientId,reportId:id,action:issue?'issue':'open'});
    if(!scope.allowed)throw new Error(scope.code);
    if(issue){
      requireCoach();
      requireVisibleClient(clientId);
      if(typeof issueEvolutionReport!=='function')throw new Error('M44_PDF_EMISSION_NOT_AVAILABLE');
    }else if(typeof getLatestEvolutionPdf!=='function'&&typeof openEvolutionPdfById!=='function'){
      throw new Error('M44_PDF_READER_NOT_AVAILABLE');
    }
    // Open synchronously from the user gesture; navigation follows authorization.
    const popup=globalThis.open?.('about:blank','_blank');
    if(!popup)throw new Error('M44_PDF_POPUP_BLOCKED');
    try{
      const issuanceId=String(button?.dataset?.issuanceId||'').trim();
      const result=issue?await issueEvolutionReport(id):
        issuanceId&&typeof openEvolutionPdfById==='function'?await openEvolutionPdfById(issuanceId):await getLatestEvolutionPdf(id);
      if(!result?.issuanceId||!result?.sha256||result.delivery!=='authenticated-pdf')
        throw new Error('M44_PDF_AUTHENTICATED_DELIVERY_REQUIRED');
      let pdf;
      try{
        if(typeof downloadEvolutionPdf!=='function')throw new Error('M44_PDF_READER_NOT_AVAILABLE');
        // An authorised check happens for each delivery, including after withdrawal.
        pdf=await downloadEvolutionPdf(result.issuanceId,result.sha256);
      }catch(error){
        if(issue)throw new Error('M44_PDF_ALREADY_ISSUED_OPEN_RETRY',{cause:error});
        throw error;
      }
      const objectUrl=globalThis.URL?.createObjectURL?.(pdf);
      if(!objectUrl)throw new Error('M44_PDF_BLOB_URL_UNAVAILABLE');
      try{popup.location.replace(objectUrl);}catch(error){
        globalThis.URL?.revokeObjectURL?.(objectUrl);
        throw error;
      }
      // In-memory viewer URL, never a bearer-independent Storage signed link.
      globalThis.setTimeout?.(()=>globalThis.URL?.revokeObjectURL?.(objectUrl),900000);
      status(root,'report',issue?'PDF oficial emitido y archivado · versión '+result.version:'PDF oficial abierto · versión '+result.version,'success');
      return result;
    }catch(error){
      try{popup.close?.();}catch{}
      throw error;
    }
  }

  function openPublishedEvolutionReport(button){
    const {clientId,state,role}=context();
    if(role!=='client'||!clientId)throw new Error('M44_PUBLISHED_REPORT_ROLE_DENIED');
    const id=String(button?.dataset?.entityId||'').trim();
    const record=(state.collections?.reports||[]).find(item=>{
      const body=item?.body||{};
      return String(item.id||body.id||'')===id&&
        String(item.clientId||item.client_id||body.clientId||body.client_id||'')===String(clientId);
    });
    if(!record)throw new Error('M44_PUBLISHED_REPORT_NOT_FOUND');
    const safeView=clientContentView('report',record);
    if(!safeView.reportDocument)throw new Error('M44_PUBLISHED_REPORT_NOT_AVAILABLE');
    const clientName=String(state.identity?.name||state.identity?.fullName||'Cliente IBERFIT');
    return openEvolutionReportPreview({
      report:safeView.reportDocument,clientName,coachName:'Equipo IBERFIT',
      publicationStatus:'published',
    });
  }

  async function executeWorkflowAction(action,button){
    const {clientId}=context();
    const key=action==='start-published-session'
      ?['m42-session-entry',clientId,String(button?.dataset?.entityId||'auto')].join(':')
      :publicationActionKey({action,entity:button?.dataset?.publicationEntity,
        entityId:button?.dataset?.entityId||button?.closest?.('form')?.elements?.namedItem?.('entityId')?.value,clientId});
    if(key&&inFlightMutations.has(key))return;
    if(key)inFlightMutations.add(key);
    const wasDisabled=Boolean(button?.disabled);if(button){button.disabled=true;button.setAttribute?.('aria-busy','true');}
    try{
      if(action==='create-client-draft')await createClient();else if(action==='complete-iri')await completeIri();else if(action==='save-iri-draft')await saveIriDraft();else if(action==='save-report-draft')await saveReportDraft(button?.closest?.('[data-workflow-form="report-approval"]'));else if(action==='iri-prev')await moveIri(-1);else if(action==='iri-next')await moveIri(1);else if(action==='generate-client-iri-report')await generateIriReport('client');else if(action==='generate-coach-iri-report')await generateIriReport('coach');else if(action==='issue-client-iri-report')await issueIriReportDocument('client');else if(action==='issue-coach-iri-report')await issueIriReportDocument('coach');else if(action==='refresh-issued-iri-history')await loadIriIssuedHistory();else if(action==='open-issued-iri-report')await openIriIssued(button);else if(action==='withdraw-issued-iri-report')await withdrawIriIssued(button);else if(action==='save-plan-draft')await savePlanDraft(button?.closest?.('[data-workflow-form="planning"]'));else if(action==='validate-plan')await validatePlan();else if(action==='create-appointment')await createAppointment();else if(action==='confirm-appointment')await confirmAppointment(button);else if(action==='reuse-session')reuseSession(button);else if(action==='open-session-builder')openBuilder(button);else if(action==='start-published-session')await startSession(button);else if(action==='generate-intelligence')generateIntelligence();else if(action==='manage-publication')await managePublication(button);else if(action==='approve-report')await approveReport();else if(action==='open-published-evolution-report')openPublishedEvolutionReport(button);else if(action==='issue-evolution-pdf')await handleIssuedEvolutionPdf(button,{issue:true});else if(action==='open-issued-evolution-pdf')await handleIssuedEvolutionPdf(button);else if(action==='show-issued-evolution-history')await showIssuedEvolutionHistory(button);else if(action==='withdraw-issued-evolution-pdf')await withdrawIssuedEvolutionPdf(button);else throw new Error('M26_WORKFLOW_ACTION_UNKNOWN');
    }catch(error){const isIriReport=['generate-client-iri-report','generate-coach-iri-report','issue-client-iri-report','issue-coach-iri-report','refresh-issued-iri-history','open-issued-iri-report','withdraw-issued-iri-report'].includes(action);const isEvolutionPdf=['issue-evolution-pdf','open-issued-evolution-pdf','show-issued-evolution-history','withdraw-issued-evolution-pdf'].includes(action);const scope=isEvolutionPdf?'report':isIriReport?iriReportStatusScope():action?.includes('iri')?'iri':action?.includes('client')?'client-onboarding':action?.includes('plan')?'planning':action?.includes('appointment')?'appointment':action?.includes('intelligence')?'intelligence':action?.includes('report')?'report':button?.dataset?.publicationEntity==='report'?'report':button?.dataset?.publicationEntity==='planning'?'planning':'session';status(root,scope,friendlyError(error),'error');
      // Some Client routes show a workout CTA without a session-status node.
      // Never let a failed workspace entry become an invisible no-op.
      if(action==='start-published-session'&&!root.querySelector?.('[data-workflow-status="session"]')){
        try{globalThis.dispatchEvent?.(new CustomEvent('m26:toast',{detail:{message:friendlyError(error)}}));}catch{}
      }
      emit(root,'m26:workflow-error',{action,code:String(error?.message||error)});}
    finally{
      if(key)inFlightMutations.delete(key);
      if(button){button.disabled=wasDisabled;button.removeAttribute?.('aria-busy');}
    }
  }
  async function onClick(event){
    // The IRI disclosure has its own direct handler. A document/root-level
    // delegated click races touch retargeting on 390 px Chromium; never toggle
    // it a second time here.
    if(event.target.closest?.('[data-iri-setup-toggle]'))return;
    const preset=event.target.closest?.('[data-iri-setup-preset]');
    if(preset){
      event.preventDefault?.();requireCoach();
      const form=preset.closest?.('[data-workflow-form="iri"]');
      if(applyIriSetupPreset(form,preset.getAttribute('data-iri-setup-preset'))){
        computed(form);queueIriSave();
        const notice=form.querySelector('[data-iri-preset-status]');
        if(notice)notice.textContent='Preparación aplicada. Ajusta la configuración al material real antes de medir.';
      }
      return;
    }
    const clearClients=event.target.closest?.('[data-client-clear]');if(clearClients){event.preventDefault?.();cancelScheduledClientListUpdate();const search=root.querySelector?.('[data-client-search]');if(search)search.value='';for(const node of root.querySelectorAll?.('[data-client-filter]')||[])node.value='';const sort=root.querySelector?.('[data-client-sort]');if(sort)sort.value='priority';updateClientList();return;}
    const clearLibrary=event.target.closest?.('[data-library-clear]');if(clearLibrary){event.preventDefault?.();const search=root.querySelector?.('[data-library-search]');if(search)search.value='';for(const node of root.querySelectorAll?.('[data-library-filter]')||[])node.value='';updateLibrary();return;}
    const registerProtocol=event.target.closest?.('[data-iri-register-target]');if(registerProtocol){event.preventDefault?.();const form=registerProtocol.closest?.('[data-workflow-form="iri"]');const target=form?.elements?.namedItem?.(registerProtocol.getAttribute?.('data-iri-register-target'));const card=registerProtocol.closest?.('[data-iri-protocol]');if(card)card.open=false;target?.scrollIntoView?.({block:'center',behavior:'smooth'});target?.focus?.();return;}
    const timerButton=event.target.closest?.('[data-iri-timer-action]');if(timerButton){event.preventDefault?.();const form=timerButton.closest?.('[data-workflow-form="iri"]');controlIriTimer(form,timerButton.getAttribute?.('data-iri-timer-action'));return;}
    const conflictButton=event.target.closest?.('[data-iri-remote-conflict-action]');if(conflictButton){event.preventDefault?.();const form=conflictButton.closest?.('[data-workflow-form="iri"]');await resolveIriRemoteConflict(form,conflictButton.getAttribute?.('data-iri-remote-conflict-action'));return;}
    const jump=event.target.closest?.('[data-iri-step-jump]');if(jump){event.preventDefault?.();await jumpIri(Number(jump.getAttribute?.('data-iri-step-jump')||0));return;}
    const button=event.target.closest?.('[data-workflow-action]');if(!button)return;
    const form=button.closest?.('form');
    // Saving an incomplete IRI is always allowed; HTML required attributes
    // must not silently prevent the draft click's submit event.
    if(form&&button.type==='submit'&&button.getAttribute('data-workflow-action')!=='save-iri-draft')return;
    event.preventDefault?.();await executeWorkflowAction(button.getAttribute('data-workflow-action'),button);
  }
  function onInvalid(event){
    const control=event?.target;
    const form=control?.closest?.('[data-workflow-form]');
    if(!form||control?.disabled||control?.willValidate===false)return;
    if(invalidFormControls(form)[0]!==control)return;
    event.preventDefault?.();
    const name=String(form.getAttribute?.('data-workflow-form')||'').trim();
    const scope=({planning:'planning',appointment:'appointment','report-approval':'report',iri:'iri','client-onboarding':'client-onboarding',intelligence:'intelligence'})[name]||name||'session';
    const invalid=invalidFormControls(form);
    const readable=[...new Set(invalid.map(item=>guidedFieldLabel(item)))].filter(Boolean);
    status(root,scope,readable.length
      ?'Revisa estos datos antes de confirmar: '+readable.join(', ')+'.'
      :'Revisa los datos señalados antes de confirmar.','error');
    for(const item of invalid)item.setAttribute?.('aria-invalid','true');
    focusInvalidControl(control);
  }
  async function onSubmit(event){const createForm=event.target.closest?.('[data-exercise-create-form]');if(createForm){event.preventDefault?.();await createLibraryExercise(createForm);return;}const renameForm=event.target.closest?.('[data-exercise-rename-form]');if(renameForm){event.preventDefault?.();await renameLibraryExercise(renameForm);return;}const measurementForm=event.target.closest?.('[data-exercise-measurement-form]');if(measurementForm){event.preventDefault?.();await updateLibraryMeasurementProfile(measurementForm);return;}const form=event.target.closest?.('[data-workflow-form]');if(!form)return;event.preventDefault?.();const button=event.submitter?.matches?.('[data-workflow-action]')?event.submitter:form.querySelector?.('[data-workflow-action][type="submit"]');if(!button)return;await executeWorkflowAction(button.getAttribute('data-workflow-action'),button);}
  function onInput(event){
    // The saved-draft selector is navigation, never a change to the active report.
    if(event.target.closest?.('[data-report-draft-choice]'))return;
    const guidedForm=event.target.closest?.('[data-guided-required-form]');if(guidedForm){clearControlValidation(event.target);syncGuidedWorkflowProgress(guidedForm);}
    const iriForm=event.target.closest?.('[data-workflow-form="iri"]');if(iriForm){
      try{computed(iriForm);}catch{}clearStatus(root,'iri');queueIriSave();return;
    }
    if(event.target.closest?.('[data-plan-draft-choice]'))return;
    const planForm=event.target.closest?.('[data-workflow-form="planning"]');if(planForm){editedPlanForms.add(planForm);clearControlValidation(event.target);clearStatus(root,'planning');queuePlanSave(planForm);return;}
    const reportForm=event.target.closest?.('[data-workflow-form="report-approval"]');if(reportForm){editedReportForms.add(reportForm);clearControlValidation(event.target);clearStatus(root,'report');queueReportSave(reportForm);return;}
    const onboardingForm=event.target.closest?.('[data-workflow-form="client-onboarding"]');if(onboardingForm){editedOnboardingForms.add(onboardingForm);clearControlValidation(event.target);clearStatus(root,'client-onboarding');queueOnboardingSave(onboardingForm);return;}
    const appointmentForm=event.target.closest?.('[data-workflow-form="appointment"]');if(appointmentForm){clearControlValidation(event.target);clearStatus(root,'appointment');syncAppointmentFormState(appointmentForm,root);syncGuidedWorkflowProgress(appointmentForm);return;}
    const clientSearch=event.target.closest?.('[data-client-search]');if(clientSearch){scheduleClientListUpdate(clientSearch.value);return;}
    const search=event.target.closest?.('[data-library-search]');if(search){updateLibrary();return;}
  }
  function onChange(event){const selectedPlan=event.target.closest?.('[data-plan-draft-choice]');if(selectedPlan){const form=selectedPlan.closest?.('[data-workflow-form="planning"]');if(form)void selectPlanDraft(form,selectedPlan.value).catch(error=>{status(root,'planning',friendlyError(error),'error');emit(root,'m26:workflow-error',{action:'select-plan-draft',code:String(error?.message||error)});});return;}const selectedDraft=event.target.closest?.('[data-report-draft-choice]');if(selectedDraft){const form=selectedDraft.closest?.('[data-workflow-form="report-approval"]');if(form)void selectReportDraft(form,selectedDraft.value).catch(error=>{status(root,'report',friendlyError(error),'error');emit(root,'m26:workflow-error',{action:'select-report-draft',code:String(error?.message||error)});});return;}const guidedForm=event.target.closest?.('[data-guided-required-form]');if(guidedForm){clearControlValidation(event.target);syncGuidedWorkflowProgress(guidedForm);}const planForm=event.target.closest?.('[data-workflow-form="planning"]');if(planForm){editedPlanForms.add(planForm);clearStatus(root,'planning');queuePlanSave(planForm);return;}const reportForm=event.target.closest?.('[data-workflow-form="report-approval"]');if(reportForm){editedReportForms.add(reportForm);clearStatus(root,'report');queueReportSave(reportForm);return;}const onboardingForm=event.target.closest?.('[data-workflow-form="client-onboarding"]');if(onboardingForm){editedOnboardingForms.add(onboardingForm);clearControlValidation(event.target);clearStatus(root,'client-onboarding');syncOnboardingFormState(onboardingForm);queueOnboardingSave(onboardingForm);return;}const appointmentForm=event.target.closest?.('[data-workflow-form="appointment"]');if(appointmentForm){clearControlValidation(event.target);clearStatus(root,'appointment');syncAppointmentFormState(appointmentForm,root);syncGuidedWorkflowProgress(appointmentForm);return;}const clientControl=event.target.closest?.('[data-client-filter],[data-client-sort]');if(clientControl){cancelScheduledClientListUpdate();updateClientList();return;}const filter=event.target.closest?.('[data-library-filter]');if(filter){updateLibrary();return;}const iriForm=event.target.closest?.('[data-workflow-form="iri"]');if(!iriForm)return;try{computed(iriForm);}catch{}queueIriSave();}

  async function flushLocalDrafts(){
    clearTimeout(iriSaveTimer);
    clearTimeout(iriRemoteSaveTimer);
    clearTimeout(onboardingSaveTimer);
    clearTimeout(reportSaveTimer);
    clearTimeout(planSaveTimer);
    const tasks=[];
    const onboardingForm=root.querySelector?.('[data-workflow-form="client-onboarding"]');
    if(onboardingForm)tasks.push(Promise.resolve(saveOnboardingDraft(onboardingForm)).catch((error)=>{emit(root,'m26:workflow-error',{action:'flush-onboarding-draft-local',code:String(error?.message||error||'M26_ONBOARDING_LOCAL_DRAFT_FLUSH_FAILED')});return null;}));
    const iriForm=root.querySelector?.('[data-workflow-form="iri"]');
    if(iriForm)tasks.push(Promise.resolve(saveIriDraft({silent:true,syncRemote:false})).catch((error)=>{emit(root,'m26:workflow-error',{action:'flush-iri-draft-local',code:String(error?.message||error||'M26_IRI_LOCAL_DRAFT_FLUSH_FAILED')});return null;}));
    const reportForm=root.querySelector?.('[data-workflow-form="report-approval"]');
    if(reportForm)tasks.push(Promise.resolve(saveReportDraft(reportForm,{silent:true})).catch((error)=>{emit(root,'m26:workflow-error',{action:'flush-report-draft',code:String(error?.message||error)});return null;}));
    const planForm=root.querySelector?.('[data-workflow-form="planning"]');
    if(planForm&&editedPlanForms.has(planForm))tasks.push(Promise.resolve(savePlanDraft(planForm,{silent:true})).catch((error)=>{emit(root,'m26:workflow-error',{action:'flush-plan-draft',code:String(error?.message||error)});return null;}));
    await Promise.allSettled(tasks);
    return true;
  }
  function onPageHide(){void flushLocalDrafts();}
  return Object.freeze({
    mount(){if(mounted)return;root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);root.addEventListener('invalid',onInvalid,true);root.addEventListener('input',onInput);root.addEventListener('change',onChange);root.addEventListener('m26:report-before-switch',onBeforeReportSwitch);globalThis.addEventListener?.('pagehide',onPageHide);if(typeof MutationObserver==='function'){observer=new MutationObserver(()=>queueScan());observer.observe(root,{childList:true,subtree:true});}queueScan();mounted=true;},
    flushLocalDrafts,
    destroy(){if(!mounted)return;clearTimeout(iriSaveTimer);clearTimeout(iriRemoteSaveTimer);clearTimeout(onboardingSaveTimer);clearTimeout(reportSaveTimer);clearTimeout(planSaveTimer);cancelScheduledClientListUpdate();stopIriTimer();observer?.disconnect?.();observer=null;root.removeEventListener('click',onClick);root.removeEventListener('submit',onSubmit);root.removeEventListener('invalid',onInvalid,true);root.removeEventListener('input',onInput);root.removeEventListener('change',onChange);root.removeEventListener('m26:report-before-switch',onBeforeReportSwitch);globalThis.removeEventListener?.('pagehide',onPageHide);for(const button of boundIriSetupToggles){button.removeEventListener('click',onIriSetupToggle);button.removeAttribute('data-iri-setup-ready');if(button.isConnected){button.disabled=true;button.setAttribute('aria-disabled','true');}}boundIriSetupToggles.clear();clearAllStatuses(root);mounted=false;},
  });
}
