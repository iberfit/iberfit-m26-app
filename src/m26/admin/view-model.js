import {adminCan,ADMIN_CAPABILITIES,routeAllowedForAdmin} from './permission-policy.js';
import {adminCollection} from './admin-state.js';
import {clientsOverview} from '../modules/domain-selectors.js';
import {deriveClientExperience,experienceNextAction} from '../experience/client-experience.js';
import {buildAdaptiveSessionContext} from '../intelligence/adaptive-context.js';
import {deriveAdaptiveExperience} from '../experience/adaptive-experience.js';
import {deriveAdminCommandCenter} from './command-center.js';
import {readIberfitExperiencePreferences} from '../ui/preferences.js';
const clone=(v)=>v==null?v:structuredClone(v);
function clientRows(state){
  const life=new Map(adminCollection(state,'clientLifecycle').map((x)=>[String(x.clientId),x]));
  const assignments=new Map();
  for(const x of adminCollection(state,'coachClientAssignments')){
    if(x.status!=='active')continue;
    const list=assignments.get(String(x.clientId))||[];
    list.push(x);
    assignments.set(String(x.clientId),list);
  }
  const coaches=new Map(adminCollection(state,'coachProfiles').map((x)=>[String(x.userId||x.id),x]));
  const summaries=new Map(clientsOverview(state).map((summary)=>[String(summary?.client?.id||''),summary]));
  return Object.freeze((state.collections?.clients||[]).map((x)=>{
    const id=String(x.id||'');
    const summary=summaries.get(id)||{client:x};
    const experience=deriveClientExperience(summary);
    const structuralNextAction=experienceNextAction(experience,{role:'admin'});
    const rawNow=state?.hydration?.serverTime;
    const parsedNow=rawNow?new Date(rawNow):new Date();
    const now=!Number.isNaN(parsedNow.getTime())?parsedNow:new Date();
    const adaptiveContext=buildAdaptiveSessionContext(state,id,{now});
    const adaptiveExperience=deriveAdaptiveExperience({experience,baseAction:structuralNextAction,adaptiveContext,role:'admin'});
    const nextAction=adaptiveExperience.action;
    const activeAssignments=Object.freeze(clone(assignments.get(id)||[]));
    const coachNames=Object.freeze(activeAssignments.map((assignment)=>{
      const coach=coaches.get(String(assignment.coachUserId||''));
      return String(coach?.name||coach?.email||'').trim();
    }).filter(Boolean));
    return Object.freeze({
      id,
      name:String(x.name||x.nombre||'Cliente'),
      email:String(x.email||'').trim(),
      status:String(x.status||''),
      modality:String(x.modality||x.modalidad||''),
      lifecycle:clone(life.get(id)||null),
      assignments:activeAssignments,
      coachNames,
      primaryCoachName:coachNames[0]||null,
      experience,
      adaptiveExperience,
      nextAction,
    });
  }));
}
function recordId(value){return String(value??'').trim();}
function appointmentCoachId(item={}){return recordId(item.coachUserId??item.coach_user_id??item.coachId??item.coach_id??item.trainerUserId??item.trainer_user_id);}
function appointmentClientId(item={}){return recordId(item.clientId??item.client_id);}
function appointmentStart(item={}){return item.startAt??item.start_at??item.startsAt??item.starts_at??item.scheduledAt??item.scheduled_at??item.date??null;}
function dateTime(value){const parsed=value?new Date(value):null;return parsed&&!Number.isNaN(parsed.getTime())?parsed:null;}
export function buildCoach360Rows({coaches=[],clients=[],assignments=[],appointments=[],now=new Date()}={}){
  const safeNow=dateTime(now)||new Date();
  const clientById=new Map((clients||[]).map((client)=>[recordId(client?.id),client]));
  const activeAssignments=(assignments||[]).filter((assignment)=>String(assignment?.status||'active').toLowerCase()==='active');
  return Object.freeze((coaches||[]).map((coach)=>{
    const coachId=recordId(coach?.userId||coach?.id);
    const ownAssignments=activeAssignments.filter((assignment)=>recordId(assignment?.coachUserId)===coachId);
    const clientIds=[...new Set(ownAssignments.map((assignment)=>recordId(assignment?.clientId)).filter(Boolean))];
    const coachClients=Object.freeze(clientIds.map((id)=>clientById.get(id)).filter(Boolean).map((client)=>Object.freeze({
      id:recordId(client.id),
      name:String(client.name||'Cliente'),
      email:String(client.email||''),
      status:String(client.lifecycle?.status||client.status||''),
      modality:String(client.modality||''),
      nextActionLabel:String(client.nextAction?.label||client.adaptiveExperience?.action?.label||'Seguimiento'),
    })));
    const sessions=(appointments||[])
      .filter((appointment)=>appointmentCoachId(appointment)===coachId)
      .map((appointment)=>{
        const clientId=appointmentClientId(appointment);
        const client=clientById.get(clientId);
        const startAt=appointmentStart(appointment);
        const when=dateTime(startAt);
        return Object.freeze({
          id:recordId(appointment.id||appointment.sessionId||appointment.session_id),
          clientId,
          clientName:String(client?.name||appointment.clientName||appointment.client_name||'Cliente'),
          title:String(appointment.title||appointment.name||'Entrenamiento'),
          startAt:startAt==null?'':String(startAt),
          timestamp:when?.getTime()??null,
          status:String(appointment.status||''),
          modality:String(appointment.modality||appointment.modalidad||''),
          location:String(appointment.location||appointment.ubicacion||''),
        });
      })
      .sort((a,b)=>(a.timestamp??Number.MAX_SAFE_INTEGER)-(b.timestamp??Number.MAX_SAFE_INTEGER));
    const upcomingSessions=Object.freeze(sessions.filter((session)=>session.timestamp!=null&&session.timestamp>=safeNow.getTime()&&!/cancel/i.test(session.status)).slice(0,8));
    const recentSessions=Object.freeze([...sessions].filter((session)=>session.timestamp!=null&&session.timestamp<safeNow.getTime()).sort((a,b)=>(b.timestamp??0)-(a.timestamp??0)).slice(0,6));
    const capacityHours=Number.isFinite(Number(coach?.capacityHours))?Number(coach.capacityHours):null;
    const assignedHours=Number.isFinite(Number(coach?.assignedHours))?Number(coach.assignedHours):null;
    const loadPercent=capacityHours&&assignedHours!=null?Math.max(0,Math.round((assignedHours/capacityHours)*100)):null;
    return Object.freeze({
      id:recordId(coach?.id),
      coachId,
      name:String(coach?.name||coach?.email||'Coach'),
      email:String(coach?.email||''),
      status:String(coach?.status||''),
      capacityHours,
      assignedHours,
      loadPercent,
      clientCount:coachClients.length,
      clients:coachClients,
      upcomingSessions,
      recentSessions,
      upcomingCount:upcomingSessions.length,
      completedCount:sessions.filter((session)=>/complet|realiz|done/i.test(session.status)).length,
      nextSession:upcomingSessions[0]||null,
      assignmentCount:ownAssignments.length,
    });
  }).sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'})));
}
export function augmentAdminShellViewModel(vm,state){
  if(vm?.mode!=='authenticated'||vm?.identity?.role!=='admin')return vm;
  const preferenceScope=String(vm?.identity?.id||state?.identity?.id||'');
  return Object.freeze({
    ...vm,
    selectedClient:null,
    clientOptions:Object.freeze([]),
    canChangeClient:false,
    experiencePreferences:readIberfitExperiencePreferences(preferenceScope),
    admin:Object.freeze({
      available:state?.admin?.available===true,
      reason:state?.admin?.reason||null,
      organization:clone(state?.admin?.organization||null),
      summary:clone(state?.admin?.summary||{}),
    }),
  });
}
export function createAdminRouteViewModel(base,shellVm,state){const role=String(shellVm?.identity?.role||state?.identity?.role||'');const area=String(shellVm?.activeArea||state?.activeArea||'');if(role!=='admin'||!area.startsWith('admin-'))return base;if(state?.admin?.available!==true)return Object.freeze({...base,admin:true,kind:'admin-unavailable',reason:state?.admin?.reason||'backend_unavailable'});if(!routeAllowedForAdmin(state.admin,area))return Object.freeze({...base,admin:true,kind:'admin-forbidden'});const common={...base,admin:true,area,organization:clone(state.admin.organization),summary:clone(state.admin.summary),analytics:clone(state.admin.analytics)};
  if(area==='admin-inicio'){
    const clients=clientRows(state);
    const coaches=Object.freeze(clone(adminCollection(state,'coachProfiles')));
    const tasks=Object.freeze(clone(adminCollection(state,'operationalTasks')));
    return Object.freeze({...common,kind:'admin-inicio',clients,coaches,tasks:Object.freeze(clone(tasks.slice(0,12))),audit:Object.freeze(clone(adminCollection(state,'auditEvents').slice(0,12))),commandCenter:deriveAdminCommandCenter({clients,coaches,tasks})});
  }
  if(area==='admin-usuarios')return Object.freeze({...common,kind:'admin-usuarios',users:Object.freeze(clone(adminCollection(state,'organizationUsers'))),roles:Object.freeze(clone(adminCollection(state,'applicationRoles'))),canManageStatus:adminCan(state.admin,ADMIN_CAPABILITIES.USER_MANAGE_STATUS),canManageRoles:adminCan(state.admin,ADMIN_CAPABILITIES.ROLE_MANAGE)});
  if(area==='admin-equipo'){
    const coaches=Object.freeze(clone(adminCollection(state,'coachProfiles')));
    const clients=clientRows(state);
    const coachById=new Map(coaches.map((coach)=>[String(coach.userId||coach.id),coach]));
    const clientById=new Map(clients.map((client)=>[String(client.id),client]));
    const rawAssignments=Object.freeze(clone(adminCollection(state,'coachClientAssignments')));
    const assignments=Object.freeze(rawAssignments.map((assignment)=>Object.freeze({
      ...assignment,
      coachName:String(coachById.get(String(assignment.coachUserId||''))?.name||coachById.get(String(assignment.coachUserId||''))?.email||'Coach'),
      clientName:String(clientById.get(String(assignment.clientId||''))?.name||'Cliente'),
    })));
    const rawNow=state?.admin?.serverTime||state?.hydration?.serverTime||new Date();
    const coachProfiles360=buildCoach360Rows({coaches,clients,assignments:rawAssignments,appointments:clone(state.collections?.appointments||[]),now:rawNow});
    return Object.freeze({...common,kind:'admin-equipo',coaches,coachProfiles360,assignments,clients,canManage:adminCan(state.admin,ADMIN_CAPABILITIES.ASSIGNMENT_MANAGE)});
  }
  if(area==='admin-clientes')return Object.freeze({...common,kind:'admin-clientes',leads:Object.freeze(clone(adminCollection(state,'leads'))),clients:clientRows(state),canManage:adminCan(state.admin,ADMIN_CAPABILITIES.CLIENT_LIFECYCLE_MANAGE)});
  if(area==='admin-agenda')return Object.freeze({...common,kind:'admin-agenda',appointments:Object.freeze(clone(state.collections?.appointments||[])),coaches:Object.freeze(clone(adminCollection(state,'coachProfiles')))});
  if(area==='admin-operaciones')return Object.freeze({...common,kind:'admin-operaciones',tasks:Object.freeze(clone(adminCollection(state,'operationalTasks'))),canManage:adminCan(state.admin,ADMIN_CAPABILITIES.OPERATION_MANAGE)});
  if(area==='admin-comunicacion')return Object.freeze({...common,kind:'admin-comunicacion',templates:Object.freeze(clone(adminCollection(state,'notificationTemplates'))),deliveries:Object.freeze(clone(adminCollection(state,'notificationDeliveries'))),canManage:adminCan(state.admin,ADMIN_CAPABILITIES.MESSAGE_MANAGE_TEMPLATES)});
  if(area==='admin-automatizaciones')return Object.freeze({...common,kind:'admin-automatizaciones',rules:Object.freeze(clone(adminCollection(state,'automationRules'))),canManage:adminCan(state.admin,ADMIN_CAPABILITIES.AUTOMATION_MANAGE)});
  if(area==='admin-analitica')return Object.freeze({...common,kind:'admin-analitica',clients:clientRows(state),appointments:Object.freeze(clone(state.collections?.appointments||[]))});
  if(area==='admin-auditoria')return Object.freeze({...common,kind:'admin-auditoria',events:Object.freeze(clone(adminCollection(state,'auditEvents')))});
  if(area==='admin-configuracion')return Object.freeze({...common,kind:'admin-configuracion',canManage:adminCan(state.admin,ADMIN_CAPABILITIES.ORGANIZATION_SETTINGS_MANAGE)});
  return Object.freeze({...common,kind:'admin-forbidden'});
}
