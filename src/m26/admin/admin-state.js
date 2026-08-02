import {createPermissionSet} from '../shared/permission-set.js';
export const M26_ADMIN_COLLECTION_KEYS=Object.freeze(['organizationUsers','applicationRoles','coachProfiles','coachClientAssignments','leads','clientLifecycle','operationalTasks','notificationTemplates','notificationDeliveries','automationRules','auditEvents']);
const ALLOWED=Object.freeze({
  organizationUsers:['id','userId','email','name','status','primaryRole','roles','lastAccessAt','createdAt','updatedAt','revision'],
  applicationRoles:['id','userId','role','active','grantedAt','grantedBy','revision'],
  coachProfiles:['id','userId','email','name','status','clientCount','capacityHours','assignedHours','revision'],
  coachClientAssignments:['id','coachUserId','clientId','status','startsAt','endsAt','reason','createdAt','updatedAt','revision'],
  leads:['id','name','email','phone','source','objective','status','ownerUserId','nextActionAt','createdAt','updatedAt','revision'],
  clientLifecycle:['id','clientId','status','reason','effectiveAt','changedBy','createdAt','revision'],
  operationalTasks:['id','type','entityType','entityId','clientId','assigneeUserId','status','priority','title','detail','dueAt','createdAt','updatedAt','resolvedAt','resolutionNote','revision'],
  notificationTemplates:['id','key','name','channel','subject','body','status','createdAt','updatedAt','revision'],
  notificationDeliveries:['id','templateKey','recipientType','recipientId','channel','status','scheduledAt','sentAt','errorCode','createdAt','revision'],
  automationRules:['id','key','name','triggerType','actionType','status','configuration','createdAt','updatedAt','revision'],
  auditEvents:['id','eventType','actorUserId','actorApplication','entityType','entityId','occurredAt','traceId','summary','revision'],
});
const SENSITIVE=/token|password|secret|authorization|credential|cookie|service_role|private_note|health_data/i;
function clean(value,max=3000){if(value==null)return null;if(typeof value==='number'||typeof value==='boolean')return value;return String(value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function cleanObject(value,depth=0){if(value==null)return null;if(typeof value!=='object')return clean(value);if(depth>2)return null;if(Array.isArray(value))return value.slice(0,100).map((v)=>cleanObject(v,depth+1));const out={};for(const [k,v] of Object.entries(value).slice(0,80)){if(!SENSITIVE.test(k))out[k]=cleanObject(v,depth+1);}return out;}
function projectRecord(key,record){const out={};for(const field of ALLOWED[key]||[]){const snake=field.replace(/[A-Z]/g,(m)=>`_${m.toLowerCase()}`);const value=record?.[field]??record?.[snake];if(value!==undefined)out[field]=(field==='roles'||field==='configuration')?cleanObject(value):clean(value);}return Object.freeze(out);}
function emptyCollections(){return Object.freeze(Object.fromEntries(M26_ADMIN_COLLECTION_KEYS.map((k)=>[k,Object.freeze([])])));}
export function createAdminState(overrides={}){return Object.freeze({available:false,reason:'not_loaded',organization:null,permissions:createPermissionSet({capabilities:[],scopeType:'none'}),collections:emptyCollections(),analytics:Object.freeze({}),summary:Object.freeze({users:0,coaches:0,leads:0,activeClients:0,openTasks:0,failedNotifications:0,activeAutomations:0}),serverTime:null,revision:0,...structuredClone(overrides)});}
export function projectAdminSnapshot(raw,identity={}){
  if(String(identity?.role||'').toLowerCase()!=='admin')return createAdminState({reason:'role_not_admin'});
  if(!raw)return createAdminState({reason:'backend_unavailable'});
  if(raw?.ok!==true)throw new Error('M26_ADMIN_BOOTSTRAP_INVALID');
  const organization=Object.freeze({id:String(raw.organization?.id||''),name:clean(raw.organization?.name)||'IBERFIT',slug:clean(raw.organization?.slug),status:clean(raw.organization?.status)||'active',timezone:clean(raw.organization?.timezone)||'America/Santiago',locale:clean(raw.organization?.locale)||'es-CL',settings:Object.freeze(cleanObject(raw.organization?.settings)||{}),revision:Number(raw.organization?.revision||0)});
  if(!organization.id)throw new Error('M26_ADMIN_ORGANIZATION_INVALID');
  const permissions=createPermissionSet({capabilities:Array.isArray(raw.permissions)?raw.permissions:raw.permissions?.capabilities||[],scopeType:'organization',organizationId:organization.id,revision:Number(raw.permissionRevision||0),issuedAt:raw.serverTime||Date.now()});
  const data=raw.data&&typeof raw.data==='object'?raw.data:{};
  const collections=Object.freeze(Object.fromEntries(M26_ADMIN_COLLECTION_KEYS.map((key)=>[key,Object.freeze((Array.isArray(data[key])?data[key]:[]).slice(0,10000).map((r)=>projectRecord(key,r)))])));
  const analytics=Object.freeze(cleanObject(raw.analytics)||{});
  return Object.freeze({available:true,reason:null,organization,permissions,collections,analytics,summary:Object.freeze({users:collections.organizationUsers.length,coaches:collections.coachProfiles.length,leads:collections.leads.length,activeClients:Number(analytics.activeClients||0),openTasks:collections.operationalTasks.filter((x)=>!['resolved','cancelled'].includes(String(x.status||'').toLowerCase())).length,failedNotifications:collections.notificationDeliveries.filter((x)=>x.status==='failed').length,activeAutomations:collections.automationRules.filter((x)=>x.status==='active').length}),serverTime:clean(raw.serverTime),revision:Number(raw.revision||0)});
}
export function adminCollection(state,key){if(!M26_ADMIN_COLLECTION_KEYS.includes(key))throw new Error('M26_ADMIN_COLLECTION_UNKNOWN');return state?.admin?.collections?.[key]||[];}
