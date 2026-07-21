import {resolveM26Runtime,createM26Transport} from '../supabase-transport.js';
import {createCanonicalStore} from '../canonical-store.js';
import {createCommandBus} from '../command-bus.js';
import {validatedRuntimeRegistry,M26_COMMAND_REGISTRY} from '../command-catalog.js';
import {createKeyValueOperationRepository} from '../platform/offline-command-repository.js';
import {createEngagementDraftRepository} from '../engagement/activity-drafts.js';
import {createEngagementCommandService} from '../engagement/command-service.js';
import {createEngagementController} from '../engagement/engagement-controller.js';
import {createVerificationController,refreshVerificationState} from '../engagement/conflict-center.js';
import {createShellController} from '../shell/shell-controller.js';
import {createRouteViewModel} from '../modules/route-view-model.js';
import {renderRouteView} from '../modules/route-render.js';
import {createWorkflowController} from './workflow-controller.js';
import {createSessionVault,sessionExpiresSoon} from './session-vault.js';
import {renderAccessUi} from './access-ui.js';
import {loadExerciseCatalog} from '../exercises/catalog.js';
import {createSessionDraft} from '../workflows/session-builder.js';
import {createExecution} from '../workflows/session-execution.js';
import {renderSessionBuilder,renderGuidedExecution} from '../workflows/session-ui.js';
import {createSessionController} from '../workflows/session-controller.js';
import {createActionState} from '../ui/action-state.js';
import {createExecutionRecoveryStore,createExecutionRecoveryCoordinator} from '../workflows/session-recovery.js';
import {registerM26ServiceWorker,createConnectivitySync} from '../platform/pwa.js';

function escapeText(value){return String(value??'').replace(/[&<>"']/g,'');}
function normalizePublishedSession(record){
  const body=record?.body&&typeof record.body==='object'?record.body:record;
  const blocks=Array.isArray(body?.blocks)?structuredClone(body.blocks):[];
  return {id:record?.id||body?.id,clientId:record?.clientId||record?.client_id||body?.clientId||body?.client_id,title:body?.title||body?.name||'Sesión IBERFIT',durationMinutes:Number(body?.durationMinutes||body?.duration_minutes||50),status:body?.status||record?.status||'published',blocks,revision:Number(record?.revision||body?.revision||0)};
}
function nextExpiry(session){return sessionExpiresSoon(session);}

export async function createM26Application({root=document.querySelector('#app'),runtimeConfig=globalThis.__IBERFIT_M26_RUNTIME__||{},locationLike=globalThis.location}={}){
  if(!root)throw new Error('M26_APP_ROOT_REQUIRED');
  const runtime=resolveM26Runtime(runtimeConfig,locationLike);const vault=createSessionVault();
  let transport=null,session=null,store=createCanonicalStore(),catalog=null,shell=null,workflow=null,engagement=null,verification=null,sessionController=null,operationRepository=null,draftRepository=null,commandBus=null,recoveryCoordinator=null,connectivityStop=null,sessionUi=null,loginBusy=false;

  function authMessage(message=''){root.innerHTML=renderAccessUi({message,busy:loginBusy,backendReady:runtime.enabled});}
  function currentToken(){return session?.token||null;}
  async function refreshSessionIfNeeded(){if(!session||!nextExpiry(session))return session;if(!session.refreshToken)throw new Error('M26_SESSION_EXPIRED');session=await transport.refresh(session.refreshToken);vault.save(session);return session;}
  async function fetchCatalog(){if(catalog)return catalog;catalog=await loadExerciseCatalog('/baseline_m25_2/exercise-catalog-m25.json');return catalog;}
  async function hydrate({reason='bootstrap'}={}){await refreshSessionIfNeeded();store.setHydration('loading');try{const [snapshot,installed]=await Promise.all([transport.bootstrap(currentToken()),transport.commandRegistry(currentToken())]);const runtimeRegistry=validatedRuntimeRegistry(installed);if(!runtimeRegistry.base.ok)throw new Error(`M26_REMOTE_BASE_REGISTRY_INVALID:${runtimeRegistry.base.missing.join(',')}`);const enriched={...snapshot,environment:{...(snapshot.environment||{}),commandRegistry:installed,reason},canary:{...(snapshot.canary||{}),version:snapshot.canary?.version||'26.0.0-rc15'}};store.hydrate(enriched);return {snapshot:enriched,installed,runtimeRegistry};}catch(error){store.setHydration('error',error);throw error;}}
  function renderRoute(shellVm,state){if(sessionUi?.draft)return renderSessionBuilder({draft:sessionUi.draft,catalog,query:sessionUi.query,actionState:sessionUi.actionState});if(sessionUi?.execution)return renderGuidedExecution({execution:sessionUi.execution,session:sessionUi.session,catalog,actionState:sessionUi.actionState});return renderRouteView(createRouteViewModel(shellVm,state,new Date(),{catalog:catalog?.list?.()||[]}));}
  function render(){shell?.render?.();}
  async function setupAuthenticated(){
    const {installed,runtimeRegistry}=await hydrate({reason:'login'});await fetchCatalog();const ownerId=session.user.id;
    operationRepository=createKeyValueOperationRepository({ownerId});draftRepository=createEngagementDraftRepository({ownerId});
    commandBus=createCommandBus({transport,repository:operationRepository,getToken:async()=>{await refreshSessionIfNeeded();return currentToken();},rehydrate:hydrate,registry:runtimeRegistry.registry.length?runtimeRegistry.registry:M26_COMMAND_REGISTRY,getRole:()=>store.getState().identity?.role});
    const service=createEngagementCommandService({commandBus,installedRegistry:installed,getRole:()=>store.getState().identity?.role,isOnline:()=>navigator.onLine!==false});
    recoveryCoordinator=createExecutionRecoveryCoordinator({store:createExecutionRecoveryStore({ownerId}),commandBus,isOnline:()=>navigator.onLine!==false});
    shell=createShellController({root,store,renderRoute});
    workflow=createWorkflowController({root,store,commandBus,catalog,getRegistry:()=>runtimeRegistry.registry,onRender:render});
    engagement=createEngagementController({root,store,draftRepository,service});verification=createVerificationController({root,commandBus,repository:operationRepository,store});
    sessionController=createSessionController({root,getContext:()=>({...(sessionUi||{}),catalog,commandBus,online:navigator.onLine!==false,recoveryCoordinator,setQuery:(query)=>{if(sessionUi)sessionUi.query=query;},autosaveDraft:()=>{},onExit:exitSessionWorkspace,appointmentId:sessionUi?.appointmentId||null,sessionRevision:sessionUi?.session?.revision||0}),render,onError:(error)=>{if(sessionUi){sessionUi.actionState.status='error';sessionUi.actionState.message=error.message;}render();}});
    root.addEventListener('click',guardSessionNavigation,true);shell.mount();workflow.mount();engagement.mount();verification.mount();sessionController.mount();await refreshVerificationState({repository:operationRepository,store});
    root.addEventListener('m26:logout',onLogout);root.addEventListener('m26:open-session-builder',onOpenBuilder);root.addEventListener('m26:start-session',onStartSession);root.addEventListener('m26:inspect-operation',onInspectOperation);
    const sync=createConnectivitySync({coordinator:recoveryCoordinator,onResult:async()=>{await refreshVerificationState({repository:operationRepository,store});render();}});connectivityStop=sync.start();void registerM26ServiceWorker({url:'/m26/sw.js',scope:'/'}).catch(()=>{});
  }
  function guardSessionNavigation(event){const route=event.target.closest?.('[data-m26-area]')?.getAttribute?.('data-m26-area');if(!route||route==='sesion'||!sessionUi)return;event.preventDefault();event.stopImmediatePropagation();sessionUi.actionState.status='retry';sessionUi.actionState.message='Finaliza, cancela o sal de la sesión antes de cambiar de módulo.';render();}
  function exitSessionWorkspace(){sessionUi=null;store.navigate('sesion');render();}
  function onOpenBuilder(event){sessionUi={draft:createSessionDraft({clientId:event.detail.clientId}),query:'',actionState:createActionState(),execution:null,session:null};store.navigate('sesion');render();}
  function onStartSession(event){const normalized=normalizePublishedSession(event.detail.session);if(!normalized.id||!normalized.clientId||!normalized.blocks.length){const node=root.querySelector?.('[data-workflow-status="session"]');if(node){node.textContent='La sesión publicada no contiene bloques ejecutables.';node.dataset.status='error';}return;}const appointment=(store.getState().collections.appointments||[]).find((item)=>(item.clientId||item.client_id)===normalized.clientId&&/confirm/i.test(String(item.status||'')));if(!appointment?.id){const node=root.querySelector?.('[data-workflow-status="session"]');if(node){node.textContent='Se requiere una cita confirmada para iniciar la sesión.';node.dataset.status='error';}return;}sessionUi={draft:null,query:'',actionState:createActionState(),session:normalized,execution:createExecution({session:normalized,clientId:normalized.clientId}),appointmentId:appointment.id};store.navigate('sesion');render();}
  function onInspectOperation(event){const operation=event.detail?.operation;const message=operation?`${operation.type} · ${operation.status} · ${operation.errorCode||'sin error'}`:'Operación no encontrada';globalThis.dispatchEvent(new CustomEvent('m26:toast',{detail:{message}}));}
  async function onLogout(){try{await transport?.logout?.(currentToken());}catch{}finally{vault.clear();session=null;destroyControllers();authMessage('Sesión cerrada de forma segura.');}}
  function destroyControllers(){connectivityStop?.();connectivityStop=null;sessionController?.destroy?.();verification?.destroy?.();engagement?.destroy?.();workflow?.destroy?.();shell?.destroy?.();root.removeEventListener('click',guardSessionNavigation,true);root.removeEventListener('m26:logout',onLogout);root.removeEventListener('m26:open-session-builder',onOpenBuilder);root.removeEventListener('m26:start-session',onStartSession);root.removeEventListener('m26:inspect-operation',onInspectOperation);}
  async function login(email,password){if(!runtime.enabled)throw new Error('M26_BACKEND_DISABLED');loginBusy=true;authMessage('Confirmando identidad y permisos…');try{session=await transport.login(email,password);vault.save(session);await setupAuthenticated();return true;}catch(error){vault.clear();session=null;authMessage(escapeText(error.message));throw error;}finally{loginBusy=false;}}
  async function resume(){if(!runtime.enabled){authMessage('Backend deshabilitado en este host.');return false;}session=vault.load();if(!session){authMessage();return false;}try{await setupAuthenticated();return true;}catch{vault.clear();session=null;destroyControllers();authMessage('La sesión expiró o perdió autorización. Vuelve a entrar.');return false;}}
  async function onSubmit(event){const form=event.target.closest?.('[data-auth-form="login"]');if(!form)return;event.preventDefault();const data=new FormData(form);await login(data.get('email'),data.get('password')).catch(()=>{});}
  function mount(){transport=runtime.enabled?createM26Transport(runtime):null;root.addEventListener('submit',onSubmit);return resume();}
  function destroy(){destroyControllers();root.removeEventListener('submit',onSubmit);}
  return Object.freeze({mount,destroy,login,resume,getState:()=>store.getState(),runtime});
}
