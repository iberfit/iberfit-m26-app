import {sessionExecutionIsCompleted} from '../domain/session-execution-truth.js';

function recordId(value){return String(value??'').trim();}
function normalizeStatus(value){return String(value??'').trim().toLowerCase();}
function isBlockedStatus(value){return /suspend|block|inactive|inactivo|disabled|revoked/u.test(normalizeStatus(value));}
function isActiveStatus(value){return /active|activo|enabled|operational|operativo/u.test(normalizeStatus(value));}
function bodyOf(record){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};}
function field(record,...keys){const body=bodyOf(record);for(const key of keys){const value=record?.[key]??body?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}

export function isCoachLaunchPlanningPublished(record={}){
  const status=normalizeStatus(field(record,'status','estado'));
  return ['publicado','publicada','published'].includes(status)||Boolean(field(record,'publishedAt','published_at'));
}

export function deriveCoachLaunchJourney({
  coach=null,
  user=null,
  assignments=[],
  planningSessions=[],
  sessions=[],
  sessionExecutions=[],
}={}){
  const accountStatus=String(user?.status||coach?.status||'').trim();
  const blocked=isBlockedStatus(user?.status)||isBlockedStatus(coach?.status);
  const accountActive=isActiveStatus(accountStatus);
  const invited=Boolean(recordId(user?.userId||user?.id||coach?.userId||coach?.id));
  const activated=Boolean(user?.lastAccessAt);
  const profileReady=Boolean(
    coach&&
    recordId(coach?.userId||coach?.id)&&
    String(coach?.name||'').trim()&&
    String(coach?.email||'').trim()&&
    !isBlockedStatus(coach?.status)
  );
  const activeAssignments=(assignments||[]).filter((assignment)=>['active','activo'].includes(normalizeStatus(assignment?.status||'active')));
  const firstClientAssigned=activeAssignments.length>0;
  const explicitPlanning=(planningSessions||[]).length?planningSessions:sessions;
  const planningPrepared=(explicitPlanning||[]).some((session)=>
    isCoachLaunchPlanningPublished(session)&&Boolean(recordId(session?.sessionId||session?.session_id||session?.id))
  );
  const firstSessionCompleted=(sessionExecutions||[]).some(sessionExecutionIsCompleted);
  const milestones=Object.freeze([
    Object.freeze({id:'invited',label:'Invitación',complete:invited,evidence:invited?'Identidad Coach visible':'Sin identidad Coach'}),
    Object.freeze({id:'activated',label:'Activación',complete:activated,evidence:activated?'Primer acceso registrado':'Sin primer acceso registrado'}),
    Object.freeze({id:'profile',label:'Perfil operativo',complete:profileReady,evidence:profileReady?'Perfil Coach completo':'Perfil operativo incompleto o no visible'}),
    Object.freeze({id:'client',label:'Primer cliente',complete:firstClientAssigned,evidence:firstClientAssigned?'Asignación activa visible':'Sin cliente activo asignado'}),
    Object.freeze({id:'planning',label:'Primera planificación',complete:planningPrepared,evidence:planningPrepared?'Sesión publicada vinculada visible':'Sin evidencia explícita de planificación publicada'}),
    Object.freeze({id:'session',label:'Primera sesión',complete:firstSessionCompleted,evidence:firstSessionCompleted?'Ejecución completada confirmada':'Sin ejecución completada confirmada'}),
  ]);
  const completedCount=milestones.filter((item)=>item.complete).length;
  const ready=!blocked&&accountActive&&milestones.every((item)=>item.complete);
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
    accountActive,
    accountStatus,
    completedCount,
    total:milestones.length,
    percent:Math.round((completedCount/milestones.length)*100),
    milestones,
    nextAction,
    displayStatus,
  });
}

export const __coachLaunchJourneyInternals=Object.freeze({recordId,normalizeStatus,isBlockedStatus,isActiveStatus,bodyOf,field});
