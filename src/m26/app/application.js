import {createCommunicationTransport} from '../communication/transport.js';
import {createCommunicationService} from '../communication/service.js';
import {createCommunicationController} from '../communication/controller.js';
import {createAdminTransport} from '../admin/transport.js';
import {createAdminCommandService} from '../admin/service.js';
import {createAdminController} from '../admin/controller.js';
import {normalizeApplicationContextExtension,filterSnapshotForAssignmentScope} from '../shared/integration-context.js';
import {createRc39Transport,mergeRc39ChangeRequests} from '../rc39/transport.js';
import {createRc39Controller} from '../rc39/controller.js';
import {actorCanExecuteSession,sessionRequiresConfirmedAppointment} from '../rc39/session-policy.js';
import {castilianStatusLabel} from '../ui/castellano.js';
import {resolveM26Runtime,createM26Transport} from '../supabase-transport.js';
import {createCanonicalStore} from '../canonical-store.js';
import {createCommandBus} from '../command-bus.js';
import {validatedRuntimeRegistry,M26_COMMAND_REGISTRY} from '../command-catalog.js';
import {createKeyValueOperationRepository} from '../platform/offline-command-repository.js';
import {createTelemetryDurableOutbox} from '../telemetry/durable-outbox.js';
import {createTelemetryRemoteSync} from '../telemetry/remote-sync.js';
import {createEngagementDraftRepository} from '../engagement/activity-drafts.js';
import {createEngagementCommandService} from '../engagement/command-service.js';
import {createEngagementController} from '../engagement/engagement-controller.js';
import {createWearableController} from '../wearables/controller.js';
import {createVerificationController,refreshVerificationState} from '../engagement/conflict-center.js';
import {createShellController} from '../shell/shell-controller.js';
import {createCoachProductivityController} from '../productivity/coach-productivity.js';
import {createM26MotionController} from '../motion/motion-controller.js';
import {createContextualGuidanceController} from '../guidance/contextual-guidance.js';
import {createRouteViewModel} from '../modules/route-view-model.js';
import {renderRouteView} from '../modules/route-render.js';
import {createWorkflowController} from './workflow-controller.js';
import {createSessionVault,sessionExpiresSoon} from './session-vault.js';
import {renderAccessUi} from './access-ui.js';
import {inspectPasswordRecoveryHash,recoveryUrlWithoutFragment} from './password-recovery.js';
import {loadExerciseCatalog} from '../exercises/catalog.js';
import {createSessionDraft} from '../workflows/session-builder.js';
import {createReusableSessionDraft,createSessionTemplateRepository,createDraftFromSessionTemplate} from '../productivity/session-reuse.js';
import {createExecution} from '../workflows/session-execution.js';
import {renderSessionBuilder,renderGuidedExecution} from '../workflows/session-ui.js';
import {createSessionController} from '../workflows/session-controller.js';
import {createActionState} from '../ui/action-state.js';
import {createExecutionRecoveryStore,createExecutionRecoveryCoordinator} from '../workflows/session-recovery.js';
import {registerM26ServiceWorker,createConnectivitySync} from '../platform/pwa.js';
import {loadExerciseMediaMap} from '../library/exercise-media.js';
import {waitForCreatedClient} from '../workflows/client-onboarding.js';
import {
  createIriExternalReportController,
  iriExternalReportAppUrl,
  parseIriExternalReportIntent,
  resolveIriExternalReportIntent,
} from '../workflows/iri-external-report-controller.js';

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
function diagnosticCode(error,stage='operation'){
  const raw=String(error?.message||'');
  const match=raw.match(/\bM26_[A-Z0-9_:-]{2,120}\b/u);
  if(match)return match[0];
  const normalizedStage=String(stage||'operation')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu,'_')
    .replace(/^_+|_+$/gu,'')
    .slice(0,60)||'OPERATION';
  return `M26_${normalizedStage}_FAILED`;
}
function reportDiagnostic(stage,error){
  const status=Number.isInteger(error?.status)
    ?error.status
    :null;
  const detail=Object.freeze({
    stage:String(stage||'operation')
      .replace(/[^a-z0-9_-]+/giu,'-')
      .slice(0,60),
    code:diagnosticCode(error,stage),
    status,
  });
  try{
    console.error(
      `[IBERFIT:${detail.stage}] ${detail.code}${status!==null?` HTTP ${status}`:''}`
    );
  }catch{}
  try{
    globalThis.dispatchEvent?.(
      new CustomEvent(
        'm26:diagnostic',
        {detail},
      ),
    );
  }catch{}
  return detail;
}


const RECOVERY_REQUEST_CONFIRMATION='Si el correo corresponde a una cuenta QA autorizada, recibirás un enlace para crear una contraseña nueva.';
const RECOVERY_REQUEST_CONFIRMATION_PUBLIC='Si el correo corresponde a una cuenta IBERFIT, recibirás un enlace para crear una contraseña nueva.';
const RECOVERY_LINK_INVALID='El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.';
function recoveryRequestConfirmation(runtime){
  return runtime?.qaOnly
    ?RECOVERY_REQUEST_CONFIRMATION
    :RECOVERY_REQUEST_CONFIRMATION_PUBLIC;
}
function recoveryRedirectForRuntime(runtime,locationLike=globalThis.location){
  if(!runtime?.enabled)throw new Error('M26_BACKEND_DISABLED');
  const host=String(runtime?.host||locationLike?.hostname||'').trim().toLowerCase();

  if(runtime?.qaOnly){
    if(host&&host!=='m26-canary.iberfit.cl')throw new Error('M26_RECOVERY_REDIRECT_INVALID');
    return 'https://m26-canary.iberfit.cl/';
  }

  if(['app.iberfit.cl','coach.iberfit.cl'].includes(host)){
    return `https://${host}/`;
  }

  if(['localhost','127.0.0.1','::1','[::1]'].includes(host)){
    const protocol=String(locationLike?.protocol||'http:').toLowerCase();
    if(!['http:','https:'].includes(protocol))throw new Error('M26_RECOVERY_REDIRECT_INVALID');
    const rawPort=String(locationLike?.port||'').trim();
    if(rawPort&&!/^\d{1,5}$/u.test(rawPort))throw new Error('M26_RECOVERY_REDIRECT_INVALID');
    const port=rawPort?`:${rawPort}`:'';
    const hostname=['::1','[::1]'].includes(host)?'[::1]':host;
    return `${protocol}//${hostname}${port}/`;
  }

  throw new Error('M26_RECOVERY_REDIRECT_INVALID');
}
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
  const rc39Transport=runtime.enabled?createRc39Transport({runtime}):null;
  const communicationTransport=runtime.enabled?createCommunicationTransport({runtime}):null;
  const adminTransport=runtime.enabled?createAdminTransport({runtime}):null;
  let activeApplicationRole=null;
  let transport=null,session=null,store=createCanonicalStore(),catalog=null,mediaMap=null,shell=null,productivity=null,motion=null,guidance=null,workflow=null,engagement=null,wearables=null,verification=null,sessionController=null,iriExternalReports=null,rc39=null,communication=null,communicationService=null,admin=null,adminService=null,operationRepository=null,draftRepository=null,sessionTemplateRepository=null,telemetryOutbox=null,telemetryRemoteSync=null,telemetrySyncStop=null,commandBus=null,recoveryCoordinator=null,connectivityStop=null,sessionUi=null,authMode='login',recoverySession=null,loginBusy=false,refreshInFlight=null;
  let pendingIriExternalReportIntent=parseIriExternalReportIntent(locationLike);

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
  async function hydrate({reason='bootstrap'}={}){
    await refreshSessionIfNeeded();
    store.setHydration('loading');
    try{
      const [snapshot,installed,extensions,contextExtension,backendV43,wearableV44]=await Promise.all([
        transport.bootstrap(currentToken()),
        transport.commandRegistry(currentToken()),
        rc39Transport?rc39Transport.extensions(currentToken()):Promise.resolve({rolesAvailable:false,authorizedRoles:[],changeRequestsAvailable:false,changeRequests:[]}),
        adminTransport?adminTransport.applicationContextOptional(currentToken()):Promise.resolve({available:false,reason:'disabled',data:null}),
        transport.backendBootstrap(currentToken()),
        transport.wearableBootstrap(currentToken()),
      ]);
      const runtimeRegistry=validatedRuntimeRegistry(installed);
      if(!runtimeRegistry.base.ok)throw new Error(`M26_REMOTE_BASE_REGISTRY_INVALID:${runtimeRegistry.base.missing.join(',')}`);
      const applicationContext=normalizeApplicationContextExtension(contextExtension.available?{...contextExtension.data,available:true}:{available:false});
      const primaryRole=String(snapshot?.user?.role||'').toLowerCase();
      const authorizedRoles=applicationContext.roles.length?applicationContext.roles:extensions.authorizedRoles.length?extensions.authorizedRoles:[primaryRole].filter(Boolean);
      if(activeApplicationRole&&!authorizedRoles.includes(activeApplicationRole))throw new Error('M26_ROLE_SWITCH_FORBIDDEN');
      const activeRole=activeApplicationRole||primaryRole;
      const scopedSnapshot=filterSnapshotForAssignmentScope(snapshot,applicationContext,activeRole);
      const [adminExtension,communicationExtension]=await Promise.all([
        activeRole==='admin'&&adminTransport?adminTransport.bootstrapOptional(currentToken()):Promise.resolve({available:false,reason:'role_not_admin',data:null}),
        ['client','coach'].includes(activeRole)&&communicationTransport?communicationTransport.bootstrapOptional(currentToken(),{application:activeRole}):Promise.resolve({available:false,reason:'unsupported',data:null}),
      ]);
      const rawEnvironment=scopedSnapshot?.environment;const normalizedEnvironment=typeof rawEnvironment==='string'?{mode:rawEnvironment}:rawEnvironment&&typeof rawEnvironment==='object'&&!Array.isArray(rawEnvironment)?rawEnvironment:{};
      const appointments=mergeRc39ChangeRequests(scopedSnapshot?.data?.appointments||[],extensions.changeRequests||[]);
      const enriched={...scopedSnapshot,user:{...(scopedSnapshot.user||{}),role:activeRole,authorizedRoles,roleChoiceConfirmed:Boolean(activeApplicationRole)},data:{...(scopedSnapshot.data||{}),appointments,wearableConnections:wearableV44.connections||[],wearableDailySummaries:wearableV44.dailySummaries||[],wearableConsents:wearableV44.consents||[]},environment:{...normalizedEnvironment,commandRegistry:installed,reason,backendV43,rc39:{authorizedRoles:extensions.rolesAvailable,appointmentChangeRequests:extensions.changeRequestsAvailable},wearableV44:{ready:wearableV44.ready===true,version:wearableV44.version||'RC44'},applicationContext:{available:applicationContext.available,organizationId:applicationContext.organizationId,membershipStatus:applicationContext.membershipStatus,assignmentScopeEnforced:applicationContext.assignmentScopeEnforced},admin:{available:adminExtension.available===true,reason:adminExtension.reason||null},communication:{available:communicationExtension.available===true,reason:communicationExtension.reason||null}},canary:{...(scopedSnapshot.canary||{}),version:scopedSnapshot.canary?.version||runtime.version||'26.0.0'},admin:adminExtension.available?adminExtension.data:null,communication:communicationExtension.available?communicationExtension.data:null};
      store.hydrate(enriched);
      return {snapshot:enriched,installed,runtimeRegistry};
    }catch(error){store.setHydration('error',error);throw error;}
  }
  function renderRoute(shellVm,state){
    const role=shellVm?.identity?.role||state?.identity?.role||'client';
    if(sessionUi?.draft)return renderSessionBuilder({draft:sessionUi.draft,catalog,query:sessionUi.query,templates:sessionUi.templates||[],actionState:sessionUi.actionState,mediaMap,role});
    if(sessionUi?.execution)return renderGuidedExecution({execution:sessionUi.execution,session:sessionUi.session,catalog,actionState:sessionUi.actionState,mediaMap,role});
    return renderRouteView(createRouteViewModel(shellVm,state,new Date(),{catalog:catalog?.list?.()||[],mediaMap}));
  }
  function render(){shell?.render?.();}
  function draftOnline(){return globalThis.navigator?.onLine!==false;}
  function saveCurrentSessionTemplate(name){if(!sessionUi?.draft||!sessionTemplateRepository)throw new Error('M26_SESSION_TEMPLATE_REPOSITORY_REQUIRED');const saved=sessionTemplateRepository.save(name,sessionUi.draft);sessionUi.templates=sessionTemplateRepository.list();sessionUi.actionState.status='success';sessionUi.actionState.message=`Plantilla “${saved.name}” guardada como versión ${saved.version}.`;return saved;}
  function loadCurrentSessionTemplate(templateId){if(!sessionUi?.draft||!sessionTemplateRepository)throw new Error('M26_SESSION_TEMPLATE_REPOSITORY_REQUIRED');const template=sessionTemplateRepository.get(templateId);if(!template)throw new Error('M26_SESSION_TEMPLATE_NOT_FOUND');sessionUi.draft=createDraftFromSessionTemplate(template,{clientId:sessionUi.draft.clientId,catalog});sessionUi.templates=sessionTemplateRepository.list();sessionUi.actionState.status='success';sessionUi.actionState.message=`Plantilla “${template.name}” v${template.version} cargada como borrador independiente.`;return sessionUi.draft;}  async function saveSessionDraft(){
    if(!sessionUi?.draft||!draftRepository)return Object.freeze({ok:true,skipped:true,local:false,remote:false});
    const draft=structuredClone(sessionUi.draft);
    const clientId=String(draft.clientId||'');
    let local=false,remote=false,remoteResult=null,localError=null,remoteError=null;
    try{
      await draftRepository.save(clientId,SESSION_DRAFT_SCOPE,draft);
      local=true;
    }catch(error){
      localError=error;
      reportDiagnostic('session-draft-local-save',error);
    }
    if(runtime.enabled&&draftOnline()){
      try{
        await refreshSessionIfNeeded();
        remoteResult=await transport.upsertSessionDraft(currentToken(),{
          clientId,
          scope:SESSION_DRAFT_SCOPE,
          revision:Number(draft.revision||0),
          draft,
        });
        remote=true;
      }catch(error){
        remoteError=error;
        reportDiagnostic('session-draft-remote-save',error);
      }
    }
    if(!local&&!remote){
      const source=remoteError||localError||new Error('M26_SESSION_DRAFT_PERSISTENCE_FAILED');
      throw Object.assign(new Error(diagnosticCode(source,'session-draft-save')),{status:source?.status});
    }
    sessionUi.draftPersistence=Object.freeze({
      local,
      remote,
      updatedAt:remoteResult?.updatedAt||new Date().toISOString(),
    });
    return Object.freeze({
      ok:true,
      local,
      remote,
      updatedAt:sessionUi.draftPersistence.updatedAt,
    });
  }
  async function loadSessionDraft(clientId){
    let localRecord;
    try{
      localRecord=await draftRepository?.load?.(clientId,SESSION_DRAFT_SCOPE);
    }catch(error){
      reportDiagnostic('session-draft-local-load',error);
    }
    let remoteRecord;
    if(runtime.enabled&&draftOnline()){
      try{
        await refreshSessionIfNeeded();
        const result=await transport.getSessionDraft(currentToken(),clientId,SESSION_DRAFT_SCOPE);
        if(result.found===true){
          remoteRecord={
            ownerId:session?.user?.id||null,
            clientId,
            scope:SESSION_DRAFT_SCOPE,
            value:structuredClone(result.draft),
            updatedAt:result.updatedAt||null,
            confirmed:false,
            remote:true,
          };
        }
      }catch(error){
        reportDiagnostic('session-draft-remote-load',error);
      }
    }
    const localTime=localRecord?.updatedAt?new Date(localRecord.updatedAt).getTime():0;
    const remoteTime=remoteRecord?.updatedAt?new Date(remoteRecord.updatedAt).getTime():0;
    const selected=remoteRecord&&(!localRecord||remoteTime>=localTime)?remoteRecord:localRecord;
    if(selected===remoteRecord){
      try{
        await draftRepository.save(clientId,SESSION_DRAFT_SCOPE,remoteRecord.value);
      }catch(error){
        reportDiagnostic('session-draft-local-cache',error);
      }
    }
    return selected;
  }
  async function clearSessionDraft(clientId){
    if(!clientId)return Object.freeze({ok:true,skipped:true});
    let local=false,remote=false,localError=null,remoteError=null;
    if(draftRepository){
      try{
        await draftRepository.remove(clientId,SESSION_DRAFT_SCOPE);
        local=true;
      }catch(error){
        localError=error;
        reportDiagnostic('session-draft-local-delete',error);
      }
    }
    if(runtime.enabled&&draftOnline()){
      try{
        await refreshSessionIfNeeded();
        await transport.deleteSessionDraft(currentToken(),clientId,SESSION_DRAFT_SCOPE);
        remote=true;
      }catch(error){
        remoteError=error;
        reportDiagnostic('session-draft-remote-delete',error);
      }
    }
    if(!local&&!remote){
      const source=remoteError||localError||new Error('M26_SESSION_DRAFT_DELETE_FAILED');
      throw Object.assign(new Error(diagnosticCode(source,'session-draft-delete')),{status:source?.status});
    }
    return Object.freeze({ok:true,local,remote});
  }
  async function restoreExecution(){
    await recoveryCoordinator?.purgeExpired?.();const state=store.getState();const visible=new Set((state.collections.clients||[]).map((item)=>item.id));const own=state.identity?.clientId||null;
    const snapshots=await recoveryCoordinator?.list?.()||[];const snapshot=snapshots.find((item)=>visible.has(item.execution?.clientId)&&(state.identity?.role!=='client'||item.execution?.clientId===own));if(!snapshot?.execution||!snapshot?.session)return false;
    sessionUi={draft:null,query:'',actionState:createActionState(),session:snapshot.session,execution:snapshot.execution,appointmentId:snapshot.appointmentId||null};
    sessionUi.actionState.status='success';sessionUi.actionState.message='Sesión recuperada desde este dispositivo.';store.navigate('sesion');return true;
  }
  function surfaceWorkspaceError(error){
    const detail=reportDiagnostic('session-workspace',error);
    const message=`${friendlyError(error)} Código: ${detail.code}.`;
    const node=root.querySelector?.('[data-workflow-status="session"]');
    if(node){node.textContent=message;node.dataset.status='error';}
    if(sessionUi){sessionUi.actionState.status='error';sessionUi.actionState.message=message;render();}
    try{globalThis.dispatchEvent?.(new CustomEvent('m26:toast',{detail:{message}}));}catch{}
  }
  function onOpenBuilderEvent(event){void onOpenBuilder(event).catch(surfaceWorkspaceError);}
  function onStartSessionEvent(event){void onStartSession(event).catch(surfaceWorkspaceError);}
  function safeAppPath(){const pathname=String(locationLike?.pathname||'/');return pathname.startsWith('/')&&!pathname.startsWith('//')?pathname:'/';}
  function replaceAppLocation(target){try{historyLike?.replaceState?.(null,'',target);}catch{}}
  function sanitizePendingIriExternalReportIntent(){
    if(!pendingIriExternalReportIntent)return;
    if(pendingIriExternalReportIntent.status!=='valid'){replaceAppLocation(safeAppPath());return;}
    const safe=new URL(iriExternalReportAppUrl(pendingIriExternalReportIntent.assessmentId));
    replaceAppLocation(`${safe.pathname}${safe.search}`);
  }
  async function consumePendingIriExternalReportIntent(){
    const intent=pendingIriExternalReportIntent;if(!intent)return false;
    pendingIriExternalReportIntent=null;replaceAppLocation(safeAppPath());
    store.navigate('informes');
    try{
      const context=resolveIriExternalReportIntent(store.getState(),intent);
      store.selectIriAssessment?.(context.assessmentId);
      render();
      await iriExternalReports.openAssessmentReport(context.assessmentId);
      return true;
    }catch{
      render();
      try{globalThis.dispatchEvent?.(new CustomEvent('m26:toast',{detail:{message:'El documento solicitado no está disponible para este expediente.'}}));}catch{}
      return false;
    }
  }
  async function setupAuthenticated(){
    destroyControllers();sessionUi=null;
    const {installed,runtimeRegistry}=await hydrate({reason:'login'});await fetchCatalog();const ownerId=session.user.id;
    operationRepository=createKeyValueOperationRepository({ownerId});draftRepository=createEngagementDraftRepository({ownerId});sessionTemplateRepository=createSessionTemplateRepository({ownerId});telemetryOutbox=createTelemetryDurableOutbox({ownerId});
    telemetryRemoteSync=createTelemetryRemoteSync({transport,outbox:telemetryOutbox,getToken:async()=>{await refreshSessionIfNeeded();return currentToken();},isOnline:()=>navigator.onLine!==false,onDiagnostic:(code,error)=>reportDiagnostic(code,error)});
    commandBus=createCommandBus({transport,repository:operationRepository,getToken:async()=>{await refreshSessionIfNeeded();return currentToken();},rehydrate:hydrate,registry:runtimeRegistry.registry.length?runtimeRegistry.registry:M26_COMMAND_REGISTRY,getRole:()=>store.getState().identity?.role});
    const service=createEngagementCommandService({commandBus,installedRegistry:installed,getRole:()=>store.getState().identity?.role,isOnline:()=>navigator.onLine!==false});
    adminService=createAdminCommandService({transport:adminTransport,getToken:async()=>{await refreshSessionIfNeeded();return currentToken();},getAdminState:()=>store.getState().admin,isOnline:()=>navigator.onLine!==false,refreshState:hydrate});
    communicationService=createCommunicationService({transport:communicationTransport,getToken:async()=>{await refreshSessionIfNeeded();return currentToken();},getState:()=>store.getState().communication,getRole:()=>store.getState().identity?.role,isOnline:()=>navigator.onLine!==false,refreshState:hydrate});
    recoveryCoordinator=createExecutionRecoveryCoordinator({store:createExecutionRecoveryStore({ownerId}),commandBus,isOnline:()=>navigator.onLine!==false});
    iriExternalReports=createIriExternalReportController({root,store,runtime,getToken:async()=>{await refreshSessionIfNeeded();return currentToken();},isOnline:()=>navigator.onLine!==false});
    shell=createShellController({root,store,renderRoute});
    productivity=createCoachProductivityController({root,store,ownerId});
    motion=createM26MotionController({root});
    guidance=createContextualGuidanceController({root});
    workflow=createWorkflowController({root,store,commandBus,catalog,mediaMap,draftRepository,getRegistry:()=>runtimeRegistry.registry,onRender:render,getIriExternalReport:(assessmentId)=>iriExternalReports.clientReportForPdf(assessmentId),createClientDraft:async(payload)=>{await refreshSessionIfNeeded();await transport.clientOnboardingPreflight(currentToken());const result=await transport.createClientDraft(currentToken(),payload);const verified=await waitForCreatedClient({result,payload,fetchSnapshot:()=>transport.bootstrap(currentToken())});await hydrate({reason:'client-created'});return verified;}});
    engagement=createEngagementController({root,store,draftRepository,service,refreshState:({reason}={})=>hydrate({reason:reason||'engagement-refresh'})});wearables=createWearableController({root,store,transport,getToken:async()=>{await refreshSessionIfNeeded();return currentToken();},refreshState:({reason}={})=>hydrate({reason:reason||'wearables-refresh'}),isOnline:()=>navigator.onLine!==false});verification=createVerificationController({root,commandBus,repository:operationRepository,store});
    rc39=createRc39Controller({root,store,commandBus,transport:rc39Transport,getToken:async()=>{await refreshSessionIfNeeded();return currentToken();},refreshState:hydrate,render});
    communication=createCommunicationController({root,store,service:communicationService,render});
    admin=createAdminController({root,store,service:adminService,render});
    sessionController=createSessionController({root,telemetryOutbox,telemetryRemoteSync,getContext:()=>({...(sessionUi||{}),catalog,commandBus,online:navigator.onLine!==false,recoveryCoordinator,setQuery:(query)=>{if(sessionUi)sessionUi.query=query;},autosaveDraft:saveSessionDraft,saveTemplate:saveCurrentSessionTemplate,loadTemplate:loadCurrentSessionTemplate,onPublished:async()=>{const clientId=sessionUi?.draft?.clientId;await clearSessionDraft(clientId);sessionUi=null;store.navigate('sesion');},onExit:exitSessionWorkspace,appointmentId:sessionUi?.appointmentId||null,sessionRevision:sessionUi?.session?.revision||0}),render,onError:(error)=>{if(sessionUi){sessionUi.actionState.status='error';sessionUi.actionState.message=friendlyError(error);}render();}});
    root.addEventListener('click',guardSessionNavigation,true);shell.mount();motion.mount();guidance.mount();productivity.mount();workflow.mount();engagement.mount();wearables.mount();verification.mount();rc39.mount();communication.mount();admin.mount();sessionController.mount();iriExternalReports.mount();await refreshVerificationState({repository:operationRepository,store});
    root.addEventListener('m26:logout',onLogout);root.addEventListener('m26:switch-role',onSwitchRole);root.addEventListener('m26:open-session-builder',onOpenBuilderEvent);root.addEventListener('m26:start-session',onStartSessionEvent);root.addEventListener('m26:inspect-operation',onInspectOperation);
    const sync=createConnectivitySync({coordinator:recoveryCoordinator,onResult:async()=>{await refreshVerificationState({repository:operationRepository,store});render();}});connectivityStop=sync.start();telemetrySyncStop=telemetryRemoteSync.start();void registerM26ServiceWorker({url:'/m26/sw.js',scope:'/m26/'}).catch(()=>{});
    if(!pendingIriExternalReportIntent)await restoreExecution();render();await consumePendingIriExternalReportIntent();
  }
  function guardSessionNavigation(event){const route=event.target.closest?.('[data-m26-area]')?.getAttribute?.('data-m26-area');if(!route||route==='sesion'||!sessionUi)return;const terminalStatus=String(sessionUi.execution?.status||'').toLowerCase();if(['completed','cancelled'].includes(terminalStatus)){sessionUi=null;return;}event.preventDefault();event.stopImmediatePropagation();sessionUi.actionState.status='retry';sessionUi.actionState.message='Finaliza, cancela o sal de la sesión antes de cambiar de módulo.';render();}
  function exitSessionWorkspace(){sessionUi=null;store.navigate('sesion');render();}
  async function onOpenBuilder(event){const clientId=String(event?.detail?.clientId||'');const state=store.getState();const visible=new Set((state.collections.clients||[]).map((item)=>item.id));if(!visible.has(clientId)||(state.identity?.role==='client'&&state.identity?.clientId!==clientId))throw new Error('M26_CLIENT_SCOPE_FORBIDDEN');const sourceSession=event?.detail?.sourceSession||null;const saved=sourceSession?null:await loadSessionDraft(clientId);const draft=sourceSession?createReusableSessionDraft(sourceSession,{clientId,catalog}):saved?.value?.clientId===clientId?saved.value:createSessionDraft({clientId});sessionUi={draft,query:'',templates:sessionTemplateRepository?.list?.()||[],actionState:createActionState(),execution:null,session:null};if(sourceSession)sessionUi.actionState={...sessionUi.actionState,status:'success',message:'Sesión reutilizada como borrador independiente. Revisa y publica solo cuando corresponda.'};else if(saved)sessionUi.actionState={...sessionUi.actionState,status:'success',message:'Borrador recuperado de forma segura.'};store.navigate('sesion');render();}
  async function onStartSession(event){
    const clientId=String(event?.detail?.clientId||'');const state=store.getState();const visible=new Set((state.collections.clients||[]).map((item)=>item.id));if(!visible.has(clientId)||(state.identity?.role==='client'&&state.identity?.clientId!==clientId))throw new Error('M26_CLIENT_SCOPE_FORBIDDEN');const recovered=await recoveryCoordinator?.latest?.({clientId});if(recovered){sessionUi={draft:null,query:'',actionState:{...createActionState(),status:'success',message:'Sesión recuperada desde este dispositivo.'},session:recovered.session,execution:recovered.execution,appointmentId:recovered.appointmentId||null};store.navigate('sesion');render();return;}
    const normalized=normalizePublishedSession(event.detail.session);if(normalized.clientId!==clientId)throw new Error('M26_SESSION_CLIENT_MISMATCH');const role=String(state.identity?.role||'');if(!normalized.id||!normalized.clientId||!normalized.blocks.length){const node=root.querySelector?.('[data-workflow-status="session"]');if(node){node.textContent='La sesión publicada no contiene bloques ejecutables.';node.dataset.status='error';}return;}    const appointment=confirmedAppointmentForSession(store.getState().collections.appointments||[],normalized);if(!actorCanExecuteSession({role,session:event.detail.session,appointment}))throw new Error('M26_SESSION_EXECUTION_FORBIDDEN');if(sessionRequiresConfirmedAppointment({role,session:event.detail.session,appointment})&&!appointment?.id){const node=root.querySelector?.('[data-workflow-status="session"]');if(node){node.textContent='Se requiere una cita confirmada y vigente para iniciar la sesión.';node.dataset.status='error';}return;}
    sessionUi={draft:null,query:'',actionState:createActionState(),session:normalized,execution:createExecution({session:normalized,clientId:normalized.clientId}),appointmentId:appointment?.id||null};store.navigate('sesion');render();
  }
  async function onSwitchRole(event){
    const role=String(event?.detail?.role||'').trim().toLowerCase();
    const allowed=store.getState().identity?.authorizedRoles||[];
    if(!allowed.includes(role))throw new Error('M26_ROLE_SWITCH_FORBIDDEN');
    if(sessionUi){
      try{globalThis.dispatchEvent(new CustomEvent('m26:toast',{detail:{message:'Finaliza o cierra la sesión antes de cambiar de aplicación.'}}));}catch{}
      return false;
    }
    const previous=activeApplicationRole;
    activeApplicationRole=role;
    try{
      await hydrate({reason:'role-switch'});
      render();
      return true;
    }catch(error){
      activeApplicationRole=previous;
      throw error;
    }
  }
  function onInspectOperation(event){const operation=event.detail?.operation;const message=operation?`Operación ${castilianStatusLabel(operation.status).toLowerCase()}. ${operation.errorCode?'Requiere revisión.':'Sin incidencias registradas.'}`:'Operación no encontrada';globalThis.dispatchEvent(new CustomEvent('m26:toast',{detail:{message}}));}
  function onLogout(){const token=currentToken();vault.clear();session=null;activeApplicationRole=null;refreshInFlight=null;destroyControllers();store.reset();authMessage('Sesión cerrada de forma segura.');void transport?.logout?.(token).catch(()=>{});}
  function destroyControllers(){telemetrySyncStop?.();telemetrySyncStop=null;connectivityStop?.();connectivityStop=null;iriExternalReports?.destroy?.();sessionController?.destroy?.();admin?.destroy?.();communication?.destroy?.();rc39?.destroy?.();verification?.destroy?.();engagement?.destroy?.();wearables?.destroy?.();guidance?.destroy?.();motion?.destroy?.();productivity?.destroy?.();workflow?.destroy?.();shell?.destroy?.();iriExternalReports=null;admin=null;adminService=null;communication=null;communicationService=null;rc39=null;sessionController=verification=wearables=engagement=workflow=guidance=motion=productivity=shell=null;sessionUi=null;operationRepository=draftRepository=sessionTemplateRepository=commandBus=recoveryCoordinator=null;telemetryRemoteSync=telemetryOutbox=null;root.removeEventListener('click',guardSessionNavigation,true);root.removeEventListener('m26:logout',onLogout);root.removeEventListener('m26:switch-role',onSwitchRole);root.removeEventListener('m26:open-session-builder',onOpenBuilderEvent);root.removeEventListener('m26:start-session',onStartSessionEvent);root.removeEventListener('m26:inspect-operation',onInspectOperation);}
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

  if (!runtime.enabled) {
    throw new Error('M26_BACKEND_DISABLED');
  }

  const confirmation =
    recoveryRequestConfirmation(runtime);

  const redirectTo =
    recoveryRedirectForRuntime(
      runtime,
      locationLike
    );

  loginBusy = true;
  authMode = 'request-recovery';
  authMessage('Enviando enlace de recuperación…');

  try {
    await transport.requestPasswordRecovery(
      email,
      redirectTo
    );

    loginBusy = false;
    authMessage(confirmation);

    return true;
  } catch (error) {
    loginBusy = false;

    if (/QA_ACCOUNT_REQUIRED/.test(String(error?.message || error || ''))) {
      authMessage(confirmation);
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
  async function login(email,password){if(loginBusy)return false;if(!runtime.enabled)throw new Error('M26_BACKEND_DISABLED');loginBusy=true;authMessage('Confirmando identidad y permisos…');try{session=await transport.login(email,password);vault.save(session);store.reset();await setupAuthenticated();return true;}catch(error){vault.clear();session=null;destroyControllers();store.reset();loginBusy=false;const incident=diagnosticCode(error,'login');authMessage(`${friendlyError(error)} Código: ${incident}.`,'error');throw error;}finally{loginBusy=false;}}
  async function resume(){if(!runtime.enabled){authMessage('El acceso no está disponible temporalmente en este sitio.');return false;}session=vault.load();if(!session){authMessage();return false;}try{await setupAuthenticated();return true;}catch{vault.clear();session=null;destroyControllers();store.reset();authMessage('La sesión expiró o perdió autorización. Vuelve a entrar.');return false;}}
  async function onSubmit(event) {
  const form = event.target.closest?.('[data-auth-form]');

  if (!form) return;

  event.preventDefault();

  if (loginBusy) return;

  const formType = form.getAttribute('data-auth-form');
  const data = new FormData(form);

  if (formType === 'login') {
    try {
      await login(
        data.get('email'),
        data.get('password')
      );
    } catch (error) {
      reportDiagnostic('login', error);
    }

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
  sanitizePendingIriExternalReportIntent();
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
      runtime.enabled
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

export const __applicationInternals=Object.freeze({normalizePublishedSession,publishedSessionForClient,confirmedAppointmentForSession,friendlyError,recoveryNetworkError,recoveryPasswordError,invalidRecoverySession,recoveryRequestConfirmation,recoveryRedirectForRuntime,RECOVERY_REQUEST_CONFIRMATION,RECOVERY_REQUEST_CONFIRMATION_PUBLIC,RECOVERY_LINK_INVALID,APPOINTMENT_EARLY_WINDOW_MS,APPOINTMENT_LATE_WINDOW_MS});
