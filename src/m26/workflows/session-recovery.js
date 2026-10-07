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
// Explicit local execution evidence must survive a newer remote final state.
// Keep true zero/false values; do not compare volatile sync state or timers.
function localEvidenceIsIncluded(local,remote,depth=0){
  if(depth>40)return false;
  if(Object.is(local,remote))return true;
  if(local===null||remote===null)return false;
  if(Array.isArray(local)){
    return Array.isArray(remote)&&local.length<=remote.length
      &&local.every((entry,index)=>localEvidenceIsIncluded(entry,remote[index],depth+1));
  }
  if(local&&typeof local==='object'){
    if(!remote||typeof remote!=='object'||Array.isArray(remote))return false;
    return Object.keys(local).every((key)=>Object.prototype.hasOwnProperty.call(remote,key)
      &&localEvidenceIsIncluded(local[key],remote[key],depth+1));
  }
  return false;
}
function remotePreservesLocalEvidence(local,remote){
  for(const field of ['queue','results','events','skippedSets','skippedExercises','substitutions','feedback','activeSetDraft','finalFeedbackDraft']){
    const value=local?.[field];
    if(value===undefined||value===null)continue;
    if(!localEvidenceIsIncluded(value,remote?.[field]))return false;
  }
  return true;
}
export function reconcileExecutionSnapshots({local,remote}={}){
  if(!local)return {kind:'remote',snapshot:clone(remote),conflict:null};if(!remote)return {kind:'local',snapshot:clone(local),conflict:null};
  const localValidation=validateExecutionSnapshot(local),remoteValidation=validateExecutionSnapshot(remote);
  if(!localValidation.ok&&!remoteValidation.ok)return {kind:'invalid',snapshot:null,conflict:{code:'BOTH_SNAPSHOTS_INVALID',localErrors:localValidation.errors,remoteErrors:remoteValidation.errors}};
  if(!localValidation.ok)return {kind:'remote',snapshot:clone(remote),conflict:null};if(!remoteValidation.ok)return {kind:'local',snapshot:clone(local),conflict:null};
  if(local.ownerId!==remote.ownerId||local.execution.id!==remote.execution.id||local.execution.clientId!==remote.execution.clientId||local.execution.sessionId!==remote.execution.sessionId)return {kind:'conflict',snapshot:clone(local),conflict:{code:'SNAPSHOT_SCOPE_MISMATCH'}};
  const localRevision=Number(local.execution.revision||0),remoteRevision=Number(remote.execution.revision||0);
  if(SETTLED.has(remote.execution.status)&&remoteRevision>=localRevision){
    if(SETTLED.has(local.execution.status)&&local.execution.status!==remote.execution.status)
      return {kind:'conflict',snapshot:clone(local),conflict:{code:'SNAPSHOT_FINAL_STATUS_CONFLICT',localRevision,remoteRevision}};
    if(local.dirty&&!remotePreservesLocalEvidence(local.execution,remote.execution))
      return {kind:'conflict',snapshot:clone(local),conflict:{code:'REMOTE_SETTLED_LOCAL_EVIDENCE_CONFLICT',localRevision,remoteRevision}};
    return {kind:'remote',snapshot:clone(remote),conflict:null};
  }
  if(remoteRevision>localRevision&&local.dirty)return {kind:'conflict',snapshot:clone(local),conflict:{code:'REMOTE_REVISION_AHEAD',localRevision,remoteRevision,localStatus:local.execution.status,remoteStatus:remote.execution.status}};
  if(remoteRevision>localRevision)return {kind:'remote',snapshot:clone(remote),conflict:null};
  return {kind:'local',snapshot:clone(local),conflict:null};
}
function arrSyncIds(value){
  if(!Array.isArray(value))return [];
  return [...new Set(value.map((item)=>cleanId(item)).filter(Boolean))];
}
function syncOperationId(result){return cleanId(result?.command?.operationId||result?.operationId||'');}
function syncRevision(result){
  const values=[result?.response?.executionRevision,result?.response?.remoteRevision,result?.response?.revision]
    .map((value)=>finiteInteger(value,{min:0}))
    .filter((value)=>value!==null);
  return values.length?Math.max(...values):null;
}
export function reconcileExecutionSyncResult(execution,syncResult={}){
  if(!execution||typeof execution!=='object'||Array.isArray(execution))return Object.freeze({changed:false,matched:0,acked:0,conflicts:0,rejected:0,pending:0});
  const pendingIds=new Set(arrSyncIds(execution.pendingOperationIds));
  const originalStatus=String(execution.syncStatus||'clean');
  const originalError=execution.lastSyncError??null;
  let matched=0,acked=0,conflicts=0,rejected=0;
  let maxRevision=finiteInteger(execution.revision,{min:0})??0;
  let conflictCode=null,rejectedCode=null;
  for(const result of Array.isArray(syncResult?.results)?syncResult.results:[]){
    const operationId=syncOperationId(result);
    if(!operationId||!pendingIds.has(operationId))continue;
    const kind=String(result?.kind||'').toLowerCase();
    if(result?.ok===true&&(kind==='ack'||kind==='duplicate')){
      matched+=1;
      pendingIds.delete(operationId);
      acked+=1;
      const revision=syncRevision(result);
      if(revision!==null)maxRevision=Math.max(maxRevision,revision);
      continue;
    }
    if(kind==='conflict'){
      matched+=1;
      pendingIds.delete(operationId);
      conflicts+=1;
      conflictCode=String(result?.response?.reason||result?.error||'REVISION_CONFLICT').slice(0,240);
      continue;
    }
    if(kind==='rejected'){
      matched+=1;
      pendingIds.delete(operationId);
      rejected+=1;
      rejectedCode=String(result?.response?.reason||result?.error||'REJECTED').slice(0,240);
    }
  }
  if(!matched)return Object.freeze({changed:false,matched:0,acked:0,conflicts:0,rejected:0,pending:pendingIds.size});
  execution.pendingOperationIds=[...pendingIds];
  execution.revision=maxRevision;
  if(conflicts){
    execution.syncStatus='conflict';
    execution.lastSyncError=conflictCode;
  }else if(rejected){
    execution.syncStatus='rejected';
    execution.lastSyncError=rejectedCode;
  }else if(['conflict','rejected'].includes(originalStatus)){
    execution.syncStatus=originalStatus;
    execution.lastSyncError=originalError;
  }else if(pendingIds.size){
    execution.syncStatus='pending';
    execution.lastSyncError=null;
  }else{
    execution.syncStatus='clean';
    execution.lastSyncError=null;
  }
  return Object.freeze({changed:true,matched,acked,conflicts,rejected,pending:pendingIds.size});
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
export function createExecutionRecoveryCoordinator({store,commandBus,isOnline=()=>globalThis.navigator?.onLine!==false,getActiveContext=()=>null,onReconcileError=()=>{}}={}){
  if(!store?.save||!store?.load||!store?.list||!store?.remove)throw new Error('M26_RECOVERY_STORE_REQUIRED');
  async function overlayDurableCompletion(snapshot){
    if(!snapshot?.execution||snapshot.execution.status==='cancelled'||!commandBus?.recoverExecutionCompletion)return snapshot;
    try{
      const recovered=await commandBus.recoverExecutionCompletion(snapshot.execution.id);
      if(!recovered)return snapshot;
      const operation=recovered.operation,patch=recovered.patch;
      const operationStatus=String(operation?.status||'').toLowerCase();
      if(!['pending','conflict','rejected','ack'].includes(operationStatus))return snapshot;
      if(
        patch?.id!==snapshot.execution.id||
        patch?.sessionId!==snapshot.execution.sessionId||
        patch?.clientId!==snapshot.execution.clientId||
        patch?.status!=='completed'
      )return snapshot;
      const syncStatus=operationStatus==='ack'?'clean':operationStatus;
      const nextExecution={
        ...clone(patch),
        syncStatus,
        pendingOperationIds:operationStatus==='pending'?[operation.operationId]:[],
        lastSyncError:['conflict','rejected'].includes(operationStatus)?(operation.errorCode||operationStatus.toUpperCase()):(operationStatus==='pending'?(operation.errorCode||null):null),
        recoveredAt:safeIso(),
      };
      const candidate={...clone(snapshot),execution:nextExecution,dirty:syncStatus!=='clean',savedAt:safeIso()};
      const validation=validateExecutionSnapshot(candidate);
      if(!validation.ok)throw new Error(`M26_RECOVERY_DURABLE_COMPLETION_INVALID:${validation.errors.join(',')}`);
      const saved=await store.save({
        execution:nextExecution,
        session:snapshot.session,
        appointmentId:snapshot.appointmentId||null,
        sessionRevision:finiteInteger(snapshot.sessionRevision??snapshot.session?.revision??0,{min:0})??0,
        dirty:syncStatus!=='clean',
      });
      if(operationStatus==='ack'&&commandBus?.settleExecutionCompletion){
        const settled=await commandBus.settleExecutionCompletion(operation.operationId);
        if(settled)await store.remove(nextExecution.id);
      }
      return saved;
    }catch(error){
      try{onReconcileError(error);}catch{}
      return snapshot;
    }
  }
  function applyRecoveredCompletion(context,snapshot){
    if(!context?.execution||!snapshot?.execution)return false;
    if(snapshot.execution.id!==context.execution.id||snapshot.execution.status!=='completed'||context.execution.status==='cancelled')return false;
    Object.assign(context.execution,clone(snapshot.execution));
    return true;
  }
  async function recoveredList(options={}){
    const includeSettled=options?.includeSettled===true;
    const snapshots=await store.list({...options,includeSettled:true}),out=[];
    for(const snapshot of snapshots){
      const recovered=await overlayDurableCompletion(snapshot);
      if(!recovered)continue;
      if(!includeSettled&&SETTLED.has(recovered.execution?.status)&&recovered.execution?.syncStatus==='clean')continue;
      out.push(recovered);
    }
    return out.sort((a,b)=>(parseDate(b?.savedAt)||0)-(parseDate(a?.savedAt)||0));
  }
  async function reconcileActiveContext(syncResult){
    let context;
    try{context=getActiveContext?.()||null;}catch(error){try{onReconcileError(error);}catch{}return false;}
    if(!context?.execution||!context?.session)return false;
    const completionOperationId=cleanId(context.execution.id);
    const durableCompletionPending=arrSyncIds(context.execution.pendingOperationIds).includes(completionOperationId)&&typeof commandBus?.recoverExecutionCompletion==='function';
    if(durableCompletionPending){
      try{
        const checkpoint=await store.save({
          execution:context.execution,
          session:context.session,
          appointmentId:context.appointmentId||null,
          sessionRevision:finiteInteger(context.sessionRevision??context.session?.revision??0,{min:0})??0,
          dirty:true,
        });
        const recovered=await overlayDurableCompletion(checkpoint);
        if(applyRecoveredCompletion(context,recovered)){
          const completionResult=(Array.isArray(syncResult?.results)?syncResult.results:[]).find((item)=>syncOperationId(item)===completionOperationId);
          const confirmedRevision=syncRevision(completionResult);
          if(confirmedRevision!==null)context.execution.revision=Math.max(finiteInteger(context.execution.revision,{min:0})??0,confirmedRevision);
          return true;
        }
      }catch(error){
        try{onReconcileError(error);}catch{}
      }
    }
    const nextExecution=clone(context.execution);
    const reconciliation=reconcileExecutionSyncResult(nextExecution,syncResult);
    if(!reconciliation.changed)return false;
    try{
      if(SETTLED.has(nextExecution.status)&&nextExecution.syncStatus==='clean'){
        if(durableCompletionPending){
          await store.save({
            execution:nextExecution,
            session:context.session,
            appointmentId:context.appointmentId||null,
            sessionRevision:finiteInteger(context.sessionRevision??context.session?.revision??0,{min:0})??0,
            dirty:false,
          });
        }
        Object.assign(context.execution,nextExecution);
        if(durableCompletionPending&&typeof commandBus?.settleExecutionCompletion==='function')await commandBus.settleExecutionCompletion(nextExecution.id);
        await store.remove(nextExecution.id);
        return true;
      }
      await store.save({
        execution:nextExecution,
        session:context.session,
        appointmentId:context.appointmentId||null,
        sessionRevision:finiteInteger(context.sessionRevision??context.session?.revision??0,{min:0})??0,
        dirty:nextExecution.syncStatus!=='clean',
      });
      Object.assign(context.execution,nextExecution);
      return true;
    }catch(error){
      try{onReconcileError(error);}catch{}
      return false;
    }
  }
  return Object.freeze({
    async persist(context){
      const saved=await store.save({...context,dirty:context?.execution?.syncStatus!=='clean'});
      const recovered=await overlayDurableCompletion(saved);
      applyRecoveredCompletion(context,recovered);
      return recovered;
    },
    async recover(executionId){return overlayDurableCompletion(await store.load(executionId));},
    async list(options={}){return recoveredList(options);},
    async latest(options={}){return (await recoveredList(options))[0]||null;},
    async purgeExpired(){return store.purgeExpired?.()||0;},
    async settle(execution){
      if(!SETTLED.has(execution?.status)||execution?.syncStatus!=='clean')return;
      try{
        if(commandBus?.settleExecutionCompletion)await commandBus.settleExecutionCompletion(execution.id);
        await store.remove(execution.id);
      }catch(error){try{onReconcileError(error);}catch{}}
    },
    async synchronize(){
      if(!isOnline())return {online:false,attempted:0,results:[]};
      if(!commandBus?.flushPending)return {online:true,attempted:0,results:[]};
      const result=await commandBus.flushPending();
      await reconcileActiveContext(result);
      return result;
    },
  });
}
