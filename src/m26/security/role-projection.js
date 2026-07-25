import {isClientVisibleAppointment} from '../domain/appointment.js';

const ROLE_ALIASES=Object.freeze({admin:'admin',administrador:'admin',administrator:'admin',coach:'coach',entrenador:'coach',client:'client',cliente:'client'});
const ALWAYS_PRIVATE_FOR_CLIENT=new Set(['privateNotes','coachAvailability','intelligenceRuns','domainEvents','wearableSyncRuns']);
const PUBLICATION_SCOPED=new Set(['reports','trainingCycles','sessions']);
const PUBLIC_STATUSES=new Set(['publicado','published','activo','active','habilitado','enabled','completado','completed']);
const PRIVATE_STATUSES=new Set(['borrador','draft','pendiente','pending','en_revision','en revisión','review','aprobado','approved','retirado','withdrawn','archivado','archived','anulado','cancelled']);
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SENSITIVE_CLIENT_KEYS=new Set(['body','raw','privatenote','privatenotes','coachnote','coachnotes','internalnote','internalnotes','internalcomment','audit','auditlog','command','commandpayload','cost','price','margin','token','accesstoken','refreshtoken','oauthtoken','secret','secrets','password','credential','credentials','apikey','authorization','prototype','constructor','proto']);
const MAX_NESTED_DEPTH=6;
const MAX_NESTED_ARRAY=1000;
const MAX_NESTED_KEYS=120;
const MAX_NESTED_STRING=5000;

function roleOf(user){return ROLE_ALIASES[String(user?.role||'').trim().toLowerCase()]||null;}
function safeId(value){const id=String(value||'').trim();return SAFE_ID.test(id)?id:null;}
function bodyOf(record){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};}
function field(record,...keys){const body=bodyOf(record);for(const key of keys){const value=record?.[key]??body?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function clientIdOf(record,key){if(key==='clients')return safeId(record?.id);return safeId(field(record,'clientId','client_id','clienteId','cliente_id')||(key==='clientProfiles'?record?.id:null));}
function booleanField(record,...keys){const value=field(record,...keys);if(value===null)return null;if(typeof value==='boolean')return value;const text=String(value).trim().toLowerCase();if(['true','1','sí','si','yes'].includes(text))return true;if(['false','0','no'].includes(text))return false;return null;}
function statusOf(record){return String(field(record,'status','estado')||'').trim().toLowerCase();}
function isVisiblePublication(record){const explicit=booleanField(record,'visibleToClient','visible_to_client','clientVisible','client_visible','publishedToClient','published_to_client');const status=statusOf(record);if(explicit===false||PRIVATE_STATUSES.has(status))return false;if(PUBLIC_STATUSES.has(status))return true;return false;}
function isVisibleGeneric(record){const explicit=booleanField(record,'visibleToClient','visible_to_client','clientVisible','client_visible');return explicit!==false;}
function normalizedKey(key){return String(key||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_]/g,'').replaceAll('_','').toLowerCase();}
function sensitiveKey(key){return SENSITIVE_CLIENT_KEYS.has(normalizedKey(key));}
function safeClientValue(input,depth=0){
  if(input===undefined)return undefined;if(input===null)return null;
  if(typeof input==='string')return input.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,MAX_NESTED_STRING);
  if(typeof input==='number')return Number.isFinite(input)?input:undefined;if(typeof input==='boolean')return input;
  if(typeof input==='bigint')return input.toString();if(input instanceof Date)return Number.isFinite(input.getTime())?input.toISOString():undefined;
  if(typeof input!=='object'||depth>=MAX_NESTED_DEPTH)return undefined;
  if(Array.isArray(input))return input.slice(0,MAX_NESTED_ARRAY).map((item)=>safeClientValue(item,depth+1)).filter((item)=>item!==undefined);
  const output={};let count=0;for(const [key,child] of Object.entries(input)){if(count>=MAX_NESTED_KEYS)break;if(sensitiveKey(key))continue;const safe=safeClientValue(child,depth+1);if(safe!==undefined){output[key]=safe;count++;}}return output;
}
function value(record,...keys){const found=field(record,...keys);return found===null?undefined:safeClientValue(found);}
function assign(target,key,record,...keys){const found=value(record,...keys);if(found!==undefined)target[key]=found;return target;}
function base(record,key){
  const projected={};
  if(key==='clients')assign(projected,'id',record,'id');else {assign(projected,'id',record,'id');assign(projected,'clientId',record,'clientId','client_id','clienteId','cliente_id');}
  assign(projected,'status',record,'status','estado');assign(projected,'revision',record,'revision');
  return projected;
}
function safeSessionBlocks(record){
  const blocks=value(record,'blocks','bloques');if(!Array.isArray(blocks))return [];
  return blocks.slice(0,120).map((block)=>{
    const item={};
    for(const [canonical,keys] of [
      ['id',['id']],['type',['type','tipo']],['groupId',['groupId','group_id']],['exerciseId',['exerciseId','exercise_id']],
      ['name',['name','title','exerciseName','exercise_name']],['sets',['sets','series']],['reps',['reps','repetitions','repeticiones']],
      ['restSeconds',['restSeconds','rest_seconds','descanso']],['tempo',['tempo','ritmo']],['range',['range','rango']],
      ['load',['load','carga']],['loadKg',['loadKg','load_kg']],['targetRpe',['targetRpe','target_rpe']],['targetRir',['targetRir','target_rir']],
      ['durationSeconds',['durationSeconds','duration_seconds']],['alternativeId',['alternativeId','alternative_id']],
    ])assign(item,canonical,block,...keys);
    return item;
  });
}
function safeExecutionResults(record){const rows=value(record,'results','resultados');if(!Array.isArray(rows))return [];return rows.slice(0,1000).map((row)=>{const item={};for(const [canonical,keys] of [['blockId',['blockId','block_id']],['setIndex',['setIndex','set_index']],['reps',['reps','repeticiones']],['load',['load','carga']],['loadKg',['loadKg','load_kg']],['rpe',['rpe']],['rir',['rir']],['completed',['completed','completado']],['recordedAt',['recordedAt','recorded_at']]])assign(item,canonical,row,...keys);return item;});}
function publicationBase(record,key){const out=base(record,key);assign(out,'visibleToClient',record,'visibleToClient','visible_to_client');assign(out,'title',record,'title','titulo','name','nombre');assign(out,'createdAt',record,'createdAt','created_at');assign(out,'updatedAt',record,'updatedAt','updated_at');return out;}
function projectPublication(key,record){
  const out=publicationBase(record,key);
  if(key==='trainingCycles'){
    assign(out,'name',record,'name','nombre','title','titulo');assign(out,'goal',record,'goal','objective','objetivo','summary','resumen');assign(out,'startDate',record,'startDate','start_date');assign(out,'endDate',record,'endDate','end_date');
  }else if(key==='sessions'){
    assign(out,'objective',record,'objective','goal','objetivo','summary','resumen');assign(out,'durationMinutes',record,'durationMinutes','duration_minutes','duracionMinutos','duration');assign(out,'startDate',record,'startDate','start_date');assign(out,'endDate',record,'endDate','end_date');out.blocks=safeSessionBlocks(record);
  }else if(key==='reports'){
    assign(out,'periodStart',record,'periodStart','period_start');assign(out,'periodEnd',record,'periodEnd','period_end');assign(out,'summary',record,'summary','resumen');assign(out,'conclusions',record,'conclusions','conclusiones');assign(out,'recommendations',record,'recommendations','recomendaciones','nextSteps','next_steps');
  }
  return out;
}
function projectGeneric(key,record){
  const out=base(record,key);
  const mappings={
    clients:[['name',['name','nombre']],['modality',['modality','modalidad']],['avatarUrl',['avatarUrl','avatar_url']]],
    clientProfiles:[['birthDate',['birthDate','birth_date']],['objective',['objective','objetivo']],['modality',['modality','modalidad']],['firstName',['firstName','first_name']],['lastName',['lastName','last_name']]],
    clientAccess:[['activatedAt',['activatedAt','activated_at']],['lastAccessAt',['lastAccessAt','last_access_at']]],
    iriAssessments:[['assessmentDate',['assessmentDate','assessment_date','evaluatedAt','evaluated_at']],['evaluatedAt',['evaluatedAt','evaluated_at']],['score',['score','puntuacion','totalScore','total_score']],['quality',['quality','calidad']],['classification',['classification','clasificacion']],['stepFinalHr',['stepFinalHr','step_final_hr']],['stepOneMinuteHr',['stepOneMinuteHr','step_one_minute_hr']],['pushUps',['pushUps','push_ups']],['chairStand30s',['chairStand30s','chair_stand_30s']],['bodyComposition',['bodyComposition','body_composition']],['strengthPatterns',['strengthPatterns','strength_patterns']]],
    sessionExecutions:[['sessionId',['sessionId','session_id']],['appointmentId',['appointmentId','appointment_id']],['title',['title','sessionTitle','session_title']],['startedAt',['startedAt','started_at']],['completedAt',['completedAt','completed_at']],['updatedAt',['updatedAt','updated_at']],['currentBlockIndex',['currentBlockIndex','current_block_index']],['currentSetIndex',['currentSetIndex','current_set_index']],['feedback',['feedback']],['results',['results','resultados']]],
    appointments:[['sessionId',['sessionId','session_id']],['title',['title','titulo','name','nombre']],['startAt',['startAt','start_at','scheduledAt','scheduled_at','date']],['endAt',['endAt','end_at']],['location',['location','ubicacion']],['modality',['modality','modalidad']]],
    checkins:[['createdAt',['createdAt','created_at','recordedAt','recorded_at']],['energy',['energy','energia']],['sleep',['sleep','sueno']],['stress',['stress','estres']],['pain',['pain','dolor']],['notes',['notes','notas']],['wearableSummary',['wearableSummary','wearable_summary']]],
    habits:[['title',['title','titulo','name','nombre']],['description',['description','descripcion']],['frequency',['frequency','frecuencia']],['createdAt',['createdAt','created_at']]],
    habitLogs:[['habitId',['habitId','habit_id']],['completed',['completed','completado']],['recordedAt',['recordedAt','recorded_at']],['value',['value','valor']]],
    wearableConnections:[['provider',['provider','proveedor']],['lastSyncedAt',['lastSyncedAt','last_synced_at']],['scopes',['scopes','permisos']],['quality',['quality','calidad']]],
    wearableDailySummaries:[['provider',['provider','proveedor']],['date',['date','fecha']],['steps',['steps','pasos']],['activeMinutes',['activeMinutes','active_minutes']],['sleepMinutes',['sleepMinutes','sleep_minutes']],['restingHeartRate',['restingHeartRate','resting_heart_rate']],['hrvMs',['hrvMs','hrv_ms']],['activeEnergyKcal',['activeEnergyKcal','active_energy_kcal']],['workoutMinutes',['workoutMinutes','workout_minutes']],['quality',['quality','calidad']],['sourceUpdatedAt',['sourceUpdatedAt','source_updated_at']]],
    m26Entities:[['entityType',['entityType','entity_type']],['title',['title','titulo','name','nombre']],['visibleToClient',['visibleToClient','visible_to_client']],['createdAt',['createdAt','created_at']],['updatedAt',['updatedAt','updated_at']]],
  };
  const list=mappings[key];if(!list)return null;
  for(const [canonical,keys] of list)assign(out,canonical,record,...keys);
  if(key==='sessionExecutions')out.results=safeExecutionResults(record);
  return out;
}
function projectRecordForClient(key,record){return PUBLICATION_SCOPED.has(key)?projectPublication(key,record):projectGeneric(key,record);}
function assertNoSensitiveKeys(value,path='root',depth=0){
  if(value===null||value===undefined||typeof value!=='object')return true;if(depth>MAX_NESTED_DEPTH)throw new Error(`M26_CLIENT_NESTED_DEPTH_EXCEEDED:${path}`);
  for(const [key,child] of Object.entries(value)){
    if(sensitiveKey(key))throw new Error(`M26_CLIENT_SENSITIVE_FIELD_EXPOSED:${path}.${key}`);
    assertNoSensitiveKeys(child,`${path}.${key}`,depth+1);
  }
  return true;
}

function cleanScalar(value,max=300){if(value===null||value===undefined)return null;if(typeof value==='number')return Number.isFinite(value)?value:null;if(typeof value==='boolean')return value;return String(value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)||null;}
function registryForClient(entries=[]){return (Array.isArray(entries)?entries:[]).filter((entry)=>{const roles=entry?.allowedRoles||entry?.allowed_roles||[];return Array.isArray(roles)&&roles.map((role)=>ROLE_ALIASES[String(role||'').trim().toLowerCase()]||null).includes('client')&&entry?.enabled!==false;}).slice(0,100).map((entry)=>Object.freeze({type:cleanScalar(entry?.type||entry?.command_type,100),entityType:cleanScalar(entry?.entityType||entry?.entity_type,80),eventName:cleanScalar(entry?.eventName||entry?.event_name,80),allowedRoles:Object.freeze(['cliente']),requiresReason:entry?.requiresReason===true||entry?.requires_reason===true,requiresPreview:entry?.requiresPreview===true||entry?.requires_preview===true,enabled:true})).filter((entry)=>entry.type&&entry.entityType&&entry.eventName);}
export function projectIdentityForRole(user){const role=roleOf(user);const id=safeId(user?.id);if(!role||!id)throw new Error('M26_IDENTITY_REQUIRED');const out={id,role};if(role==='client'){const clientId=safeId(user?.clientId||user?.client_id);if(!clientId)throw new Error('M26_CLIENT_IDENTITY_REQUIRED');out.clientId=clientId;}for(const key of ['name','displayName','firstName','lastName','email']){const source=key==='displayName'?(user?.displayName??user?.display_name):key==='firstName'?(user?.firstName??user?.first_name):key==='lastName'?(user?.lastName??user?.last_name):user?.[key];const safe=cleanScalar(source,key==='email'?254:160);if(safe)out[key]=safe;}return Object.freeze(out);}
export function projectEnvironmentForRole(environment,user){if(roleOf(user)!=='client')return structuredClone(environment??null);if(typeof environment==='string')return cleanScalar(environment,80);const source=environment&&typeof environment==='object'&&!Array.isArray(environment)?environment:{};const out={};for(const key of ['name','mode','reason','version']){const safe=cleanScalar(source[key],100);if(safe)out[key]=safe;}for(const key of ['commandRegistry','installedCommands']){const registry=registryForClient(source[key]);if(registry.length)out[key]=Object.freeze(registry);}return Object.freeze(out);}
export function projectCanaryForRole(canary,user){const source=canary&&typeof canary==='object'&&!Array.isArray(canary)?canary:{};const out={active:source.active===true};for(const key of ['scope','version']){const safe=cleanScalar(source[key],100);if(safe)out[key]=safe;}if(roleOf(user)!=='client'){for(const key of ['commandRegistry','installedCommands'])if(Array.isArray(source[key]))out[key]=structuredClone(source[key]);}return Object.freeze(out);}
export function projectMetricsForRole(metrics){const source=metrics&&typeof metrics==='object'&&!Array.isArray(metrics)?metrics:{};const out={};for(const key of ['checkin','progress','iri'])out[key]=safeClientValue(source[key]);return Object.freeze(out);}

export function projectCollectionsForRole(collections,user,collectionKeys=Object.keys(collections||{})){
  if(roleOf(user)!=='client')return structuredClone(collections||{});
  const own=safeId(user?.clientId||user?.client_id);if(!own)throw new Error('M26_CLIENT_IDENTITY_REQUIRED');
  const projected={};
  for(const key of collectionKeys){
    const records=Array.isArray(collections?.[key])?collections[key]:[];
    if(ALWAYS_PRIVATE_FOR_CLIENT.has(key)){projected[key]=[];continue;}
    projected[key]=records.filter((record)=>{
      if(clientIdOf(record,key)!==own)return false;
      if(PUBLICATION_SCOPED.has(key))return isVisiblePublication(record);
      if(key==='appointments')return isClientVisibleAppointment(record);
      return isVisibleGeneric(record);
    }).map((record)=>projectRecordForClient(key,record)).filter(Boolean);
  }
  return projected;
}
function revisionKeyBelongsToClient(key,clientId){const text=String(key||'');if(text===clientId)return true;const escaped=clientId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?:^|[:|/])${escaped}(?:$|[:|/])`).test(text);}
export function projectRemoteRevisionsForRole(revisions,user){if(roleOf(user)!=='client')return structuredClone(revisions||{});const own=safeId(user?.clientId||user?.client_id);if(!own)return {};return Object.fromEntries(Object.entries(revisions||{}).filter(([key])=>revisionKeyBelongsToClient(key,own)).map(([key,val])=>[key,safeClientValue(val)]));}
export function assertClientProjectionSafe(collections,user){
  if(roleOf(user)!=='client')return true;
  const own=safeId(user?.clientId||user?.client_id);if(!own)throw new Error('M26_CLIENT_IDENTITY_REQUIRED');
  for(const key of ALWAYS_PRIVATE_FOR_CLIENT){if((collections?.[key]||[]).length)throw new Error(`M26_CLIENT_PRIVATE_COLLECTION_EXPOSED:${key}`);}
  for(const [key,records] of Object.entries(collections||{}))for(const record of records||[]){if(clientIdOf(record,key)!==own)throw new Error(`M26_CLIENT_CROSS_SCOPE_EXPOSED:${key}`);if(PUBLICATION_SCOPED.has(key)&&!isVisiblePublication(record))throw new Error(`M26_CLIENT_UNPUBLISHED_EXPOSED:${key}`);if(key==='appointments'&&!isClientVisibleAppointment(record))throw new Error('M26_CLIENT_UNCONFIRMED_APPOINTMENT_EXPOSED');assertNoSensitiveKeys(record,key);}
  return true;
}
export const M26_CLIENT_PRIVATE_COLLECTIONS=Object.freeze([...ALWAYS_PRIVATE_FOR_CLIENT]);
export const __roleProjectionInternals=Object.freeze({roleOf,clientIdOf,isVisiblePublication,isVisibleGeneric,projectRecordForClient,safeSessionBlocks,safeExecutionResults,assertNoSensitiveKeys,normalizedKey,sensitiveKey,safeClientValue,revisionKeyBelongsToClient,cleanScalar,registryForClient});
