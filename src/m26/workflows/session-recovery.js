import { createBrowserKeyValueStore,createMemoryKeyValueStore } from '../platform/key-value-store.js';
import { recoverExecutionTimers } from './session-timer.js';
const VERSION=1;
const RECOVERABLE=new Set(['ready','active','paused','awaiting_feedback','completed','cancelled']);
const SETTLED=new Set(['completed','cancelled']);
const FORBIDDEN_CREDENTIAL_KEYS=new Set(['token','accesstoken','refreshtoken','password','authorization','auth','apikey','secret']);
const DAY_MS=86400000;
function clone(value){return value==null?value:structuredClone(value);}
function parseDate(value){const ms=value instanceof Date?value.getTime():new Date(value).getTime();return Number.isFinite(ms)?ms:null;}
function safeIso(value=new Date()){const ms=parseDate(value);if(ms===null)throw new Error('M26_RECOVERY_DATE_INVALID');return new Date(ms).toISOString();}
function credentialKey(key){return String(key||'').toLowerCase().replaceAll('_','').replaceAll('-','');}
function containsCredentialKeys(value,seen=new Set()){if(!value||typeof value!=='object'||seen.has(value))return false;seen.add(value);for(const [key,child] of Object.entries(value)){if(FORBIDDEN_CREDENTIAL_KEYS.has(credentialKey(key)))return true;if(containsCredentialKeys(child,seen))return true;}return false;}
function cleanId(value){const id=String(value||'').trim();return id&&id.length<=200&&!/[\u0000-\u001f\u007f]/.test(id)?id:null;}
function finiteInteger(value,{min=0,max=Number.MAX_SAFE_INTEGER}={}){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:null;}
function finiteNumber(value,{min=0,max=Number.MAX_SAFE_INTEGER}={}){const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
function validOptionalDate(value){return value===null||value===undefined||value===''||parseDate(value)!==null;}
function validateQueue(queue){
  if(!Array.isArray(queue)||queue.length===0||queue.length>1000)return false;
  return queue.every((item)=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||!cleanId(item.blockId)||!cleanId(item.exerciseId))return false;
    const sets=finiteInteger(item.sets,{min:1,max:100});if(sets===null)return false;
    const p=item.prescription;if(p!==undefined&&p!==null){
      if(typeof p!=='object'||Array.isArray(p))return false;
      if(p.restSeconds!==undefined&&finiteNumber(p.restSeconds,{min:0,max:3600})===null)return false;
      if(p.targetRpe!==undefined&&finiteNumber(p.targetRpe,{min:1,max:10})===null)return false;
      if(p.targetRir!==undefined&&finiteNumber(p.targetRir,{min:0,max:10})===null)return false;
      if(p.reps!==undefined&&p.reps!==null&&String(p.reps).length>80)return false;
      if(p.tempo!==undefined&&p.tempo!==null&&String(p.tempo).length>80)return false;
      if(p.alternativeId!==undefined&&p.alternativeId!==null&&!cleanId(p.alternativeId))return false;
    }
    return true;
  });
}
function sanitizeExecution(execution){
  const out=clone(execution);for(const key of ['token','accessToken','access_token','refreshToken','refresh_token','password','authorization','auth','apikey','apiKey','secret'])delete out[key];return out;
}
export function validateExecutionSnapshot(snapshot){
  const errors=[],execution=snapshot?.execution,session=snapshot?.session;
  if(snapshot?.schemaVersion!==VERSION)errors.push('SCHEMA_VERSION_INVALID');
  if(!cleanId(snapshot?.ownerId))errors.push('OWNER_ID_REQUIRED');
  if(parseDate(snapshot?.savedAt)===null)errors.push('SAVED_AT_INVALID');
  if(finiteInteger(snapshot?.sessionRevision,{min:0})===null)errors.push('SESSION_REVISION_INVALID');
  if(!cleanId(execution?.id)||!cleanId(execution?.sessionId)||!cleanId(execution?.clientId))errors.push('EXECUTION_IDENTITY_REQUIRED');
  if(!RECOVERABLE.has(execution?.status))errors.push('EXECUTION_STATUS_INVALID');
  if(!validateQueue(execution?.queue))errors.push('EXECUTION_QUEUE_INVALID');
  const queue=Array.isArray(execution?.queue)?execution.queue:[],index=finiteInteger(execution?.index,{min:0,max:queue.length});
  const mayBeAtEnd=SETTLED.has(execution?.status)||execution?.status==='awaiting_feedback';
  if(index===null||(!mayBeAtEnd&&index>=queue.length))errors.push('EXECUTION_INDEX_INVALID');
  const setIndex=finiteInteger(execution?.setIndex,{min:0,max:99});
  if(setIndex===null||(index===queue.length&&setIndex!==0)||(index<queue.length&&setIndex>=Number(queue[index]?.sets||0)))errors.push('EXECUTION_SET_INDEX_INVALID');
  if(finiteInteger(execution?.revision,{min:0})===null)errors.push('EXECUTION_REVISION_INVALID');
  if(finiteNumber(execution?.accumulatedActiveMs,{min:0,max:365*DAY_MS})===null)errors.push('EXECUTION_TIMER_INVALID');
  for(const field of ['activeSince','restUntil','startedAt','completedAt','cancelledAt','recoveredAt'])if(!validOptionalDate(execution?.[field])){errors.push('EXECUTION_DATE_INVALID');break;}
  if(!cleanId(session?.id)||session.id!==execution?.sessionId)errors.push('SESSION_MISMATCH');
  if(cleanId(session?.clientId||session?.client_id)!==execution?.clientId)errors.push('SESSION_CLIENT_MISMATCH');
  if(snapshot?.appointmentId!==null&&snapshot?.appointmentId!==undefined&&!cleanId(snapshot.appointmentId))errors.push('APPOINTMENT_ID_INVALID');
  if(snapshot?.containsCredentials===true||containsCredentialKeys(snapshot))errors.push('CREDENTIALS_FORBIDDEN');
  return {ok:errors.length===0,errors:[...new Set(errors)]};
}
export function createExecutionSnapshot({execution,session,ownerId,appointmentId=null,sessionRevision=0,savedAt=new Date(),dirty=true}={}){
  if(!execution||!session)throw new Error('M26_RECOVERY_CONTEXT_REQUIRED');
  const snapshot={schemaVersion:VERSION,ownerId:String(ownerId||'').trim(),savedAt:safeIso(savedAt),dirty:Boolean(dirty),appointmentId:appointmentId||null,sessionRevision:Number(sessionRevision||0),execution:sanitizeExecution(execution),session:clone(session),containsCredentials:false};
  const validation=validateExecutionSnapshot(snapshot);if(!validation.ok)throw new Error(`M26_RECOVERY_SNAPSHOT_INVALID:${validation.errors.join(',')}`);return snapshot;
}
export function reconcileExecutionSnapshots({local,remote}={}){
  if(!local)return {kind:'remote',snapshot:clone(remote),conflict:null};if(!remote)return {kind:'local',snapshot:clone(local),conflict:null};
  const localValidation=validateExecutionSnapshot(local),remoteValidation=validateExecutionSnapshot(remote);
  if(!localValidation.ok&&!remoteValidation.ok)return {kind:'invalid',snapshot:null,conflict:{code:'BOTH_SNAPSHOTS_INVALID',localErrors:localValidation.errors,remoteErrors:remoteValidation.errors}};
  if(!localValidation.ok)return {kind:'remote',snapshot:clone(remote),conflict:null};if(!remoteValidation.ok)return {kind:'local',snapshot:clone(local),conflict:null};
  if(local.ownerId!==remote.ownerId||local.execution.clientId!==remote.execution.clientId||local.execution.sessionId!==remote.execution.sessionId)return {kind:'conflict',snapshot:clone(local),conflict:{code:'SNAPSHOT_SCOPE_MISMATCH'}};
  const localRevision=Number(local.execution.revision||0),remoteRevision=Number(remote.execution.revision||0);
  if(SETTLED.has(remote.execution.status)&&remoteRevision>=localRevision)return {kind:'remote',snapshot:clone(remote),conflict:null};
  if(remoteRevision>localRevision&&local.dirty)return {kind:'conflict',snapshot:clone(local),conflict:{code:'REMOTE_REVISION_AHEAD',localRevision,remoteRevision,localStatus:local.execution.status,remoteStatus:remote.execution.status}};
  if(remoteRevision>localRevision)return {kind:'remote',snapshot:clone(remote),conflict:null};
  return {kind:'local',snapshot:clone(local),conflict:null};
}
export function createExecutionRecoveryStore({storage=createBrowserKeyValueStore(),ownerId,prefix='m26:execution:',now=()=>new Date(),ttlDays=30}={}){
  const owner=cleanId(ownerId);if(!owner)throw new Error('M26_RECOVERY_OWNER_REQUIRED');
  const ttl=finiteInteger(ttlDays,{min:1,max:365})??30;
  const ownerPrefix=`${prefix}${owner}:`;const key=(executionId)=>{const id=cleanId(executionId);if(!id)throw new Error('M26_RECOVERY_EXECUTION_ID_INVALID');return `${ownerPrefix}${id}`;};
  const currentMs=()=>{const ms=parseDate(now());if(ms===null)throw new Error('M26_RECOVERY_NOW_INVALID');return ms;};
  const expired=(snapshot,at=currentMs())=>{const saved=parseDate(snapshot?.savedAt);return saved===null||saved<at-ttl*DAY_MS||saved>at+5*60*1000;};
  async function save(context){const at=currentMs(),snapshot=createExecutionSnapshot({...context,ownerId:owner,savedAt:new Date(at)});await storage.set(key(snapshot.execution.id),snapshot);return clone(snapshot);}
  async function load(executionId){
    const storageKey=key(executionId),snapshot=await storage.get(storageKey);if(!snapshot)return null;
    const validation=validateExecutionSnapshot(snapshot);if(!validation.ok||snapshot.ownerId!==owner||expired(snapshot)){await storage.remove(storageKey);return null;}
    recoverExecutionTimers(snapshot.execution,currentMs());return clone(snapshot);
  }
  async function list({clientId,includeSettled=false}={}){
    const at=currentMs(),scope=clientId==null?null:cleanId(clientId);if(clientId!=null&&!scope)throw new Error('M26_RECOVERY_CLIENT_ID_INVALID');
    const out=[];for(const [storageKey,snapshot] of await storage.entries(ownerPrefix)){
      const validation=validateExecutionSnapshot(snapshot);
      if(!validation.ok||snapshot.ownerId!==owner||expired(snapshot,at)){await storage.remove(storageKey);continue;}
      if(scope&&snapshot.execution.clientId!==scope)continue;
      if(!includeSettled&&SETTLED.has(snapshot.execution.status)&&snapshot.execution.syncStatus==='clean')continue;
      recoverExecutionTimers(snapshot.execution,at);out.push(clone(snapshot));
    }
    return out.sort((a,b)=>(parseDate(b.savedAt)||0)-(parseDate(a.savedAt)||0));
  }
  async function remove(executionId){await storage.remove(key(executionId));}
  async function purgeExpired(){const at=currentMs();let removed=0;for(const [storageKey,snapshot] of await storage.entries(ownerPrefix)){const validation=validateExecutionSnapshot(snapshot);if(!validation.ok||snapshot.ownerId!==owner||expired(snapshot,at)){await storage.remove(storageKey);removed+=1;}}return removed;}
  async function clearOwner(){await storage.clear(ownerPrefix);}
  return Object.freeze({ownerId:owner,save,load,list,remove,purgeExpired,clearOwner});
}
export function createMemoryExecutionRecoveryStore(options={}){return createExecutionRecoveryStore({...options,storage:createMemoryKeyValueStore()});}
export function createExecutionRecoveryCoordinator({store,commandBus,isOnline=()=>globalThis.navigator?.onLine!==false}={}){
  if(!store?.save||!store?.load||!store?.list||!store?.remove)throw new Error('M26_RECOVERY_STORE_REQUIRED');
  return Object.freeze({
    async persist(context){return store.save({...context,dirty:context?.execution?.syncStatus!=='clean'});},
    async recover(executionId){return store.load(executionId);},
    async list(options={}){return store.list(options);},
    async latest(options={}){return (await store.list(options))[0]||null;},
    async purgeExpired(){return store.purgeExpired?.()||0;},
    async settle(execution){if(SETTLED.has(execution?.status)&&execution?.syncStatus==='clean')await store.remove(execution.id);},
    async synchronize(){if(!isOnline())return {online:false,attempted:0,results:[]};if(!commandBus?.flushPending)return {online:true,attempted:0,results:[]};return commandBus.flushPending();},
  });
}
