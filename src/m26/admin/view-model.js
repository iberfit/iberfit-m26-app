import {adminCan,ADMIN_CAPABILITIES,routeAllowedForAdmin} from './permission-policy.js';
import {adminCollection} from './admin-state.js';
import {clientsOverview} from '../modules/domain-selectors.js';
import {deriveClientExperience,experienceNextAction} from '../experience/client-experience.js';
import {buildAdaptiveSessionContext} from '../intelligence/adaptive-context.js';
import {deriveAdaptiveExperience} from '../experience/adaptive-experience.js';
import {deriveAdminCommandCenter} from './command-center.js';
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
export function augmentAdminShellViewModel(vm,state){if(vm?.mode!=='authenticated'||vm?.identity?.role!=='admin')return vm;return Object.freeze({...vm,selectedClient:null,clientOptions:Object.freeze([]),canChangeClient:false,admin:Object.freeze({available:state?.admin?.available===true,reason:state?.admin?.reason||null,organization:clone(state?.admin?.organization||null),summary:clone(state?.admin?.summary||{})})});}
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
    const assignments=Object.freeze(clone(adminCollection(state,'coachClientAssignments')).map((assignment)=>Object.freeze({
      ...assignment,
      coachName:String(coachById.get(String(assignment.coachUserId||''))?.name||coachById.get(String(assignment.coachUserId||''))?.email||'Coach'),
      clientName:String(clientById.get(String(assignment.clientId||''))?.name||'Cliente'),
    })));
    return Object.freeze({...common,kind:'admin-equipo',coaches,assignments,clients,canManage:adminCan(state.admin,ADMIN_CAPABILITIES.ASSIGNMENT_MANAGE)});
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
