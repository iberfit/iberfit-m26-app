import {areaAllowedForRole,areaDefinition,canonicalArea} from '../shell/navigation.js';

const PRIORITY_RANK=Object.freeze({
  'action-required':0,
  important:1,
  informational:2,
});

const PRIORITY_LABEL=Object.freeze({
  'action-required':'Requiere acción',
  important:'Importante',
  informational:'Informativo',
});

const ACTION_TYPE_COPY=Object.freeze({
  'needs-initial-plan':'Plan inicial por preparar',
  'feedback-review':'Feedback por revisar',
  'upcoming-checkin':'Check-in próximo',
  'load-change':'Ajuste de carga por revisar',
  'manual-attention':'Seguimiento por revisar',
});

function list(value){
  return Array.isArray(value)?value:[];
}

function text(value,max=160){
  return String(value??'')
    .replace(/[\u0000-\u001f\u007f]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,max);
}

function roleValue(value){
  const role=text(value,24).toLowerCase();
  return role==='coach'||role==='client'?role:null;
}

function explicitPriority(value){
  const normalized=text(value,40).toLowerCase().replaceAll('_','-');
  if(['action-required','critical','requires-action'].includes(normalized))return 'action-required';
  if(['important','warning','pending'].includes(normalized))return 'important';
  if(['informational','info','information'].includes(normalized))return 'informational';
  return null;
}

function safeAction(role,areaValue,entityIdValue,label='Abrir'){
  const area=canonicalArea(areaValue);
  if(!area)return null;
  try{
    if(!areaAllowedForRole(area,role))return null;
  }catch{
    return null;
  }
  const definition=areaDefinition(area);
  const entityId=text(entityIdValue,200)||null;
  const contextual=Boolean(entityId&&['selected-client','client-context'].includes(definition?.scope));
  return Object.freeze({
    type:role==='coach'&&contextual?'coach-client':'area',
    area,
    entityId:role==='coach'&&contextual?entityId:null,
    label:text(label,100)||'Abrir',
  });
}

function safePersistentTitle(action){
  const area=action?.area||'';
  const labels={
    mensajes:'Nuevo aviso de comunicación',
    agenda:'Actualización de agenda',
    clientes:'Seguimiento de cartera actualizado',
    expediente:'Seguimiento de cliente actualizado',
    iri:'Actualización del diagnóstico IRI',
    informes:'Nuevo informe disponible',
    planificacion:'Actualización de planificación',
    sesion:'Actualización de entrenamiento',
    progreso:'Nuevo seguimiento de progreso',
    actividad:'Seguimiento actualizado',
    retos:'Actualización de retos',
    ajustes:'Actualización de ajustes',
  };
  return labels[area]||'Actualización IBERFIT';
}

function persistentItem(notification,role,index){
  const action=safeAction(
    role,
    notification?.actionArea,
    notification?.actionEntityId,
    'Abrir actualización'
  );
  const priority=
    explicitPriority(notification?.priority)||
    explicitPriority(notification?.status)||
    (action?'important':'informational');
  const id=text(notification?.id,200)||`persisted-${index}`;
  const createdAt=text(notification?.createdAt,80)||null;
  const readAt=text(notification?.readAt,80)||null;
  const dedupeTarget=action
    ?`${action.area}:${action.entityId||'global'}`
    :`notice:${id}`;
  return Object.freeze({
    id:`persisted:${id}`,
    source:'persisted',
    persistent:true,
    sourceId:id,
    dedupeKey:`${role}:${dedupeTarget}`,
    priority,
    priorityLabel:PRIORITY_LABEL[priority],
    title:safePersistentTitle(action),
    summary:'Abre IBERFIT para revisar el detalle de forma segura.',
    action,
    createdAt,
    readAt,
    unread:!readAt,
    count:1,
    sourceIds:Object.freeze([id]),
    unreadSourceIds:Object.freeze(readAt?[]:[id]),
  });
}

function cockpitItem(item,role,index){
  if(role!=='coach')return null;
  const clientId=text(item?.clientId,200);
  if(!clientId)return null;
  const action=safeAction(
    role,
    item?.nextAction?.area||'expediente',
    clientId,
    item?.actionCtaLabel||item?.nextAction?.label||'Revisar'
  );
  if(!action)return null;
  const kind=text(item?.kind,40).toLowerCase();
  const priority=['critical','warning','process'].includes(kind)
    ?'action-required'
    :'informational';
  const actionType=text(item?.actionType,80)||'manual-attention';
  return Object.freeze({
    id:`action-center:${actionType}:${clientId}:${index}`,
    source:'action-center',
    persistent:false,
    sourceId:null,
    dedupeKey:`${role}:${action.area}:${action.entityId||'global'}:${actionType}`,
    priority,
    priorityLabel:PRIORITY_LABEL[priority],
    title:ACTION_TYPE_COPY[actionType]||ACTION_TYPE_COPY['manual-attention'],
    summary:priority==='action-required'
      ?'Hay un paso de seguimiento que requiere tu criterio profesional.'
      :'Hay una actualización de seguimiento disponible.',
    action,
    createdAt:null,
    readAt:null,
    unread:false,
    count:1,
    sourceIds:Object.freeze([]),
    unreadSourceIds:Object.freeze([]),
  });
}

function newerDate(a,b){
  const av=Date.parse(a||'');
  const bv=Date.parse(b||'');
  if(Number.isNaN(av))return b||null;
  if(Number.isNaN(bv))return a||null;
  return av>=bv?a:b;
}

function mergeItems(current,next){
  const currentRank=PRIORITY_RANK[current.priority]??99;
  const nextRank=PRIORITY_RANK[next.priority]??99;
  const primary=nextRank<currentRank?next:current;
  const sourceIds=[...new Set([...current.sourceIds,...next.sourceIds])];
  const unreadSourceIds=[...new Set([
    ...list(current.unreadSourceIds),
    ...list(next.unreadSourceIds),
  ])];
  const unread=current.unread||next.unread;
  const readAt=unread?null:(newerDate(current.readAt,next.readAt)||null);
  return Object.freeze({
    ...primary,
    id:current.id,
    persistent:current.persistent||next.persistent,
    source:current.source===next.source?current.source:'combined',
    priority:primary.priority,
    priorityLabel:PRIORITY_LABEL[primary.priority],
    createdAt:newerDate(current.createdAt,next.createdAt),
    readAt,
    unread,
    count:current.count+next.count,
    sourceIds:Object.freeze(sourceIds),
    unreadSourceIds:Object.freeze(unreadSourceIds),
    sourceId:unreadSourceIds[0]||sourceIds.find(Boolean)||null,
  });
}

function compareItems(a,b){
  const rank=(PRIORITY_RANK[a.priority]??99)-(PRIORITY_RANK[b.priority]??99);
  if(rank)return rank;
  if(a.unread!==b.unread)return a.unread?-1:1;
  const ad=Date.parse(a.createdAt||'');
  const bd=Date.parse(b.createdAt||'');
  if(!Number.isNaN(ad)||!Number.isNaN(bd)){
    if(Number.isNaN(ad))return 1;
    if(Number.isNaN(bd))return -1;
    if(ad!==bd)return bd-ad;
  }
  return a.title.localeCompare(b.title,'es');
}

function freezeCounts(items){
  const counts={
    actionRequired:0,
    important:0,
    informational:0,
    unread:0,
    total:items.length,
  };
  for(const item of items){
    if(item.priority==='action-required')counts.actionRequired+=1;
    else if(item.priority==='important')counts.important+=1;
    else counts.informational+=1;
    if(item.unread)counts.unread+=1;
  }
  return Object.freeze(counts);
}

export function buildNotificationCenter({role,notifications=[],coachCockpit=null}={}){
  const safeRole=roleValue(role);
  if(!safeRole){
    return Object.freeze({
      role:null,
      items:Object.freeze([]),
      counts:freezeCounts([]),
      emptyTitle:'Sin notificaciones',
      emptyBody:'No hay avisos disponibles para este perfil.',
    });
  }

  const candidates=[
    ...list(notifications).map((notification,index)=>persistentItem(notification,safeRole,index)),
    ...list(coachCockpit?.items).map((item,index)=>cockpitItem(item,safeRole,index)).filter(Boolean),
  ];
  const grouped=new Map();
  for(const candidate of candidates){
    const previous=grouped.get(candidate.dedupeKey);
    grouped.set(candidate.dedupeKey,previous?mergeItems(previous,candidate):candidate);
  }
  const items=Object.freeze([...grouped.values()].sort(compareItems));
  const coach=safeRole==='coach';
  return Object.freeze({
    role:safeRole,
    items,
    counts:freezeCounts(items),
    emptyTitle:coach?'Todo al día':'Sin avisos pendientes',
    emptyBody:coach
      ?'No hay decisiones ni actualizaciones que requieran atención desde este centro.'
      :'Cuando haya una actualización importante de tu acompañamiento aparecerá aquí.',
  });
}

export const __notificationCenterInternals=Object.freeze({
  PRIORITY_RANK,
  PRIORITY_LABEL,
  explicitPriority,
  safeAction,
  persistentItem,
  cockpitItem,
  mergeItems,
  compareItems,
});
