const ROLE_ALIASES=Object.freeze({admin:'admin',administrador:'admin',coach:'coach',entrenador:'coach',client:'client',cliente:'client'});
const ENTITY_ALIASES=Object.freeze({session:'session',sesion:'session',planning:'planning',plan:'planning',cycle:'planning',report:'report',informe:'report'});
const STATUS_ALIASES=Object.freeze({
  draft:'draft',borrador:'draft',
  pending:'review',pendiente:'review',review:'review',revision:'review','en_revision':'review','en revisión':'review',validated:'review',validado:'review',
  approved:'approved',aprobado:'approved',
  published:'published',publicado:'published',active:'published',activo:'published',enabled:'published',habilitado:'published',
  withdrawn:'withdrawn',retirado:'withdrawn',cancelled:'withdrawn',cancelado:'withdrawn',anulado:'withdrawn',
  archived:'archived',archivado:'archived',
});
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ENTITY_CONFIG=Object.freeze({
  session:Object.freeze({entityType:'session',collection:'sessions',actions:Object.freeze({
    approve:Object.freeze({type:'SESION_APROBAR',from:Object.freeze(['draft','review']),to:'approved',label:'Aprobar sesión',requiresPreview:false,requiresReason:false}),
    publish:Object.freeze({type:'SESION_PUBLICAR',from:Object.freeze(['approved']),to:'published',label:'Publicar para el cliente',requiresPreview:true,requiresReason:false}),
    withdraw:Object.freeze({type:'SESION_CANCELAR',from:Object.freeze(['published']),to:'withdrawn',label:'Retirar sesión',requiresPreview:false,requiresReason:true}),
  })}),
  planning:Object.freeze({entityType:'planning',collection:'trainingCycles',actions:Object.freeze({
    approve:Object.freeze({type:'PLAN_APROBAR',from:Object.freeze(['review']),to:'approved',label:'Aprobar plan',requiresPreview:false,requiresReason:false}),
    publish:Object.freeze({type:'PLAN_PUBLICAR',from:Object.freeze(['approved']),to:'published',label:'Publicar para el cliente',requiresPreview:true,requiresReason:false}),
    archive:Object.freeze({type:'PLAN_ARCHIVAR',from:Object.freeze(['published']),to:'archived',label:'Archivar plan',requiresPreview:false,requiresReason:true}),
    reopen:Object.freeze({type:'PLAN_REABRIR',from:Object.freeze(['archived']),to:'draft',label:'Reabrir plan',requiresPreview:false,requiresReason:true}),
  })}),
  report:Object.freeze({entityType:'report',collection:'reports',actions:Object.freeze({
    approve:Object.freeze({type:'INFORME_APROBAR',from:Object.freeze(['draft','review']),to:'approved',label:'Aprobar informe',requiresPreview:false,requiresReason:false}),
    publish:Object.freeze({type:'INFORME_PUBLICAR',from:Object.freeze(['approved']),to:'published',label:'Publicar para el cliente',requiresPreview:true,requiresReason:false}),
    withdraw:Object.freeze({type:'INFORME_RETIRAR',from:Object.freeze(['published']),to:'withdrawn',label:'Retirar informe',requiresPreview:false,requiresReason:true}),
  })}),
});
const STATUS_LABELS=Object.freeze({draft:'Borrador',review:'Pendiente de aprobación',approved:'Aprobado',published:'Publicado',withdrawn:'Retirado',archived:'Archivado',unknown:'Estado no reconocido'});

function value(record,...keys){const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};for(const key of keys){const found=record?.[key]??body?.[key];if(found!==undefined&&found!==null&&found!=='')return found;}return null;}
function normalizeRole(role){return ROLE_ALIASES[String(role||'').trim().toLowerCase()]||null;}
function normalizeEntity(entity){return ENTITY_ALIASES[String(entity||'').trim().toLowerCase()]||null;}
function safeId(input,code){const id=String(input||'').trim();if(!SAFE_ID.test(id))throw new Error(code);return id;}
function normalizeReason(input){const reason=String(input||'').trim().replace(/\s+/g,' ').slice(0,1000);return reason;}
function booleanValue(record,...keys){const raw=value(record,...keys);if(raw===null)return null;if(typeof raw==='boolean')return raw;const text=String(raw).trim().toLowerCase();if(['true','1','sí','si','yes'].includes(text))return true;if(['false','0','no'].includes(text))return false;return null;}
function isoNow(now){const value=typeof now==='function'?now():now??new Date();const date=value instanceof Date?value:new Date(value);if(Number.isNaN(date.getTime()))throw new Error('M26_PUBLICATION_CLOCK_INVALID');return date.toISOString();}
function revisionOf(record){const revision=Number(value(record,'revision','version'));return Number.isInteger(revision)&&revision>=0?revision:0;}
function clientIdOf(record){return value(record,'clientId','client_id','clienteId','cliente_id');}
function idOf(record){return value(record,'id','entityId','entity_id');}

export function publicationStatus(record){const raw=String(value(record,'status','estado')||'draft').trim().toLowerCase();return STATUS_ALIASES[raw]||'unknown';}
export function publicationStatusLabel(recordOrStatus){const status=typeof recordOrStatus==='string'?(STATUS_ALIASES[String(recordOrStatus).trim().toLowerCase()]||recordOrStatus):publicationStatus(recordOrStatus);return STATUS_LABELS[status]||STATUS_LABELS.unknown;}
export function publicationConfig(entity){const normalized=normalizeEntity(entity);return normalized?ENTITY_CONFIG[normalized]:null;}
export function publicationActionsFor({entity,record,role}={}){
  const config=publicationConfig(entity);if(!config)return Object.freeze([]);
  if(!['admin','coach'].includes(normalizeRole(role)))return Object.freeze([]);
  const status=publicationStatus(record);
  return Object.freeze(Object.entries(config.actions).filter(([,definition])=>definition.from.includes(status)).map(([action,definition])=>Object.freeze({action,...definition})));
}
export function publicationSummary({entity,record,role}={}){
  const status=publicationStatus(record);const actions=publicationActionsFor({entity,record,role});
  const explicit=booleanValue(record,'visibleToClient','visible_to_client','clientVisible','client_visible');const visible=status==='published'&&explicit!==false;
  return Object.freeze({entity:normalizeEntity(entity),id:idOf(record)||null,clientId:clientIdOf(record)||null,revision:revisionOf(record),status,statusLabel:publicationStatusLabel(status),visibleToClient:visible,actions});
}
export function assertPublicationTransition({entity,action,record,role,previewAccepted=false,reason=''}={}){
  const config=publicationConfig(entity);if(!config)throw new Error('M26_PUBLICATION_ENTITY_INVALID');
  if(!['admin','coach'].includes(normalizeRole(role)))throw new Error('M26_PUBLICATION_ROLE_FORBIDDEN');
  const definition=config.actions[action];if(!definition)throw new Error('M26_PUBLICATION_ACTION_INVALID');
  const status=publicationStatus(record);if(!definition.from.includes(status))throw new Error(`M26_PUBLICATION_TRANSITION_INVALID:${status}:${action}`);
  if(definition.requiresPreview&&previewAccepted!==true)throw new Error('M26_PUBLICATION_PREVIEW_REQUIRED');
  if(definition.requiresReason&&!normalizeReason(reason))throw new Error('M26_PUBLICATION_REASON_REQUIRED');
  return Object.freeze({config,definition,status});
}
export function buildPublicationCommand({entity,action,record,role,previewAccepted=false,reason='',patch={},now=()=>new Date()}={}){
  const {config,definition}=assertPublicationTransition({entity,action,record,role,previewAccepted,reason});
  const entityId=safeId(idOf(record),'M26_PUBLICATION_ENTITY_ID_REQUIRED');
  const clientId=safeId(clientIdOf(record),'M26_PUBLICATION_CLIENT_ID_REQUIRED');
  const at=isoNow(now);const cleanReason=normalizeReason(reason);
  const timestampKey=definition.to==='approved'?'approvedAt':definition.to==='published'?'publishedAt':definition.to==='archived'?'archivedAt':definition.to==='withdrawn'?'withdrawnAt':'reopenedAt';
  const nextPatch={...structuredClone(patch||{}),status:definition.to==='review'?'pendiente':definition.to==='approved'?'aprobado':definition.to==='published'?'publicado':definition.to==='archived'?'archivado':definition.to==='withdrawn'?'retirado':'borrador',[timestampKey]:at};
  if(definition.to==='published')nextPatch.visibleToClient=true;
  if(['withdrawn','archived','draft'].includes(definition.to))nextPatch.visibleToClient=false;
  if(cleanReason)nextPatch.reason=cleanReason;
  return {
    type:definition.type,
    entityType:config.entityType,
    entityId,
    clientId,
    baseRevision:revisionOf(record),
    previewAccepted:definition.requiresPreview?true:false,
    reason:definition.requiresReason?cleanReason:null,
    payload:{patch:nextPatch},
  };
}
export function publicationCounts(records=[]){const counts={draft:0,review:0,approved:0,published:0,withdrawn:0,archived:0,unknown:0};for(const record of records||[])counts[publicationStatus(record)]++;return Object.freeze(counts);}
export const M26_PUBLICATION_ENTITIES=ENTITY_CONFIG;
export const __publicationInternals=Object.freeze({normalizeRole,normalizeEntity,normalizeReason,booleanValue,revisionOf,clientIdOf,idOf,isoNow});
