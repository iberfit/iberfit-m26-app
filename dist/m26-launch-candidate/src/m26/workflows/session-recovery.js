import { createBrowserKeyValueStore,createMemoryKeyValueStore } from '../platform/key-value-store.js';
import { recoverExecutionTimers } from './session-timer.js';
const VERSION=1;
const RECOVERABLE=new Set(['ready','active','paused','awaiting_feedback','completed','cancelled']);
function clone(value){return value==null?value:structuredClone(value);}
function safeIso(value=new Date()){return new Date(value).toISOString();}
const FORBIDDEN_CREDENTIAL_KEYS=new Set(['token','accessToken','access_token','refreshToken','refresh_token','password','authorization','auth']);
function containsCredentialKeys(value,seen=new Set()){if(!value||typeof value!=='object'||seen.has(value))return false;seen.add(value);for(const [key,child] of Object.entries(value)){if(FORBIDDEN_CREDENTIAL_KEYS.has(key))return true;if(containsCredentialKeys(child,seen))return true;}return false;}
function sanitizeExecution(execution){
  const out=clone(execution);delete out.token;delete out.accessToken;delete out.access_token;delete out.refreshToken;delete out.refresh_token;delete out.password;delete out.authorization;delete out.auth;return out;
}
export function validateExecutionSnapshot(snapshot){
  const errors=[];
  if(snapshot?.schemaVersion!==VERSION)errors.push('SCHEMA_VERSION_INVALID');
  if(!String(snapshot?.ownerId||'').trim())errors.push('OWNER_ID_REQUIRED');
  if(!snapshot?.execution?.id||!snapshot?.execution?.sessionId||!snapshot?.execution?.clientId)errors.push('EXECUTION_IDENTITY_REQUIRED');
  if(!RECOVERABLE.has(snapshot?.execution?.status))errors.push('EXECUTION_STATUS_INVALID');
  if(!Array.isArray(snapshot?.execution?.queue)||snapshot.execution.queue.length===0)errors.push('EXECUTION_QUEUE_REQUIRED');
  if(!snapshot?.session?.id||snapshot.session.id!==snapshot?.execution?.sessionId)errors.push('SESSION_MISMATCH');
  if(snapshot?.containsCredentials===true||containsCredentialKeys(snapshot?.execution)||containsCredentialKeys(snapshot?.session))errors.push('CREDENTIALS_FORBIDDEN');
  return {ok:errors.length===0,errors};
}
export function createExecutionSnapshot({execution,session,ownerId,appointmentId=null,sessionRevision=0,savedAt=new Date(),dirty=true}={}){
  if(!execution||!session)throw new Error('M26_RECOVERY_CONTEXT_REQUIRED');
  const snapshot={schemaVersion:VERSION,ownerId:String(ownerId||'').trim(),savedAt:safeIso(savedAt),dirty:Boolean(dirty),appointmentId:appointmentId||null,sessionRevision:Number(sessionRevision||0),execution:sanitizeExecution(execution),session:clone(session),containsCredentials:false};
  const validation=validateExecutionSnapshot(snapshot);if(!validation.ok)throw new Error(`M26_RECOVERY_SNAPSHOT_INVALID:${validation.errors.join(',')}`);return snapshot;
}
export function reconcileExecutionSnapshots({local,remote}={}){
  if(!local)return {kind:'remote',snapshot:clone(remote),conflict:null};if(!remote)return {kind:'local',snapshot:clone(local),conflict:null};
  const localRevision=Number(local.execution?.revision||0),remoteRevision=Number(remote.execution?.revision||0);
  if(['completed','cancelled'].includes(remote.execution?.status)&&remoteRevision>=localRevision)return {kind:'remote',snapshot:clone(remote),conflict:null};
  if(remoteRevision>localRevision&&local.dirty)return {kind:'conflict',snapshot:clone(local),conflict:{code:'REMOTE_REVISION_AHEAD',localRevision,remoteRevision,localStatus:local.execution?.status,remoteStatus:remote.execution?.status}};
  if(remoteRevision>localRevision)return {kind:'remote',snapshot:clone(remote),conflict:null};
  return {kind:'local',snapshot:clone(local),conflict:null};
}
export function createExecutionRecoveryStore({storage=createBrowserKeyValueStore(),ownerId,prefix='m26:execution:',now=()=>new Date(),ttlDays=30}={}){
  const owner=String(ownerId||'').trim();if(!owner)throw new Error('M26_RECOVERY_OWNER_REQUIRED');
  const ownerPrefix=`${prefix}${owner}:`;const key=(executionId)=>`${ownerPrefix}${executionId}`;
  async function save(context){const snapshot=createExecutionSnapshot({...context,ownerId:owner,savedAt:now()});await storage.set(key(snapshot.execution.id),snapshot);return clone(snapshot);}
  async function load(executionId){const snapshot=await storage.get(key(executionId));if(!snapshot)return null;const validation=validateExecutionSnapshot(snapshot);if(!validation.ok){await storage.remove(key(executionId));return null;}recoverExecutionTimers(snapshot.execution,new Date(now()).getTime());return clone(snapshot);}
  async function list({clientId,includeSettled=false}={}){const cutoff=new Date(now()).getTime()-ttlDays*86400000;const out=[];for(const [,snapshot] of await storage.entries(ownerPrefix)){const validation=validateExecutionSnapshot(snapshot);if(!validation.ok)continue;if(new Date(snapshot.savedAt).getTime()<cutoff)continue;if(clientId&&snapshot.execution.clientId!==clientId)continue;if(!includeSettled&&['completed','cancelled'].includes(snapshot.execution.status)&&snapshot.execution.syncStatus==='clean')continue;recoverExecutionTimers(snapshot.execution,new Date(now()).getTime());out.push(clone(snapshot));}return out.sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));}
  async function remove(executionId){await storage.remove(key(executionId));}
  async function purgeExpired(){const cutoff=new Date(now()).getTime()-ttlDays*86400000;let removed=0;for(const [storageKey,snapshot] of await storage.entries(ownerPrefix)){if(!snapshot?.savedAt||new Date(snapshot.savedAt).getTime()<cutoff){await storage.remove(storageKey);removed+=1;}}return removed;}
  async function clearOwner(){await storage.clear(ownerPrefix);}
  return Object.freeze({ownerId:owner,save,load,list,remove,purgeExpired,clearOwner});
}
export function createMemoryExecutionRecoveryStore(options={}){return createExecutionRecoveryStore({...options,storage:createMemoryKeyValueStore()});}
export function createExecutionRecoveryCoordinator({store,commandBus,isOnline=()=>globalThis.navigator?.onLine!==false}={}){
  if(!store?.save||!store?.load||!store?.remove)throw new Error('M26_RECOVERY_STORE_REQUIRED');
  return Object.freeze({
    async persist(context){return store.save({...context,dirty:context?.execution?.syncStatus!=='clean'});},
    async recover(executionId){return store.load(executionId);},
    async settle(execution){if(['completed','cancelled'].includes(execution?.status)&&execution?.syncStatus==='clean')await store.remove(execution.id);},
    async synchronize(){if(!isOnline())return {online:false,attempted:0,results:[]};if(!commandBus?.flushPending)return {online:true,attempted:0,results:[]};return commandBus.flushPending();},
  });
}
