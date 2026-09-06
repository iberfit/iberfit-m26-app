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
  const user=Object.freeze({
    id:coachId,
    userId:coachId,
    primaryRole:'coach',
    roles:Object.freeze(['coach']),
    status:'',
    lastAccessAt:authenticatedAt,
  });
  const assignments=Object.freeze(clients.map((client)=>Object.freeze({
    coachUserId:coachId,
    clientId:recordClientId(client),
    status:'active',
  })).filter((item)=>item.clientId));
  const planningEvidence=sessions
    .filter(isPublishedSession)
    .map((session)=>Object.freeze({sessionId:recordId(session),status:''}))
    .filter((item)=>item.sessionId);
  const completed=hasConfirmedCompletedSession(state,clients,effectiveNow);
  const evidenceSessions=Object.freeze([
    ...planningEvidence,
    ...(completed?[Object.freeze({status:'completed'})]:[]),
  ]);
  const base=deriveCoachLaunchJourney({user,coach:null,assignments,sessions:evidenceSessions});
  return Object.freeze({
    ...base,
    source:'authenticated-coach-bootstrap',
    coachId,
    profileVerified:false,
    accountStatusVerified:false,
    clientEvidenceCount:assignments.length,
    publishedPlanningEvidenceCount:planningEvidence.length,
    completedSessionEvidence:completed,
    nextCoachAction:nextCoachAction(base.milestones),
  });
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
  const planningItems=Object.freeze(
    buildClientPlanningItems({sessions:relevantSessions,appointments:relevantAppointments,now})
      .map((item)=>Object.freeze({...item,changeRequestAvailable}))
  );
  const operationalAppointments=(role==='client'?relevantAppointments:appointments)
    .map((item)=>compactAppointment(item,now))
    .sort((a,b)=>(dateMs(a.startAt)??Number.MAX_SAFE_INTEGER)-(dateMs(b.startAt)??Number.MAX_SAFE_INTEGER));
  const sessionProjections=relevantSessions.map((session)=>
    clientSessionProjection(session,appointmentForSession(relevantAppointments,session),now)
  );
  const needsPreparation=sessionProjections.filter((item)=>!item.session?.blocks?.length).length;
  const confirmationOpen=operationalAppointments.filter((item)=>item.confirmation.state==='open').length;
  const changeRequests=operationalAppointments.filter((item)=>item.confirmation.state==='change_requested').length;
  const coachLaunchJourney=role==='coach'
    ?deriveCoachSelfLaunchJourney({state,identity:shellVm.identity||state.identity,now})
    :null;
  return Object.freeze({
    ...vm,
    rc39:Object.freeze({
      role,
      clientId:routeClientId||null,
      planningItems,
      appointments:Object.freeze(operationalAppointments),
      sessionProjections:Object.freeze(sessionProjections),
      needsPreparation,
      confirmationOpen,
      changeRequests,
      changeRequestAvailable,
      coachLaunchJourney,
      generatedAt:new Date(now).toISOString(),
    }),
  });
}
export function augmentRc39ShellViewModel(vm,state){
  if(!vm||vm.mode!=='authenticated')return vm;
  const authorizedRoles=normalizeAuthorizedRoles(state?.identity||vm.identity);
  const identity=Object.freeze({
    ...vm.identity,
    email:state?.identity?.email||null,
    authorizedRoles,
  });
  return Object.freeze({
    ...vm,
    identity,
    canSwitchApplication:canSwitchApplication({...identity,authorizedRoles}),
    needsRoleChoice:requiresRoleChoice({...state?.identity,...identity,authorizedRoles}),
  });
}
