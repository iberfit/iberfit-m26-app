import {castilianStatusLabel} from '../ui/castellano.js';
import {resolveM26Runtime,createM26Transport} from '../supabase-transport.js';
import {createCanonicalStore} from '../canonical-store.js';
import {createCommandBus} from '../command-bus.js';
import {validatedRuntimeRegistry,M26_COMMAND_REGISTRY} from '../command-catalog.js';
import {createKeyValueOperationRepository} from '../platform/offline-command-repository.js';
import {createEngagementDraftRepository} from '../engagement/activity-drafts.js';
import {createEngagementCommandService} from '../engagement/command-service.js';
import {createEngagementController} from '../engagement/engagement-controller.js';
import {createWearableController} from '../wearables/controller.js';
import {createVerificationController,refreshVerificationState} from '../engagement/conflict-center.js';
import {createShellController} from '../shell/shell-controller.js';
import {createRouteViewModel} from '../modules/route-view-model.js';
import {renderRouteView} from '../modules/route-render.js';
import {createWorkflowController} from './workflow-controller.js';
import {createSessionVault,sessionExpiresSoon} from './session-vault.js';
import {renderAccessUi} from './access-ui.js';
import {inspectPasswordRecoveryHash,recoveryUrlWithoutFragment} from './password-recovery.js';
import {loadExerciseCatalog} from '../exercises/catalog.js';
import {createSessionDraft} from '../workflows/session-builder.js';
import {createExecution} from '../workflows/session-execution.js';
import {renderSessionBuilder,renderGuidedExecution} from '../workflows/session-ui.js';
import {createSessionController} from '../workflows/session-controller.js';
import {createActionState} from '../ui/action-state.js';
import {createExecutionRecoveryStore,createExecutionRecoveryCoordinator} from '../workflows/session-recovery.js';
import {registerM26ServiceWorker,createConnectivitySync} from '../platform/pwa.js';
import {loadExerciseMediaMap} from '../library/exercise-media.js';

const SESSION_DRAFT_SCOPE='session-builder';
function escapeText(value){return String(value??'').replace(/[&<>"']/g,'');}
function normalizePublishedSession(record){
  const body=record?.body&&typeof record.body==='object'?record.body:record;
  const blocks=Array.isArray(body?.blocks)?structuredClone(body.blocks):[];
  return {id:record?.id||body?.id,clientId:record?.clientId||record?.client_id||body?.clientId||body?.client_id,title:body?.title||body?.name||'Sesión IBERFIT',durationMinutes:Number(body?.durationMinutes||body?.duration_minutes||50),status:body?.status||record?.status||'published',blocks,revision:Number(record?.revision||body?.revision||0),createdAt:record?.createdAt||record?.created_at||body?.createdAt||body?.created_at||null};
}
function nextExpiry(session){return sessionExpiresSoon(session);}
function safeTime(value){const time=value?new Date(value).getTime():NaN;return Number.isFinite(time)?time:null;}
const PUBLISHED_SESSION_STATES=new Set(['published','publicado','active','activo','enabled','habilitado']);
const CONFIRMED_APPOINTMENT_STATES=new Set(['confirmed','confirmado','scheduled','agendado']);
const APPOINTMENT_EARLY_WINDOW_MS=6*60*60*1000;
const APPOINTMENT_LATE_WINDOW_MS=24*60*60*1000;
function publishedSessionForClient(records=[],clientId){return records.map(normalizePublishedSession).filter((item)=>item.id&&item.clientId===clientId&&item.blocks.length&&PUBLISHED_SESSION_STATES.has(String(item.status||'').trim().toLowerCase())).sort((a,b)=>Number(b.revision||0)-Number(a.revision||0)||(safeTime(b.createdAt)||0)-(safeTime(a.createdAt)||0))[0]||null;}
function confirmedAppointmentForSession(records=[],session,now=Date.now(),{earlyWindowMs=APPOINTMENT_EARLY_WINDOW_MS,lateWindowMs=APPOINTMENT_LATE_WINDOW_MS}={}){
  const at=Number(now);if(!Number.isFinite(at)||!session?.id||!session?.clientId)return null;
  const lower=at-Math.max(0,Number(earlyWindowMs)||0),upper=at+Math.max(0,Number(lateWindowMs)||0);
  const inWindow=(item)=>{const start=safeTime(item.startAt||item.start_at||item.scheduledAt||item.scheduled_at||item.date);const end=safeTime(item.endAt||item.end_at);if(start===null)return false;return (end??start)>=lower&&start<=upper;};
  const matching=records.filter((item)=>(item.clientId||item.client_id)===session.clientId&&CONFIRMED_APPOINTMENT_STATES.has(String(item.status||item.estado||'').trim().toLowerCase())&&inWindow(item));
  const linked=matching.filter((item)=>String(item.sessionId||item.session_id||'')===String(session.id));
  const candidates=linked.length?linked:matching.filter((item)=>!String(item.sessionId||item.session_id||''));
  return candidates.sort((a,b)=>(safeTime(a.startAt||a.start_at||a.scheduledAt||a.scheduled_at||a.date)||Number.MAX_SAFE_INTEGER)-(safeTime(b.startAt||b.start_at||b.scheduledAt||b.scheduled_at||b.date)||Number.MAX_SAFE_INTEGER))[0]||null;
}
function friendlyError(error){
  const code=String(error?.message||error||'');
  if(/AUTH|SESSION_EXPIRED|401|403/.test(code))return 'La sesión perdió autorización. Vuelve a entrar.';
  if(/TIMEOUT|NETWORK|FETCH/.test(code))return 'No fue posible conectar. Comprueba tu conexión a internet e inténtalo de nuevo.';
  if(/QA_ACCOUNT_REQUIRED/.test(code))return 'Esta cuenta no está autorizada para este acceso.';
  return 'No fue posible completar la operación. Tu información local permanece protegida.';
}

const RECOVERY_REQUEST_CONFIRMATION='Si el correo corresponde a una cuenta QA autorizada, recibirás un enlace para crear una contraseña nueva.';
const RECOVERY_LINK_INVALID='El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.';
function recoveryNetworkError(error){
  const code=String(error?.message||error||'');
  if(error?.status===0||/TIMEOUT|NETWORK|FETCH|Failed to fetch/i.test(code))return 'No fue posible conectar. Comprueba tu conexión a internet e inténtalo de nuevo.';
  return 'No fue posible enviar el enlace en este momento. Inténtalo de nuevo más tarde.';
}
function recoveryPasswordError(error){
  const code=String(error?.message||error||'');
  if(/AUTH_PASSWORD_INVALID/.test(code))return 'La contraseña debe tener entre 8 y 1024 caracteres.';
  if(error?.status===0||/TIMEOUT|NETWORK|FETCH|Failed to fetch/i.test(code))return 'No fue posible conectar. La contraseña no se ha modificado; inténtalo de nuevo.';
  return RECOVERY_LINK_INVALID;
}
function invalidRecoverySession(error){
  const code=String(error?.message||error||'');
  return error?.status===401||error?.status===403||/RECOVERY_(?:TOKEN|SESSION|USER|UPDATE|IDENTITY)|QA_ACCOUNT_REQUIRED|JWT|expired/i.test(code);
}

export async function createM26Application({root=document.querySelector('#app'),runtimeConfig=globalThis.__IBERFIT_M26_RUNTIME__||{},locationLike=globalThis.location,historyLike=globalThis.history}={}){
  if(!root)throw new Error('M26_APP_ROOT_REQUIRED');
  const runtime=resolveM26Runtime(runtimeConfig,locationLike);const vault=createSessionVault();
  let transport=null,session=null,store=createCanonicalStore(),catalog=null,mediaMap=null,shell=null,workflow=null,engagement=null,wearables=null,verification=null,sessionController=null,operationRepository=null,draftRepository=null,commandBus=null,recoveryCoordinator=null,connectivityStop=null,sessionUi=null,authMode='login',recoverySession=null,loginBusy=false,refreshInFlight=null;

  function authMessage(message='',noticeKind='status'){
  root.innerHTML=renderAccessUi({
    message,
    busy:loginBusy,
    backendReady:runtime.enabled,
    qaOnly:runtime.qaOnly,
    mode:authMode,
    noticeKind,
  });
}
  function currentToken(){return session?.token||null;}
  async function refreshSessionIfNeeded(){
    if(!session||!nextExpiry(session))return session;
    if(refreshInFlight)return refreshInFlight;
    if(!session.refreshToken)throw new Error('M26_SESSION_EXPIRED');
    const currentUserId=session.user.id;refreshInFlight=transport.refresh(session.refreshToken).then((next)=>{if(next.user.id!==currentUserId)throw new Error('M26_REFRESH_IDENTITY_MISMATCH');session=next;vault.save(session);return session;}).finally(()=>{refreshInFlight=null;});
    return refreshInFlight;
  }
  async function fetchCatalog(){
    if(!catalog)catalog=await loadExerciseCatalog('/baseline_m25_2/exercise-catalog-m25.json');
    if(!mediaMap){
      try{mediaMap=await loadExerciseMediaMap();}
      catch{mediaMap=null;}
    }
    return catalog;
  }
  async function hydrate({reason='bootstrap'}={}){await refreshSessionIfNeeded();store.setHydration('loading');try{const [snapshot,installed]=await Promise.all([transport.bootstrap(currentToken()),transport.commandRegistry(currentToken())]);const runtimeRegistry=validatedRuntimeRegistry(installed);if(!runtimeRegistry.base.ok)throw new Error(`M26_REMOTE_BASE_REGISTRY_INVALID:${runtimeRegistry.base.missing.join(',')}`);const enriched={...snapshot,environment:{...(snapshot.environment||{}),commandRegistry:installed,reason},canary:{...(snapshot.canary||{}),version:snapshot.canary?.version||runtime.version||'26.0.0'}};store.hydrate(enriched);return {snapshot:enriched,installed,runtimeRegistry};}catch(error){store.setHydration('error',error);throw error;}}
  function renderRoute(shellVm,state){
    const role=shellVm?.identity?.role||state?.identity?.role||'client';
    if(sessionUi?.draft)return renderSessionBuilder({draft:sessionUi.draft,catalog,query:sessionUi.query,actionState:sessionUi.actionState,mediaMap,role});
    if(sessionUi?.execution)return renderGuidedExecution({execution:sessionUi.execution,session:sessionUi.session,catalog,actionState:sessionUi.actionState,mediaMap,role});
    return renderRouteView(createRouteViewModel(shellVm,state,new Date(),{catalog:catalog?.list?.()||[],mediaMap}));
  }
  function render(){shell?.render?.();}
  async function saveSessionDraft(){if(sessionUi?.draft&&draftRepository)await draftRepository.save(sessionUi.draft.clientId,SESSION_DRAFT_SCOPE,sessionUi.draft);}
  async function clearSessionDraft(clientId){if(clientId&&draftRepository)await draftRepository.remove(clientId,SESSION_DRAFT_SCOPE);}
  async function restoreExecution(){
    await recoveryCoordinator?.purgeExpired?.();const state=store.getState();const visible=new Set((state.collections.clients||[]).map((item)=>item.id));const own=state.identity?.clientId||null;
    const snapshots=await recoveryCoordinator?.list?.()||[];const snapshot=snapshots.find((item)=>visible.has(item.execution?.clientId)&&(state.identity?.role!=='client'||item.execution?.clientId===own));if(!snapshot?.execution||!snapshot?.session)return false;
    sessionUi={draft:null,query:'',actionState:createActionState(),session:snapshot.session,execution:snapshot.execution,appointmentId:snapshot.appointmentId||null};
    sessionUi.actionState.status='success';sessionUi.actionState.message='Sesión recuperada desde este dispositivo.';store.navigate('sesion');return true;
  }
  function surfaceWorkspaceError(error){
    const message=friendlyError(error);const node=root.querySelector?.('[data-workflow-status="session"]');if(node){node.textContent=message;node.dataset.status='error';}
    if(sessionUi){sessionUi.actionState.status='error';sessionUi.actionState.message=message;render();}
    try{globalThis.dispatchEvent?.(new CustomEvent('m26:toast',{detail:{message}}));}catch{}
  }
  function onOpenBuilderEvent(event){void onOpenBuilder(event).catch(surfaceWorkspaceError);}
  function onStartSessionEvent(event){void onStartSession(event).catch(surfaceWorkspaceError);}
  async function setupAuthenticated(){
    destroyControllers();sessionUi=null;
    const {installed,runtimeRegistry}=await hydrate({reason:'login'});await fetchCatalog();const ownerId=session.user.id;
    operationRepository=createKeyValueOperationRepository({ownerId});draftRepository=createEngagementDraftRepository({ownerId});
    commandBus=createCommandBus({transport,repository:operationRepository,getToken:async()=>{await refreshSessionIfNeeded();return currentToken();},rehydrate:hydrate,registry:runtimeRegistry.registry.length?runtimeRegistry.registry:M26_COMMAND_REGISTRY,getRole:()=>store.getState().identity?.role});
    const service=createEngagementCommandService({commandBus,installedRegistry:installed,getRole:()=>store.getState().identity?.role,isOnline:()=>navigator.onLine!==false});
    recoveryCoordinator=createExecutionRecoveryCoordinator({store:createExecutionRecoveryStore({ownerId}),commandBus,isOnline:()=>navigator.onLine!==false});
    shell=createShellController({root,store,renderRoute});
    workflow=createWorkflowController({root,store,commandBus,catalog,mediaMap,draftRepository,getRegistry:()=>runtimeRegistry.registry,onRender:render,createClientDraft:async(payload)=>{await refreshSessionIfNeeded();const result=await transport.createClientDraft(currentToken(),payload);await hydrate({reason:'client-created'});return result;}});
    engagement=createEngagementController({root,store,draftRepository,service,refreshState:({reason}={})=>hydrate({reason:reason||'engagement-refresh'})});wearables=createWearableController({root,store});verification=createVerificationController({root,commandBus,repository:operationRepository,store});
    sessionController=createSessionController({root,getContext:()=>({...(sessionUi||{}),catalog,commandBus,online:navigator.onLine!==false,recoveryCoordinator,setQuery:(query)=>{if(sessionUi)sessionUi.query=query;},autosaveDraft:saveSessionDraft,onPublished:async()=>{const clientId=sessionUi?.draft?.clientId;await clearSessionDraft(clientId);sessionUi=null;store.navigate('sesion');},onExit:exitSessionWorkspace,appointmentId:sessionUi?.appointmentId||null,sessionRevision:sessionUi?.session?.revision||0}),render,onError:(error)=>{if(sessionUi){sessionUi.actionState.status='error';sessionUi.actionState.message=friendlyError(error);}render();}});
    root.addEventListener('click',guardSessionNavigation,true);shell.mount();workflow.mount();engagement.mount();wearables.mount();verification.mount();sessionController.mount();await refreshVerificationState({repository:operationRepository,store});
    root.addEventListener('m26:logout',onLogout);root.addEventListener('m26:open-session-builder',onOpenBuilderEvent);root.addEventListener('m26:start-session',onStartSessionEvent);root.addEventListener('m26:inspect-operation',onInspectOperation);
    const sync=createConnectivitySync({coordinator:recoveryCoordinator,onResult:async()=>{await refreshVerificationState({repository:operationRepository,store});render();}});connectivityStop=sync.start();void registerM26ServiceWorker({url:'/m26/sw.js',scope:'/m26/'}).catch(()=>{});
    await restoreExecution();render();
  }
  function guardSessionNavigation(event){const route=event.target.closest?.('[data-m26-area]')?.getAttribute?.('data-m26-area');if(!route||route==='sesion'||!sessionUi)return;event.preventDefault();event.stopImmediatePropagation();sessionUi.actionState.status='retry';sessionUi.actionState.message='Finaliza, cancela o sal de la sesión antes de cambiar de módulo.';render();}
  function exitSessionWorkspace(){sessionUi=null;store.navigate('sesion');render();}
  async function onOpenBuilder(event){const clientId=String(event?.detail?.clientId||'');const state=store.getState();const visible=new Set((state.collections.clients||[]).map((item)=>item.id));if(!visible.has(clientId)||(state.identity?.role==='client'&&state.identity?.clientId!==clientId))throw new Error('M26_CLIENT_SCOPE_FORBIDDEN');const saved=await draftRepository?.load?.(clientId,SESSION_DRAFT_SCOPE);const draft=saved?.value?.clientId===clientId?saved.value:createSessionDraft({clientId});sessionUi={draft,query:'',actionState:createActionState(),execution:null,session:null};if(saved)sessionUi.actionState={...sessionUi.actionState,status:'success',message:'Borrador recuperado desde este dispositivo.'};store.navigate('sesion');render();}
  async function onStartSession(event){
    const clientId=String(event?.detail?.clientId||'');const state=store.getState();const visible=new Set((state.collections.clients||[]).map((item)=>item.id));if(!visible.has(clientId)||(state.identity?.role==='client'&&state.identity?.clientId!==clientId))throw new Error('M26_CLIENT_SCOPE_FORBIDDEN');const recovered=await recoveryCoordinator?.latest?.({clientId});if(recovered){sessionUi={draft:null,query:'',actionState:{...createActionState(),status:'success',message:'Sesión recuperada desde este dispositivo.'},session:recovered.session,execution:recovered.execution,appointmentId:recovered.appointmentId||null};store.navigate('sesion');render();return;}
    const normalized=normalizePublishedSession(event.detail.session);if(normalized.clientId!==clientId)throw new Error('M26_SESSION_CLIENT_MISMATCH');if(!normalized.id||!normalized.clientId||!normalized.blocks.length){const node=root.querySelector?.('[data-workflow-status="session"]');if(node){node.textContent='La sesión publicada no contiene bloques ejecutables.';node.dataset.status='error';}return;}
    const appointment=confirmedAppointmentForSession(store.getState().collections.appointments||[],normalized);if(!appointment?.id){const node=root.querySelector?.('[data-workflow-status="session"]');if(node){node.textContent='Se requiere una cita confirmada y vigente para iniciar la sesión.';node.dataset.status='error';}return;}
    sessionUi={draft:null,query:'',actionState:createActionState(),session:normalized,execution:createExecution({session:normalized,clientId:normalized.clientId}),appointmentId:appointment.id};store.navigate('sesion');render();
  }
  function onInspectOperation(event){const operation=event.detail?.operation;const message=operation?`Operación ${castilianStatusLabel(operation.status).toLowerCase()}. ${operation.errorCode?'Requiere revisión.':'Sin incidencias registradas.'}`:'Operación no encontrada';globalThis.dispatchEvent(new CustomEvent('m26:toast',{detail:{message}}));}
  function onLogout(){const token=currentToken();vault.clear();session=null;refreshInFlight=null;destroyControllers();store.reset();authMessage('Sesión cerrada de forma segura.');void transport?.logout?.(token).catch(()=>{});}
  function destroyControllers(){connectivityStop?.();connectivityStop=null;sessionController?.destroy?.();verification?.destroy?.();engagement?.destroy?.();wearables?.destroy?.();workflow?.destroy?.();shell?.destroy?.();sessionController=verification=wearables=engagement=workflow=shell=null;sessionUi=null;operationRepository=draftRepository=commandBus=recoveryCoordinator=null;root.removeEventListener('click',guardSessionNavigation,true);root.removeEventListener('m26:logout',onLogout);root.removeEventListener('m26:open-session-builder',onOpenBuilderEvent);root.removeEventListener('m26:start-session',onStartSessionEvent);root.removeEventListener('m26:inspect-operation',onInspectOperation);}
function onAuthClick(event) {
  const action = event.target.closest?.('[data-auth-action]')?.getAttribute?.('data-auth-action');

  if (!action) return;

  event.preventDefault?.();

  if (action === 'forgot-password') {
    authMode = 'request-recovery';
    authMessage();
    return;
  }

  if (action === 'back-to-login') {
    const recoveryToken = recoverySession?.accessToken || null;
    recoverySession = null;
    authMode = 'login';
    authMessage();
    void transport?.logout?.(recoveryToken).catch(() => {});
  }
}
async function requestRecovery(email) {
  if (loginBusy) return false;

  if (!runtime.enabled || !runtime.canary) {
    throw new Error('M26_BACKEND_DISABLED');
  }

  loginBusy = true;
  authMode = 'request-recovery';
  authMessage('Enviando enlace de recuperación…');

  try {
    await transport.requestPasswordRecovery(
      email,
      'https://m26-canary.iberfit.cl/'
    );

    loginBusy = false;
    authMessage(RECOVERY_REQUEST_CONFIRMATION);

    return true;
  } catch (error) {
    loginBusy = false;

    if (/QA_ACCOUNT_REQUIRED/.test(String(error?.message || error || ''))) {
      authMessage(RECOVERY_REQUEST_CONFIRMATION);
      return true;
    }

    authMessage(recoveryNetworkError(error), 'error');
    throw error;
  }
}
async function updateRecoveredPassword(password, passwordConfirmation) {
  if (loginBusy) return false;

  if (
    !runtime.enabled ||
    !runtime.canary ||
    !recoverySession?.accessToken
  ) {
    throw new Error('M26_RECOVERY_SESSION_REQUIRED');
  }

  const nextPassword = String(password || '');
  const confirmation = String(passwordConfirmation || '');

  if (nextPassword !== confirmation) {
    authMode = 'update-password';
    authMessage('Las contraseñas no coinciden.', 'error');
    return false;
  }

  loginBusy = true;
  authMode = 'update-password';
  authMessage('Guardando contraseña nueva…');

  try {
    const recoveryToken = recoverySession.accessToken;

    await transport.updatePassword(
      recoveryToken,
      nextPassword
    );

    recoverySession = null;
    await transport.logout(recoveryToken).catch(() => {});

    loginBusy = false;
    authMode = 'login';

    authMessage(
      'Contraseña actualizada. Ya puedes entrar con la contraseña nueva.'
    );

    return true;
  } catch (error) {
    loginBusy = false;

    if (invalidRecoverySession(error)) {
      const recoveryToken = recoverySession?.accessToken || null;
      recoverySession = null;
      authMode = 'request-recovery';
      authMessage(RECOVERY_LINK_INVALID, 'error');
      void transport?.logout?.(recoveryToken).catch(() => {});
    } else {
      authMode = 'update-password';
      authMessage(recoveryPasswordError(error), 'error');
    }

    throw error;
  }
}
  async function login(email,password){if(loginBusy)return false;if(!runtime.enabled)throw new Error('M26_BACKEND_DISABLED');loginBusy=true;authMessage('Confirmando identidad y permisos…');try{session=await transport.login(email,password);vault.save(session);store.reset();await setupAuthenticated();return true;}catch(error){vault.clear();session=null;destroyControllers();store.reset();loginBusy=false;authMessage(friendlyError(error));throw error;}finally{loginBusy=false;}}
  async function resume(){if(!runtime.enabled){authMessage('El acceso no está disponible temporalmente en este sitio.');return false;}session=vault.load();if(!session){authMessage();return false;}try{await setupAuthenticated();return true;}catch{vault.clear();session=null;destroyControllers();store.reset();authMessage('La sesión expiró o perdió autorización. Vuelve a entrar.');return false;}}
  async function onSubmit(event) {
  const form = event.target.closest?.('[data-auth-form]');

  if (!form) return;

  event.preventDefault();

  if (loginBusy) return;

  const formType = form.getAttribute('data-auth-form');
  const data = new FormData(form);

  if (formType === 'login') {
    await login(
      data.get('email'),
      data.get('password')
    ).catch(() => {});

    return;
  }

  if (formType === 'request-recovery') {
    await requestRecovery(
      data.get('email')
    ).catch(() => {});

    return;
  }

  if (formType === 'update-password') {
    await updateRecoveredPassword(
      data.get('password'),
      data.get('passwordConfirmation')
    ).catch(() => {});
  }
}
  function mount() {
  transport = runtime.enabled
    ? createM26Transport(runtime)
    : null;

  root.addEventListener('submit', onSubmit);
  root.addEventListener('click', onAuthClick);

  const recovery = inspectPasswordRecoveryHash(
    locationLike?.hash || ''
  );

  if (recovery.status !== 'none') {
    let fragmentCleared = false;

    try {
      if (typeof historyLike?.replaceState !== 'function') {
        throw new Error('M26_RECOVERY_HISTORY_UNAVAILABLE');
      }

      historyLike.replaceState(
        null,
        '',
        recoveryUrlWithoutFragment(locationLike)
      );
      fragmentCleared = true;
    } catch {}

    if (
      fragmentCleared &&
      recovery.status === 'valid' &&
      runtime.enabled &&
      runtime.canary
    ) {
      recoverySession = recovery.session;
      authMode = 'update-password';
      authMessage();

      return Promise.resolve(false);
    }

    recoverySession = null;
    authMode = 'request-recovery';
    authMessage(RECOVERY_LINK_INVALID, 'error');

    return Promise.resolve(false);
  }

  return resume();
}
  function destroy() {
  const recoveryToken = recoverySession?.accessToken || null;
  recoverySession = null;
  destroyControllers();
  store.reset();
  root.removeEventListener('submit', onSubmit);
  root.removeEventListener('click', onAuthClick);
  void transport?.logout?.(recoveryToken).catch(() => {});
}
  return Object.freeze({mount,destroy,login,resume,getState:()=>store.getState(),runtime});
}

export const __applicationInternals=Object.freeze({normalizePublishedSession,publishedSessionForClient,confirmedAppointmentForSession,friendlyError,recoveryNetworkError,recoveryPasswordError,invalidRecoverySession,RECOVERY_REQUEST_CONFIRMATION,RECOVERY_LINK_INVALID,APPOINTMENT_EARLY_WINDOW_MS,APPOINTMENT_LATE_WINDOW_MS});
