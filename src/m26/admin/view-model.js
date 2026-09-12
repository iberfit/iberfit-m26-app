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
function appointmentSessionId(item={}){return recordId(item.sessionId??item.session_id??item.publishedSessionId??item.published_session_id);}
function dateTime(value){const parsed=value?new Date(value):null;return parsed&&!Number.isNaN(parsed.getTime())?parsed:null;}
function normalizeStatus(value){return String(value??'').trim().toLowerCase();}
function userRoles(user={}){
  const roles=Array.isArray(user?.roles)?user.roles:[];
  return new Set([user?.primaryRole,...roles].map((value)=>String(value??'').trim().toLowerCase()).filter(Boolean));
}
function isCoachUser(user={}){return userRoles(user).has('coach');}
const CLIENT_ACCESS_PRIORITY=Object.freeze({activo:0,invitacion_pendiente:1,suspendido:2,sin_acceso:3,revocado:4});
function clientAccessStatus(value){
  const status=normalizeStatus(value);
  return Object.hasOwn(CLIENT_ACCESS_PRIORITY,status)?status:(status||'sin_acceso');
}
function sortClientAccessRows(rows=[]){
  return [...rows].sort((a,b)=>{
    const left=CLIENT_ACCESS_PRIORITY[clientAccessStatus(a?.status)]??99;
    const right=CLIENT_ACCESS_PRIORITY[clientAccessStatus(b?.status)]??99;
    if(left!==right)return left-right;
    return String(b?.updatedAt||b?.updated_at||'').localeCompare(String(a?.updatedAt||a?.updated_at||''));
  });
}
function accessIntegrityIssue(code,detail={}){
  return Object.freeze({code,...detail});
}
export function buildAdminUser360({
  users=[],
  applicationRoles=[],
  clients=[],
  clientAccess=[],
  coachProfiles=[],
  assignments=[],
}={}){
  const orgUsers=(users||[]).map((user)=>Object.freeze(clone(user)));
  const orgUserIds=new Set(orgUsers.map((user)=>recordId(user?.userId||user?.id)).filter(Boolean));
  const clientById=new Map((clients||[]).map((client)=>[recordId(client?.id),client]));
  const coachById=new Map((coachProfiles||[]).map((coach)=>[recordId(coach?.userId||coach?.id),coach]));
  const rolesByUser=new Map();
  for(const role of applicationRoles||[]){
    if(role?.active!==true)continue;
    const userId=recordId(role?.userId||role?.user_id);
    const value=normalizeStatus(role?.role);
    if(!userId||!['client','coach','admin'].includes(value))continue;
    if(!rolesByUser.has(userId))rolesByUser.set(userId,new Set());
    rolesByUser.get(userId).add(value);
  }
  const accessByUser=new Map();
  const integrityIssues=[];
  for(const access of clientAccess||[]){
    const status=clientAccessStatus(access?.status);
    const authUserId=recordId(access?.authUserId??access?.auth_user_id);
    const clientId=recordId(access?.clientId??access?.client_id);
    if(status==='activo'&&!authUserId){
      integrityIssues.push(accessIntegrityIssue('ACTIVE_ACCESS_WITHOUT_AUTH_USER',{clientId,status}));
    }
    if(authUserId&&!orgUserIds.has(authUserId)){
      integrityIssues.push(accessIntegrityIssue('AUTH_USER_OUTSIDE_ORGANIZATION',{authUserId,clientId,status}));
    }
    if(authUserId){
      const list=accessByUser.get(authUserId)||[];
      list.push(access);
      accessByUser.set(authUserId,list);
    }
  }
  for(const [authUserId,rows] of accessByUser){
    if(rows.length>1){
      integrityIssues.push(accessIntegrityIssue('MULTIPLE_CLIENT_ACCESS_LINKS',{authUserId,count:rows.length}));
    }
  }
  const activeAssignments=(assignments||[]).filter((assignment)=>normalizeStatus(assignment?.status||'active')==='active');
  const rows=orgUsers.map((user)=>{
    const userId=recordId(user?.userId||user?.id);
    const roleSet=userRoles(user);
    for(const role of rolesByUser.get(userId)||[])roleSet.add(role);
    const roles=[...roleSet].filter((role)=>['client','coach','admin'].includes(role));
    const primaryRole=normalizeStatus(user?.primaryRole)||roles[0]||'';
    const linkedAccess=sortClientAccessRows(accessByUser.get(userId)||[]);
    const access=linkedAccess[0]||null;
    const clientId=recordId(access?.clientId??access?.client_id);
    const client=clientId?clientById.get(clientId)||null:null;
    const coach=coachById.get(userId)||null;
    const clientAssignments=clientId?activeAssignments.filter((assignment)=>recordId(assignment?.clientId)===clientId):[];
    const coachAssignments=roles.includes('coach')?activeAssignments.filter((assignment)=>recordId(assignment?.coachUserId)===userId):[];
    const assignedCoachNames=clientAssignments.map((assignment)=>{
      const item=coachById.get(recordId(assignment?.coachUserId));
      return String(item?.name||item?.email||'').trim();
    }).filter(Boolean);
    const authEmail=String(user?.email||'').trim();
    const contactEmail=String(access?.email||'').trim();
    const rowIssues=[];
    if(access&&clientId&&!client){
      rowIssues.push(accessIntegrityIssue('CLIENT_LINK_NOT_VISIBLE',{clientId}));
    }
    if(linkedAccess.length>1){
      rowIssues.push(accessIntegrityIssue('MULTIPLE_CLIENT_ACCESS_LINKS',{count:linkedAccess.length}));
    }
    return Object.freeze({
      ...clone(user),
      id:userId,
      userId,
      roles:Object.freeze(roles),
      primaryRole,
      authEmail,
      contactEmail,
      contactEmailDiffers:Boolean(contactEmail&&authEmail&&contactEmail.toLowerCase()!==authEmail.toLowerCase()),
      access:access?Object.freeze({
        id:recordId(access?.id),
        clientId,
        status:clientAccessStatus(access?.status),
        authLinked:Boolean(recordId(access?.authUserId??access?.auth_user_id)),
        invitationAttemptCount:Number(access?.invitationAttemptCount??access?.invitation_attempt_count??0)||0,
        invitationSentAt:access?.invitationSentAt??access?.invitation_sent_at??null,
        activatedAt:access?.activatedAt??access?.activated_at??null,
        updatedAt:access?.updatedAt??access?.updated_at??null,
      }):null,
      client:client?Object.freeze({
        id:clientId,
        name:String(client?.name||'Cliente'),
        modality:String(client?.modality||''),
        lifecycleStatus:String(client?.lifecycle?.status||client?.status||''),
      }):null,
      assignedCoachNames:Object.freeze([...new Set(assignedCoachNames)]),
      coach:coach?Object.freeze({
        name:String(coach?.name||user?.name||'Coach'),
        email:String(coach?.email||authEmail),
        status:String(coach?.status||user?.status||''),
        activeClientCount:coachAssignments.length,
      }):null,
      integrityIssues:Object.freeze(rowIssues),
    });
  }).sort((a,b)=>String(a.name||a.authEmail||'').localeCompare(String(b.name||b.authEmail||''),'es',{sensitivity:'base'}));
  const activeUsers=rows.filter((row)=>isActiveStatus(row.status)).length;
  const pendingInvitations=rows.filter((row)=>row.access?.status==='invitacion_pendiente').length;
  return Object.freeze({
    rows:Object.freeze(rows),
    integrityIssues:Object.freeze(integrityIssues),
    summary:Object.freeze({
      total:rows.length,
      activeUsers,
      pendingInvitations,
      integrityIssueCount:integrityIssues.length,
    }),
  });
}
function isBlockedStatus(value){return /suspend|block|inactive|inactivo|disabled|revoked/u.test(normalizeStatus(value));}
function isActiveStatus(value){return /active|activo|enabled|operational|operativo/u.test(normalizeStatus(value));}
function coachSubjects(coaches=[],users=[]){
  const profiles=new Map();
  for(const coach of coaches||[]){
    const id=recordId(coach?.userId||coach?.id);
    if(id)profiles.set(id,coach);
  }
  const coachUsers=new Map();
  for(const user of users||[]){
    const id=recordId(user?.userId||user?.id);
    if(id&&isCoachUser(user))coachUsers.set(id,user);
  }
  const ids=[...new Set([...profiles.keys(),...coachUsers.keys()])];
  return ids.map((coachId)=>Object.freeze({coachId,coach:profiles.get(coachId)||null,user:coachUsers.get(coachId)||null}));
}
export function deriveCoachLaunchJourney({coach=null,user=null,assignments=[],sessions=[]}={}){
  const accountStatus=String(user?.status||coach?.status||'').trim();
  const blocked=isBlockedStatus(user?.status)||isBlockedStatus(coach?.status);
  const invited=Boolean(recordId(user?.userId||user?.id||coach?.userId||coach?.id));
  const activated=Boolean(user?.lastAccessAt);
  const profileReady=Boolean(coach&&recordId(coach?.userId||coach?.id)&&String(coach?.name||'').trim()&&String(coach?.email||'').trim()&&!isBlockedStatus(coach?.status));
  const activeAssignments=(assignments||[]).filter((assignment)=>String(assignment?.status||'active').toLowerCase()==='active');
  const firstClientAssigned=activeAssignments.length>0;
  const planningPrepared=(sessions||[]).some((session)=>Boolean(recordId(session?.sessionId)));
  const firstSessionCompleted=(sessions||[]).some((session)=>/complet|realiz|done/u.test(String(session?.status||'').toLowerCase()));
  const milestones=Object.freeze([
    Object.freeze({id:'invited',label:'Invitación',complete:invited,evidence:invited?'Identidad Coach visible':'Sin identidad Coach'}),
    Object.freeze({id:'activated',label:'Activación',complete:activated,evidence:activated?'Primer acceso registrado':'Sin primer acceso registrado'}),
    Object.freeze({id:'profile',label:'Perfil operativo',complete:profileReady,evidence:profileReady?'Perfil Coach completo':'Perfil operativo incompleto o no visible'}),
    Object.freeze({id:'client',label:'Primer cliente',complete:firstClientAssigned,evidence:firstClientAssigned?'Asignación activa visible':'Sin cliente activo asignado'}),
    Object.freeze({id:'planning',label:'Primera planificación',complete:planningPrepared,evidence:planningPrepared?'Sesión publicada vinculada visible':'Sin evidencia explícita de planificación publicada'}),
    Object.freeze({id:'session',label:'Primera sesión',complete:firstSessionCompleted,evidence:firstSessionCompleted?'Sesión completada visible':'Sin sesión completada visible'}),
  ]);
  const completedCount=milestones.filter((item)=>item.complete).length;
  const ready=!blocked&&isActiveStatus(accountStatus)&&milestones.every((item)=>item.complete);
  let stage='invited';
  let displayStatus='Invitado · primer acceso pendiente';
  let nextAction=Object.freeze({area:'admin-usuarios',label:'Revisar activación'});
  if(blocked){
    stage='blocked';
    displayStatus='Bloqueado';
    nextAction=Object.freeze({area:'admin-usuarios',label:'Revisar acceso'});
  }else if(!activated){
    stage='invited';
  }else if(!profileReady){
    stage='profile';
    displayStatus='Activo · perfil pendiente';
    nextAction=Object.freeze({area:'admin-equipo',label:'Revisar perfil'});
  }else if(!firstClientAssigned){
    stage='assignment';
    displayStatus='Activo · primer cliente pendiente';
    nextAction=Object.freeze({area:'admin-equipo',label:'Asignar primer cliente'});
  }else if(!planningPrepared){
    stage='planning';
    displayStatus='Activo · planificación por verificar';
    nextAction=Object.freeze({area:'admin-equipo',label:'Verificar primera planificación'});
  }else if(!firstSessionCompleted){
    stage='session';
    displayStatus='Activo · primera sesión pendiente';
    nextAction=Object.freeze({area:'admin-agenda',label:'Revisar primera sesión'});
  }else if(ready){
    stage='ready';
    displayStatus='Activo · Coach listo';
    nextAction=null;
  }else{
    stage='account';
    displayStatus=`${accountStatus||'Estado'} · activación operativa por verificar`;
    nextAction=Object.freeze({area:'admin-usuarios',label:'Revisar estado de acceso'});
  }
  return Object.freeze({
    stage,
    ready,
    blocked,
    accountStatus,
    completedCount,
    total:milestones.length,
    percent:Math.round((completedCount/milestones.length)*100),
    milestones,
    nextAction,
    displayStatus,
  });
}
export function buildCoach360Rows({coaches=[],users=[],clients=[],assignments=[],appointments=[],now=new Date()}={}){
  const safeNow=dateTime(now)||new Date();
  const clientById=new Map((clients||[]).map((client)=>[recordId(client?.id),client]));
  const activeAssignments=(assignments||[]).filter((assignment)=>String(assignment?.status||'active').toLowerCase()==='active');
  return Object.freeze(coachSubjects(coaches,users).map(({coachId,coach,user})=>{
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
          sessionId:appointmentSessionId(appointment),
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
    const launchJourney=deriveCoachLaunchJourney({coach,user,assignments:ownAssignments,sessions});
    return Object.freeze({
      id:recordId(coach?.id||user?.id||coachId),
      coachId,
      name:String(coach?.name||user?.name||coach?.email||user?.email||'Coach'),
      email:String(coach?.email||user?.email||''),
      status:launchJourney.displayStatus,
      accountStatus:String(user?.status||coach?.status||''),
      launchJourney,
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
export function createAdminRouteViewModel(base,shellVm,state){const role=String(shellVm?.identity?.role||state?.identity?.role||'');const area=String(shellVm?.activeArea||state?.activeArea||'');if(role!=='admin'||!area.startsWith('admin-'))return base;if(state?.admin?.available!==true)return Object.freeze({...base,admin:true,kind:'admin-unavailable',reason:state?.admin?.reason||'backend_unavailable'});if(!routeAllowedForAdmin(state.admin,area))return Object.freeze({...base,admin:true,kind:'admin-forbidden'});const common={...base,admin:true,area,currentUserId:String(shellVm?.identity?.id||state?.identity?.id||''),organization:clone(state.admin.organization),summary:clone(state.admin.summary),analytics:clone(state.admin.analytics)};
  if(area==='admin-inicio'){
    const clients=clientRows(state);
    const coaches=Object.freeze(clone(adminCollection(state,'coachProfiles')));
    const tasks=Object.freeze(clone(adminCollection(state,'operationalTasks')));
    return Object.freeze({...common,kind:'admin-inicio',clients,coaches,tasks:Object.freeze(clone(tasks.slice(0,12))),audit:Object.freeze(clone(adminCollection(state,'auditEvents').slice(0,12))),commandCenter:deriveAdminCommandCenter({clients,coaches,tasks})});
  }
  if(area==='admin-usuarios'){
    const users=Object.freeze(clone(adminCollection(state,'organizationUsers')));
    const applicationRoles=Object.freeze(clone(adminCollection(state,'applicationRoles')));
    const user360=buildAdminUser360({
      users,
      applicationRoles,
      clients:clientRows(state),
      clientAccess:clone(state.collections?.clientAccess||[]),
      coachProfiles:clone(adminCollection(state,'coachProfiles')),
      assignments:clone(adminCollection(state,'coachClientAssignments')),
    });
    return Object.freeze({...common,kind:'admin-usuarios',users:user360.rows,roles:applicationRoles,user360Summary:user360.summary,accessIntegrityIssues:user360.integrityIssues,canManageStatus:adminCan(state.admin,ADMIN_CAPABILITIES.USER_MANAGE_STATUS),canManageRoles:adminCan(state.admin,ADMIN_CAPABILITIES.ROLE_MANAGE)});
  }
  if(area==='admin-equipo'){
    const coaches=Object.freeze(clone(adminCollection(state,'coachProfiles')));
    const users=Object.freeze(clone(adminCollection(state,'organizationUsers')));
    const clients=clientRows(state);
    const coachById=new Map(coaches.map((coach)=>[String(coach.userId||coach.id),coach]));
    const userById=new Map(users.map((user)=>[String(user.userId||user.id),user]));
    const clientById=new Map(clients.map((client)=>[String(client.id),client]));
    const rawAssignments=Object.freeze(clone(adminCollection(state,'coachClientAssignments')));
    const assignments=Object.freeze(rawAssignments.map((assignment)=>Object.freeze({
      ...assignment,
      coachName:String(coachById.get(String(assignment.coachUserId||''))?.name||coachById.get(String(assignment.coachUserId||''))?.email||userById.get(String(assignment.coachUserId||''))?.name||userById.get(String(assignment.coachUserId||''))?.email||'Coach'),
      clientName:String(clientById.get(String(assignment.clientId||''))?.name||'Cliente'),
    })));
    const rawNow=state?.admin?.serverTime||state?.hydration?.serverTime||new Date();
    const coachProfiles360=buildCoach360Rows({coaches,users,clients,assignments:rawAssignments,appointments:clone(state.collections?.appointments||[]),now:rawNow});
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
