import {isConnected360QaNativeAvailable} from './qa-native-channel.js';
import {createQaNativeDailyRecord,projectQaNativeRecordToV44} from './qa-native-provenance.js';

const PROVIDER='health_connect';
const METRICS=Object.freeze(['steps','sleepMinutes','restingHeartRate']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_PREVIEW_AGE_MS=20*60*1000;
const FUTURE_TOLERANCE_MS=5*60*1000;
const DATE=/^\d{4}-\d{2}-\d{2}$/u;
const ISO=/^\d{4}-\d{2}-\d{2}T/u;

/**
 * An explicitly confirmed QA-only import, never a production native bridge.
 * 1. Client reads HC in Android and previews it in Canary (no storage).
 * 2. Client separately confirms remote storage.
 * 3. A live browser session obtains a server-side consent generation.
 * 4. Exactly that generation authorizes a direct, online-only RPC.
 *
 * No background retry, IndexedDB health-data queue or silent scopes escalation.
 * The server determines the client from auth.uid()/iberfit_client_id().
 */
export function createConnected360QaImporter({
  scope=globalThis,
  transport,
  remoteSync,
  getToken,
  getIdentity,
  isOnline=()=>scope?.navigator?.onLine!==false,
  refreshState=async()=>{},
  now=()=>Date.now(),
}={}){
  if(typeof getToken!=='function'||typeof getIdentity!=='function'||
    typeof transport?.importWearableAuthorized!=='function'||
    typeof remoteSync?.reauthorize!=='function'||
    typeof remoteSync?.currentAuthorization!=='function')
    throw new Error('M26_HEALTH_QA_IMPORT_DEPENDENCIES_REQUIRED');

  let preview=null;
  let busy=false;
  let disposed=false;

  function identity(){
    if(disposed)throw new Error('M26_HEALTH_QA_DISPOSED');
    if(!isConnected360QaNativeAvailable(scope))
      throw new Error('M26_HEALTH_QA_BRIDGE_UNAVAILABLE');
    const current=getIdentity();
    const ownerId=String(current?.ownerId||'').trim();
    const clientId=String(current?.clientId||'').trim();
    if(String(current?.role||'').toLowerCase()!=='client'||
      !ownerId||!UUID.test(clientId))
      throw new Error('M26_HEALTH_QA_CLIENT_REQUIRED');
    return {ownerId,clientId};
  }

  function assertSameSession(expected){
    const current=identity();
    if(current.ownerId!==expected.ownerId||
      current.clientId!==expected.clientId)
      throw new Error('M26_HEALTH_QA_SESSION_CHANGED');
    return current;
  }

  function toRecord(row,clientId,at){
    if(row?.provider!==PROVIDER||typeof row.date!=='string'||
      !DATE.test(row.date)||typeof row.acquiredAt!=='string'||
      !ISO.test(row.acquiredAt)||
      Number.isNaN(Date.parse(row.date+'T12:00:00Z'))||
      new Date(row.date+'T12:00:00Z').toISOString().slice(0,10)!==row.date)
      throw new Error('M26_HEALTH_QA_PREVIEW_INVALID');
    const acquired=Date.parse(row.acquiredAt);
    if(!Number.isFinite(acquired)||
      acquired>at+FUTURE_TOLERANCE_MS||
      acquired<at-MAX_PREVIEW_AGE_MS)
      throw new Error('M26_HEALTH_QA_PREVIEW_EXPIRED');
    const value=row.metrics||{};
    const metrics={};
    for(const metric of METRICS){
      if(value[metric]===null||value[metric]===undefined)continue;
      const v=value[metric];
      if(!Number.isInteger(v)||v<0||
        (metric==='steps'&&v>200000)||
        (metric==='sleepMinutes'&&v>1440)||
        (metric==='restingHeartRate'&&(v<25||v>240)))
        throw new Error('M26_HEALTH_QA_PREVIEW_INVALID');
      metrics[metric]=v;
    }
    if(Object.keys(metrics).length===0)
      throw new Error('M26_HEALTH_QA_PREVIEW_INVALID');
    // Preserve acquisition separately from unknown source timestamps.
    // Project to V44 only at the final, explicitly approved RPC boundary.
    return createQaNativeDailyRecord({
      clientId,date:row.date,metrics,acquiredAt:new Date(acquired).toISOString(),
      aggregationTimeZone:row.aggregationTimeZone??null,
    });
  }

  function capture(readResult){
    if(busy)throw new Error('M26_HEALTH_QA_BUSY');
    const client=identity();
    clear(); // Never permit a stale approved preview after a failed new read.
    if(readResult?.provider!==PROVIDER||
      readResult?.linked!==false||
      readResult?.persisted!==false||
      !readResult?.userConfirmedLocalRead||
      !Array.isArray(readResult?.rows)||
      !Array.isArray(readResult?.grantedMetrics)||
      readResult.rows.length<1||readResult.rows.length>7)
      throw new Error('M26_HEALTH_QA_PREVIEW_INVALID');
    const scopes=[...new Set(readResult.grantedMetrics)];
    if(!scopes.length||scopes.length>3||
      scopes.some(metric=>!METRICS.includes(metric)))
      throw new Error('M26_HEALTH_QA_PREVIEW_INVALID');
    const acquiredAt=now();
    const dates=new Set();
    const records=readResult.rows.map(row=>{
      if(dates.has(row.date))throw new Error('M26_HEALTH_QA_PREVIEW_INVALID');
      dates.add(row.date);
      const record=toRecord(row,client.clientId,acquiredAt);
      if(Object.keys(record.metrics).some(m=>!scopes.includes(m)))
        throw new Error('M26_HEALTH_QA_PREVIEW_SCOPE_INVALID');
      return record;
    });
    const actual=METRICS.filter(metric=>
      records.some(record=>Number.isFinite(record.metrics[metric]))
    );
    if(!actual.length)throw new Error('M26_HEALTH_QA_PREVIEW_INVALID');
    preview=Object.freeze({
      ownerId:client.ownerId,
      clientId:client.clientId,
      records:Object.freeze(records),
      scopes:Object.freeze(actual),
      capturedAt:acquiredAt,
    });
    return Object.freeze({
      recordCount:records.length,
      scopes:preview.scopes,
      clientControlled:true,
      persisted:false,
    });
  }

  function clear(){
    preview=null;
  }

  function assertLivePreview(expected){
    if(disposed)throw new Error('M26_HEALTH_QA_DISPOSED');
    if(preview!==expected)throw new Error('M26_HEALTH_QA_PREVIEW_DISCARDED');
  }

  async function commit({confirmed=false}={}){
    if(confirmed!==true)throw new Error('M26_HEALTH_QA_EXPLICIT_CONSENT_REQUIRED');
    if(busy)throw new Error('M26_HEALTH_QA_BUSY');
    const pending=preview;
    if(!pending)throw new Error('M26_HEALTH_QA_PREVIEW_REQUIRED');
    if(!isOnline())throw new Error('M26_HEALTH_QA_ONLINE_REQUIRED');
    const client=assertSameSession(pending);
    const at=now();
    if(at-pending.capturedAt>MAX_PREVIEW_AGE_MS||
      pending.records.some(row=>Date.parse(row.provenance.acquiredAt)<at-MAX_PREVIEW_AGE_MS))
      throw new Error('M26_HEALTH_QA_PREVIEW_EXPIRED');
    busy=true;
    try{
      // User clicked "authorize and add". Does not happen during read/resume.
      const grant=await remoteSync.reauthorize({
        provider:PROVIDER,scopes:[...pending.scopes],
      });
      if(!UUID.test(String(grant?.grantId||'')))
        throw new Error('M26_HEALTH_QA_GRANT_INVALID');
      assertLivePreview(pending);
      assertSameSession(client);
      if(!isOnline())throw new Error('M26_HEALTH_QA_ONLINE_REQUIRED');
      // Local revocation wins before dispatch; server-side revocation fence
      // remains authoritative for any subsequent concurrent transaction.
      const liveGrant=await remoteSync.currentAuthorization({
        provider:PROVIDER,scopes:[...pending.scopes],
      });
      if(liveGrant?.grantId!==grant.grantId)
        throw new Error('M26_HEALTH_QA_GRANT_STALE');
      assertLivePreview(pending);
      assertSameSession(client);
      if(!isOnline())throw new Error('M26_HEALTH_QA_ONLINE_REQUIRED');
      // getToken is not forwarded to Android; it is used solely for an
      // authorized Supabase RPC in the authenticated web runtime.
      const token=await getToken();
      if(typeof token!=='string'||token.length<10)
        throw new Error('M26_HEALTH_QA_SESSION_REQUIRED');
      assertLivePreview(pending);
      assertSameSession(client);
      const result=await transport.importWearableAuthorized(
        token,grant.grantId,{records:pending.records.map(projectQaNativeRecordToV44)}
      );
      const accepted=Number(result?.accepted);
      const stale=Number(result?.stale);
      const rejected=Number(result?.rejected);
      if(result?.ok!==true||rejected!==0||
        !Number.isInteger(accepted)||accepted<0||
        !Number.isInteger(stale)||stale<0||
        accepted+stale!==pending.records.length)
        throw new Error('M26_HEALTH_QA_REMOTE_IMPORT_UNVERIFIED');
      // Never show another user the previous account's completion.
      assertLivePreview(pending);
      assertSameSession(client);
      clear();
      await refreshState({reason:'connected360-qa-manual-import'});
      return Object.freeze({
        ok:true,
        provider:PROVIDER,
        imported:accepted,
        unchanged:stale,
        recordCount:accepted+stale,
        persisted:true,
        automatic:false,
      });
    }finally{
      busy=false;
    }
  }

  return Object.freeze({
    capture,
    commit,
    clear,
    hasPreview:()=>!disposed&&preview!==null,
    isBusy:()=>busy,
    destroy:()=>{disposed=true;clear();},
  });
}
