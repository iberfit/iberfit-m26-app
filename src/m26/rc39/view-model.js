import {
  appointmentConfirmationState,
  buildClientPlanningItems,
  clientSessionProjection,
  appointmentForSession,
} from './session-policy.js';
import {normalizeAuthorizedRoles,canSwitchApplication,requiresRoleChoice} from './multi-role.js';

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
