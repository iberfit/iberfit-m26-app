import {
  appointmentConfirmationState,
  buildClientPlanningItems,
  clientSessionProjection,
  appointmentForSession,
} from './session-policy.js';
import {normalizeAuthorizedRoles,canSwitchApplication,requiresRoleChoice} from './multi-role.js';
import {deriveCoachLaunchJourney} from '../admin/view-model.js';
import {computeProgressSummary} from '../engagement/progress-engine.js';

const field=(record,...keys)=>{
  const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};
  for(const key of keys){
    const value=record?.[key]??body?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
};
const clone=(value)=>value==null?value:structuredClone(value);
const appointmentId=(record)=>String(field(record,'id','entityId','entity_id')||'');
const clientId=(record)=>String(field(record,'clientId','client_id')||'');
const sessionId=(record)=>String(field(record,'id','entityId','entity_id')||'');
const dateMs=(value)=>{
  const time=value?new Date(value).getTime():NaN;
  return Number.isFinite(time)?time:null;
};
const list=(value)=>Array.isArray(value)?value:[];
const recordId=(record)=>String(field(record,'id','entityId','entity_id')||'').trim();
const recordClientId=(record)=>String(field(record,'clientId','client_id')||recordId(record)).trim();
const statusOf=(record)=>String(field(record,'status','estado')||'').trim().toLowerCase();
const publishedAtOf=(record)=>field(record,'publishedAt','published_at');
const isPublishedSession=(record)=>{
  const status=statusOf(record);
  return status==='publicado'||status==='published'||Boolean(publishedAtOf(record));
};
const COACH_LAUNCH_SELF_COPY=Object.freeze({
  es:Object.freeze({
    eyebrow:'Puesta en marcha',title:'Tu recorrido como Coach',intro:'Solo marcamos como completado lo que puede demostrarse con datos de tu sesión y de tu cartera autorizada.',progress:(done,total)=>`${done} de ${total} hitos verificados`,ready:'Coach listo',pending:'Verificación incompleta',adminTitle:'Verificación administrativa pendiente',adminCopy:'Tu perfil profesional y el estado operativo de la cuenta no forman parte del bootstrap Coach actual. IBERFIT los mantiene pendientes en lugar de asumirlos.',evidenceTitle:'Evidencia utilizada',evidenceCopy:'Acceso autenticado, clientes dentro de tu alcance, planificación publicada y ejecuciones confirmadas. No se amplían permisos.',nextTitle:'Siguiente paso operativo',noAction:'No necesitas completar otra acción operativa desde esta tarjeta. La verificación restante depende de Administración.',
    milestones:Object.freeze({invited:{label:'Identidad Coach',done:'Identidad autenticada visible',pending:'Identidad no disponible'},activated:{label:'Primer acceso',done:'Sesión autenticada confirmada',pending:'Acceso no confirmado'},profile:{label:'Perfil operativo',done:'Perfil verificado',pending:'Pendiente de verificación administrativa'},client:{label:'Primer cliente',done:'Cliente asignado dentro de tu alcance',pending:'Sin cliente asignado visible'},planning:{label:'Primera planificación',done:'Sesión publicada visible',pending:'Sin planificación publicada visible'},session:{label:'Primera sesión',done:'Ejecución completada y confirmada',pending:'Sin sesión completada confirmada'}}),
    actions:Object.freeze({clients:'Revisar cartera',planning:'Preparar primera planificación',session:'Revisar primera sesión'}),
  }),
  en:Object.freeze({
    eyebrow:'Getting started',title:'Your Coach journey',intro:'A milestone is only marked complete when it can be demonstrated from your authenticated session and authorised portfolio data.',progress:(done,total)=>`${done} of ${total} milestones verified`,ready:'Coach ready',pending:'Verification incomplete',adminTitle:'Administrative verification pending',adminCopy:'Your professional profile and operational account status are not exposed by the current Coach bootstrap. IBERFIT keeps them pending instead of assuming them.',evidenceTitle:'Evidence used',evidenceCopy:'Authenticated access, clients in your authorised scope, published planning and confirmed executions. Permissions are not expanded.',nextTitle:'Next operational step',noAction:'There is no further operational action to complete from this card. The remaining verification depends on Administration.',
    milestones:Object.freeze({invited:{label:'Coach identity',done:'Authenticated identity visible',pending:'Identity unavailable'},activated:{label:'First access',done:'Authenticated session confirmed',pending:'Access not confirmed'},profile:{label:'Operational profile',done:'Profile verified',pending:'Pending administrative verification'},client:{label:'First client',done:'Assigned client visible in your scope',pending:'No assigned client visible'},planning:{label:'First plan',done:'Published session visible',pending:'No published planning visible'},session:{label:'First session',done:'Completed confirmed execution',pending:'No confirmed completed session'}}),
    actions:Object.freeze({clients:'Review portfolio',planning:'Prepare first plan',session:'Review first session'}),
  }),
  fr:Object.freeze({
    eyebrow:'Mise en route',title:'Votre parcours Coach',intro:'Une étape est validée uniquement lorsqu’elle peut être démontrée par votre session authentifiée et les données de votre portefeuille autorisé.',progress:(done,total)=>`${done} étapes vérifiées sur ${total}`,ready:'Coach prêt',pending:'Vérification incomplète',adminTitle:'Vérification administrative en attente',adminCopy:'Votre profil professionnel et l’état opérationnel du compte ne sont pas exposés par le bootstrap Coach actuel. IBERFIT les laisse en attente au lieu de les supposer.',evidenceTitle:'Preuves utilisées',evidenceCopy:'Accès authentifié, clients de votre périmètre autorisé, planification publiée et exécutions confirmées. Aucun droit supplémentaire n’est accordé.',nextTitle:'Prochaine étape opérationnelle',noAction:'Aucune autre action opérationnelle n’est requise depuis cette carte. La vérification restante dépend de l’Administration.',
    milestones:Object.freeze({invited:{label:'Identité Coach',done:'Identité authentifiée visible',pending:'Identité indisponible'},activated:{label:'Premier accès',done:'Session authentifiée confirmée',pending:'Accès non confirmé'},profile:{label:'Profil opérationnel',done:'Profil vérifié',pending:'Vérification administrative en attente'},client:{label:'Premier client',done:'Client affecté visible dans votre périmètre',pending:'Aucun client affecté visible'},planning:{label:'Première planification',done:'Séance publiée visible',pending:'Aucune planification publiée visible'},session:{label:'Première séance',done:'Exécution terminée et confirmée',pending:'Aucune séance terminée confirmée'}}),
    actions:Object.freeze({clients:'Voir le portefeuille',planning:'Préparer la première planification',session:'Voir la première séance'}),
  }),
  pt:Object.freeze({
    eyebrow:'Configuração inicial',title:'O seu percurso como Coach',intro:'Uma etapa só é marcada como concluída quando pode ser demonstrada pela sua sessão autenticada e pelos dados da carteira autorizada.',progress:(done,total)=>`${done} de ${total} etapas verificadas`,ready:'Coach pronto',pending:'Verificação incompleta',adminTitle:'Verificação administrativa pendente',adminCopy:'O seu perfil profissional e o estado operacional da conta não são expostos pelo bootstrap Coach atual. O IBERFIT mantém-nos pendentes em vez de os assumir.',evidenceTitle:'Evidência utilizada',evidenceCopy:'Acesso autenticado, clientes no seu âmbito autorizado, planeamento publicado e execuções confirmadas. As permissões não são ampliadas.',nextTitle:'Próximo passo operacional',noAction:'Não existe outra ação operacional a concluir a partir deste cartão. A verificação restante depende da Administração.',
    milestones:Object.freeze({invited:{label:'Identidade Coach',done:'Identidade autenticada visível',pending:'Identidade indisponível'},activated:{label:'Primeiro acesso',done:'Sessão autenticada confirmada',pending:'Acesso não confirmado'},profile:{label:'Perfil operacional',done:'Perfil verificado',pending:'Verificação administrativa pendente'},client:{label:'Primeiro cliente',done:'Cliente atribuído visível no seu âmbito',pending:'Nenhum cliente atribuído visível'},planning:{label:'Primeiro planeamento',done:'Sessão publicada visível',pending:'Nenhum planeamento publicado visível'},session:{label:'Primeira sessão',done:'Execução concluída e confirmada',pending:'Nenhuma sessão concluída confirmada'}}),
    actions:Object.freeze({clients:'Rever carteira',planning:'Preparar primeiro planeamento',session:'Rever primeira sessão'}),
  }),
});
export function coachLaunchSelfCopy(language='es'){
  const key=String(language||'es').trim().toLowerCase();
  return COACH_LAUNCH_SELF_COPY[key]||COACH_LAUNCH_SELF_COPY.es;
}
export function coachLaunchSelfLanguages(){return Object.freeze(Object.keys(COACH_LAUNCH_SELF_COPY));}
function hasConfirmedCompletedSession(state,clients,now){
  for(const client of clients){
    const id=recordClientId(client);
    if(!id)continue;
    const summary=computeProgressSummary(state,id,{now});
    if(Number(summary?.completedSessions||0)>0)return true;
  }
  return false;
}
function nextCoachAction(milestones){
  const byId=new Map(milestones.map((item)=>[item.id,item]));
  if(!byId.get('client')?.complete)return Object.freeze({area:'clientes',labelKey:'clients'});
  if(!byId.get('planning')?.complete)return Object.freeze({area:'planificacion',labelKey:'planning'});
  if(!byId.get('session')?.complete)return Object.freeze({area:'agenda',labelKey:'session'});
  return null;
}
export function deriveCoachSelfLaunchJourney({state,identity=null,now=new Date()}={}){
  const role=String(identity?.role||state?.identity?.role||'').trim().toLowerCase();
  if(role!=='coach')return null;
  const coachId=String(identity?.id||state?.identity?.id||'').trim();
  if(!coachId)return null;
  const clients=list(state?.collections?.clients);
  const sessions=list(state?.collections?.sessions);
  const parsedNow=now instanceof Date&&!Number.isNaN(now.getTime())?now:new Date(now);
  const effectiveNow=Number.isNaN(parsedNow.getTime())?new Date():parsedNow;
  const authenticatedAt=state?.hydration?.serverTime||effectiveNow.toISOString();
  const user=Object.freeze({id:coachId,userId:coachId,primaryRole:'coach',roles:Object.freeze(['coach']),status:'',lastAccessAt:authenticatedAt});
  const assignments=Object.freeze(clients.map((client)=>Object.freeze({coachUserId:coachId,clientId:recordClientId(client),status:'active'})).filter((item)=>item.clientId));
  const planningEvidence=sessions.filter(isPublishedSession).map((session)=>Object.freeze({sessionId:recordId(session),status:''})).filter((item)=>item.sessionId);
  const completed=hasConfirmedCompletedSession(state,clients,effectiveNow);
  const evidenceSessions=Object.freeze([...planningEvidence,...(completed?[Object.freeze({status:'completed'})]:[])]);
  const base=deriveCoachLaunchJourney({user,coach:null,assignments,sessions:evidenceSessions});
  return Object.freeze({...base,source:'authenticated-coach-bootstrap',coachId,profileVerified:false,accountStatusVerified:false,clientEvidenceCount:assignments.length,publishedPlanningEvidenceCount:planningEvidence.length,completedSessionEvidence:completed,nextCoachAction:nextCoachAction(base.milestones)});
}
const compactAppointment=(record,now)=>Object.freeze({
  raw:clone(record),
  id:appointmentId(record),
  clientId:clientId(record),
  sessionId:String(field(record,'sessionId','session_id')||''),
  title:String(field(record,'title','titulo','name','nombre')||'Sesión IBERFIT'),
  startAt:field(record,'startAt','start_at','scheduledAt','scheduled_at','date'),
  endAt:field(record,'endAt','end_at'),
  location:String(field(record,'location','ubicacion')||''),
  modality:String(field(record,'modality','modalidad')||''),
  status:String(field(record,'status','estado')||''),
  revision:Number(field(record,'revision')||0),
  confirmation:appointmentConfirmationState(record,now),
  changeRequest:clone(field(record,'changeRequest','change_request')),
});
export function augmentRc39ViewModel(vm,shellVm,state,now=new Date()){
  if(!vm||!shellVm||!state)return vm;
  const role=String(shellVm.identity?.role||state.identity?.role||'');
  const sessions=state.collections?.sessions||[];
  const appointments=state.collections?.appointments||[];
  const routeClientId=role==='client'?state.identity?.clientId:state.selectedClientId;
  const relevantSessions=sessions.filter((item)=>!routeClientId||clientId(item)===String(routeClientId));
  const relevantAppointments=appointments.filter((item)=>!routeClientId||clientId(item)===String(routeClientId));
  const changeRequestAvailable=state?.environment?.rc39?.appointmentChangeRequests===true;
  const planningItems=Object.freeze(buildClientPlanningItems({sessions:relevantSessions,appointments:relevantAppointments,now}).map((item)=>Object.freeze({...item,changeRequestAvailable})));
  const operationalAppointments=(role==='client'?relevantAppointments:appointments).map((item)=>compactAppointment(item,now)).sort((a,b)=>(dateMs(a.startAt)??Number.MAX_SAFE_INTEGER)-(dateMs(b.startAt)??Number.MAX_SAFE_INTEGER));
  const sessionProjections=relevantSessions.map((session)=>clientSessionProjection(session,appointmentForSession(relevantAppointments,session),now));
  const needsPreparation=sessionProjections.filter((item)=>!item.session?.blocks?.length).length;
  const confirmationOpen=operationalAppointments.filter((item)=>item.confirmation.state==='open').length;
  const changeRequests=operationalAppointments.filter((item)=>item.confirmation.state==='change_requested').length;
  const coachLaunchJourney=role==='coach'?deriveCoachSelfLaunchJourney({state,identity:shellVm.identity||state.identity,now}):null;
  return Object.freeze({...vm,rc39:Object.freeze({role,clientId:routeClientId||null,planningItems,appointments:Object.freeze(operationalAppointments),sessionProjections:Object.freeze(sessionProjections),needsPreparation,confirmationOpen,changeRequests,changeRequestAvailable,coachLaunchJourney,generatedAt:new Date(now).toISOString()})});
}
export function augmentRc39ShellViewModel(vm,state){
  if(!vm||vm.mode!=='authenticated')return vm;
  const authorizedRoles=normalizeAuthorizedRoles(state?.identity||vm.identity);
  const identity=Object.freeze({...vm.identity,email:state?.identity?.email||null,authorizedRoles});
  const snapshotNow=state?.hydration?.serverTime||new Date();
  const coachLaunchJourney=identity.role==='coach'
    ?deriveCoachSelfLaunchJourney({state,identity,now:snapshotNow})
    :null;
  return Object.freeze({...vm,identity,coachLaunchJourney,canSwitchApplication:canSwitchApplication({...identity,authorizedRoles}),needsRoleChoice:requiresRoleChoice({...state?.identity,...identity,authorizedRoles})});
}
