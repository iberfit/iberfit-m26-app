import {
  M26_BROWSER_INDEXED_DB_SCHEMA_VERSION,
  createBrowserKeyValueStore,
} from '../platform/key-value-store.js';
import {deduplicateWearableDailyRecords} from './normalization.js';

const PREFIX='m26:wearable-sync:v44:';
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const PROVIDERS=new Set([
  'normalized_file',
  'health_connect',
  'samsung_health',
  'apple_health',
  'wear_os_health_services',
  'ble_direct',
  'strava',
  'garmin_connect',
  'fitbit',
  'oura',
]);
const METRICS=Object.freeze([
  'steps',
  'activeMinutes',
  'sleepMinutes',
  'restingHeartRate',
  'hrvMs',
  'activeEnergyKcal',
  'workoutMinutes',
]);
// Remote V46 QA authorization categories are distinct from V44 numeric daily
// fields. Do not change the file-summary queue's metrics or backfill behavior.
const AUTHORIZATION_SCOPES=Object.freeze([...METRICS,
  'generalHeartRate','exerciseSessions',
]);

function clone(value){
  return value==null?value:structuredClone(value);
}

function safeId(value,code){
  const id=String(value||'').trim();
  if(!SAFE_ID.test(id))throw new Error(code);
  return id;
}

function safeProvider(value){
  const provider=String(value||'').trim().toLowerCase();
  if(!PROVIDERS.has(provider))throw new Error('M26_WEARABLE_PROVIDER_UNKNOWN');
  return provider;
}

function keyFor(ownerPrefix,record){
  return `${ownerPrefix}${record.clientId}:${record.provider}:${record.date}`;
}

function chunks(values,size=200){
  const out=[];
  for(let index=0;index<values.length;index+=size){
    out.push(values.slice(index,index+size));
  }
  return out;
}

function scopesFor(records){
  return METRICS.filter((metric)=>
    records.some((record)=>Number.isFinite(record?.metrics?.[metric]))
  );
}

export function createWearableRemoteSync({
  transport,
  getToken,
  ownerId,
  refreshState=async()=>{},
  isOnline=()=>globalThis.navigator?.onLine!==false,
  queueStore=createBrowserKeyValueStore({
    dbName:'iberfit-m26',
    storeName:'wearable_sync_v44',
    version:M26_BROWSER_INDEXED_DB_SCHEMA_VERSION,
    sessionPrefix:'iberfit:m26:wearable-sync-v44:',
  }),
}={}){
  if(!transport||typeof getToken!=='function'){
    throw new Error('M26_WEARABLE_REMOTE_SYNC_REQUIRED');
  }

  const owner=safeId(
    ownerId,
    'M26_WEARABLE_OWNER_REQUIRED',
  );
  const ownerPrefix=`${PREFIX}owner/${owner}/`;
  const blockedProviders=new Set();
  const explicitGrants=new Map();
  const GRANT_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  let deleteRequested=false;
  // Logout retires this owner-scoped controller permanently: no stale UI may
  // mint a fresh authorization generation after another account signs in.
  let ownerDisposed=false;
  // Synchronous revocation intent invalidates even a queued or in-flight
  // reauthorization. A later explicit opt-in captures a new generation.
  let revocationGeneration=0;
  let operationTail=Promise.resolve();
  function serialize(task){
    const pending=operationTail.then(task,task);
    operationTail=pending.then(()=>{},()=>{});
    return pending;
  }

  async function queuedEntries(){
    const valid=[];

    for(const [key,item] of await queueStore.entries(ownerPrefix)){
      if(item?.ownerId!==owner){
        continue;
      }

      valid.push([key,item]);
    }

    return valid;
  }

  async function pendingCount(){
    return (await queuedEntries()).length;
  }

  async function stageUnlocked({
    clientId,
    provider,
    records=[],
    authorizationGrant=null,
  }={}){
    const safeClientId=safeId(
      clientId,
      'M26_WEARABLE_CLIENT_REQUIRED',
    );
    const safeSource=safeProvider(provider);
    if(deleteRequested||blockedProviders.has(safeSource))throw new Error('M26_WEARABLE_SOURCE_REVOKED');
    const grant=authorizationGrant||explicitGrants.get(safeSource)||null;
    if(grant&&!GRANT_ID.test(String(grant)))throw new Error('M26_CONNECTED360_GRANT_INVALID');
    // Every provider represented by an imported file needs a current v2 grant.
    // Native auto-sync will use the same contract once physically certified.
    if(!grant)throw new Error('M26_CONNECTED360_ONLINE_REAUTHORIZE_REQUIRED');
    const normalized=deduplicateWearableDailyRecords(records)
      .filter((record)=>
        record.clientId===safeClientId&&
        record.provider===safeSource
      );

    if(!normalized.length){
      throw new Error('M26_WEARABLE_RECORDS_REQUIRED');
    }

    for(const record of normalized){
      if(deleteRequested||blockedProviders.has(safeSource))throw new Error('M26_WEARABLE_SOURCE_REVOKED');
      const recordKey=keyFor(ownerPrefix,record);
      await queueStore.set(
        recordKey,
        {
          ownerId:owner,
          record:clone(record),
          clientId:safeClientId,
          provider:safeSource,
          queuedAt:new Date().toISOString(),
          attempts:0,
          authorizationGrant:grant,
        },
      );
      if(ownerDisposed||deleteRequested||blockedProviders.has(safeSource)){
        // Logout may have erased the queue WHILE IndexedDB set() awaited.
        // Retire the record before returning, even if the remote call stalls.
        await queueStore.remove(recordKey);
        throw new Error('M26_WEARABLE_SOURCE_REVOKED');
      }
    }

    if(!isOnline()){
      return Object.freeze({
        ok:true,
        queued:true,
        synced:false,
        pending:await pendingCount(),
      });
    }

    const result=await flushUnlocked({
      clientId:safeClientId,
      provider:safeSource,
    });
    if(deleteRequested||blockedProviders.has(safeSource))
      throw new Error('M26_WEARABLE_SOURCE_REVOKED');
    return result;
  }

  async function flushUnlocked({
    clientId='',
    provider='',
  }={}){
    const generation=revocationGeneration;
    if(!isOnline()){
      return Object.freeze({
        ok:true,
        queued:true,
        synced:false,
        pending:await pendingCount(),
      });
    }
    if(deleteRequested)return Object.freeze({ok:true,queued:false,synced:false,skipped:true,reason:'deleted',pending:0});

    const safeClientId=clientId
      ?safeId(clientId,'M26_WEARABLE_CLIENT_REQUIRED')
      :'';

    const safeSource=provider
      ?safeProvider(provider)
      :'';

    const entries=(await queuedEntries()).filter(([,item])=>
      (!safeClientId||item?.clientId===safeClientId)&&
      (!safeSource||item?.provider===safeSource)&&
      !blockedProviders.has(item?.provider)&&!item?.blockedReason
    );

    if(!entries.length){
      return Object.freeze({
        ok:true,
        queued:false,
        synced:true,
        imported:0,
        pending:await pendingCount(),
      });
    }

    const groups=new Map();

    for(const entry of entries){
      const item=entry[1];
      const groupKey=`${item.clientId}|${item.provider}|${item.authorizationGrant||"legacy"}`;
      if(!groups.has(groupKey))groups.set(groupKey,[]);
      groups.get(groupKey).push(entry);
    }

    let imported=0;
    let stale=0;
    let discarded=0;
    const token=await getToken();

    for(const groupEntries of groups.values()){
      if(deleteRequested)break;
      if(blockedProviders.has(groupEntries[0][1].provider))continue;
      const records=groupEntries.map(([,item])=>item.record);
      const groupClientId=groupEntries[0][1].clientId;
      const groupProvider=groupEntries[0][1].provider;

      // All legacy v44 entries lack a verifiable consent generation.
      // An earlier zero revocation cursor never constitutes authorization.
      if(!groupEntries[0][1].authorizationGrant){
        if(typeof transport.wearableAuthorizationStatus==='function'){
          const status=await transport.wearableAuthorizationStatus(token,groupProvider);
          if(!status?.authorized)blockedProviders.add(groupProvider);
        }
        for(const [key] of groupEntries)await queueStore.remove(key);
        discarded+=groupEntries.length;
        continue;
      }

      for(const batch of chunks(groupEntries,200)){
        // A logout, erase or revoke requested during an in-flight batch must
        // prevent every following batch, even though this operation is serialized.
        if(deleteRequested||blockedProviders.has(groupProvider))break;
        const batchRecords=batch.map(([,item])=>item.record);

        try{
          const grant=batch[0][1].authorizationGrant;
          const result=grant
            ?await transport.importWearableAuthorized(token,grant,{records:batchRecords})
            :await transport.importWearableSummaries(token,{records:batchRecords});

          if(Number(result?.rejected||0)!==0){
            throw new Error('M26_WEARABLE_REMOTE_REJECTED');
          }

          imported+=Number(result?.accepted||0);
          stale+=Number(result?.stale||0);

          for(const [key] of batch){
            await queueStore.remove(key);
          }
        }catch(error){
          const code=String(error?.message||error);
          const revoked=/M26_CONNECTED360_(?:GRANT_REVOKED|GRANT_STALE|CONSENT_REVOKED)|M26_WEARABLE_SOURCE_REVOKED/u.test(code);
          const invalid=/M26_WEARABLE_REMOTE_REJECTED|M26_CONNECTED360_IMPORT_(?:REJECTED|SCOPE_FORBIDDEN|SCOPE_INVALID)/u.test(code);
          if(revoked){
            blockedProviders.add(groupProvider);
            explicitGrants.delete(groupProvider);
          }
          for(const [key,item] of batch){
            if(ownerDisposed||deleteRequested||generation!==revocationGeneration||revoked||blockedProviders.has(groupProvider)){
              // On confirmed server-side revocation, erase stale personal data locally.
              await queueStore.remove(key);
              continue;
            }
            await queueStore.set(key,{
              ...item,
              attempts:Number(item?.attempts||0)+1,
              blockedReason:invalid?'review-required':null,
              lastError:code.replace(/[^A-Z0-9_:-]/giu,'').slice(0,120),
            });
          }
          throw error;
        }
      }

      // Never reactivate a legacy source after its revoke began mid-import.
      if(deleteRequested||blockedProviders.has(groupProvider))continue;
      // Authorized v2 import already linked the source in its transaction.
      if(groupEntries[0][1].authorizationGrant)continue;
      await transport.upsertWearableConnection(
        token,
        {
          clientId:groupClientId,
          provider:groupProvider,
          status:'active',
          syncEnabled:true,
          scopes:scopesFor(records),
          lastSyncedAt:new Date().toISOString(),
          metadata:{
            mode:groupProvider==='normalized_file'
              ?'confirmed_import'
              :groupProvider==='ble_direct'
                ?'direct_ble'
                :groupProvider==='wear_os_health_services'
                  ?'watch_native'
                  :'native_bridge',
            automatic:true,
          },
        },
      );
    }

    // A retired account must not receive the completion callback of a previous
    // session. The request already sent may finish, but no further batch runs.
    if(!deleteRequested&&!ownerDisposed&&generation===revocationGeneration)
      await refreshState({reason:'wearables-synchronized'});

    return Object.freeze({
      ok:true,
      queued:false,
      synced:true,
      imported,
      stale,
      discarded,
      pending:await pendingCount(),
    });
  }

  // Begin removing private local data before a previous authorized fetch
  // finishes. Attach the error handler immediately: the serialized server
  // operation may not observe this promise for several seconds.
  function beginLocalPurge(task){
    const pending=Promise.resolve().then(task);
    void pending.catch(()=>{});
    return pending;
  }

  async function purgeQueuedProvider(provider){
    for(const [key,item] of await queuedEntries()){
      if(item?.provider===provider)await queueStore.remove(key);
    }
  }

  async function revoke({
    provider,
    deleteData=false,
  }={}){
    const safeSource=safeProvider(provider);
    revocationGeneration+=1;
    blockedProviders.add(safeSource);
    explicitGrants.delete(safeSource);
    // Disconnect means queued private data cannot be uploaded again.
    // Do not hold the local purge hostage to remote revocation latency.
    const localPurge=beginLocalPurge(()=>purgeQueuedProvider(safeSource));
    return serialize(async()=>{
      await localPurge;
      const token=await getToken();
      const result=await transport.revokeWearableConnection(
        token,safeSource,Boolean(deleteData),
      );
      // A late IndexedDB write can complete while the remote call is running.
      await purgeQueuedProvider(safeSource);
      if(!ownerDisposed)await refreshState({reason:'wearable-revoked'});
      return result;
    });
  }

  async function deleteAll(){
    revocationGeneration+=1;
    deleteRequested=true;
    explicitGrants.clear();
    // Explicit erase must clear the local health queue before network access,
    // even if another operation is hung. A failed server deletion still
    // propagates: the UI must never claim server-side erasure prematurely.
    const localPurge=beginLocalPurge(()=>queueStore.clear(ownerPrefix));
    return serialize(async()=>{
      await localPurge;
      const token=await getToken();
      const result=await transport.deleteWearableData(token);
      await queueStore.clear(ownerPrefix);
      if(!ownerDisposed)await refreshState({reason:'wearables-deleted'});
      return result;
    });
  }

  async function clearOwner(){
    revocationGeneration+=1;
    ownerDisposed=true;
    deleteRequested=true;
    explicitGrants.clear();
    blockedProviders.clear();
    // Privacy P0: never queue the local health-data purge behind a hung
    // fetch/import. Concurrent writes and failed batches observe ownerDisposed
    // and remove their own keys before they can finish. No server grant is
    // manufactured, and an obsolete operation cannot refresh another account.
    await queueStore.clear(ownerPrefix);
  }

  async function reauthorize({provider='normalized_file',scopes=[],allowQaV46ScopeExtension=false}={}){
    if(ownerDisposed)throw new Error('M26_WEARABLE_OWNER_DISPOSED');
    const source=safeProvider(provider);
    if(!Array.isArray(scopes)||!scopes.length)
      throw new Error('M26_CONNECTED360_SCOPE_REQUIRED');
    if(!isOnline())throw new Error('M26_CONNECTED360_ONLINE_REAUTHORIZE_REQUIRED');
    if(typeof transport.reauthorizeWearable!=='function'
      ||typeof transport.wearableAuthorizationStatus!=='function')
      throw new Error('M26_CONNECTED360_REAUTHORIZE_UNAVAILABLE');
    const generation=revocationGeneration;
    return serialize(async()=>{
      const requireCurrent=()=>{
        if(ownerDisposed)throw new Error('M26_WEARABLE_OWNER_DISPOSED');
        if(generation!==revocationGeneration)
          throw new Error('M26_WEARABLE_AUTHORIZATION_SUPERSEDED');
      };
      requireCurrent();
      const token=await getToken();
      requireCurrent();
      const status=await transport.wearableAuthorizationStatus(token,source);
      requireCurrent();
      let result;
      if(status.authorized===true){
        const missing=scopes.filter(metric=>!status.scopes?.includes(metric));
        if(missing.length){
          // Only a direct V46 QA user action may extend an existing Health
          // Connect grant. Do not revoke V44 permissions or discard their data.
          if(allowQaV46ScopeExtension!==true||source!=='health_connect'
            ||missing.some(metric=>!['generalHeartRate','exerciseSessions'].includes(metric))
            ||typeof transport.extendConnected360QaV46Grant!=='function')
            throw new Error('M26_CONNECTED360_SCOPE_EXPANSION_REQUIRES_REVOKE');
          result=await transport.extendConnected360QaV46Grant(token,{
            provider:source,expectedGrant:status.grantId,
            expectedCursor:status.revocationCursor,scopes:missing,
          });
        }else result=Object.freeze({...status,alreadyAuthorized:true});
      }else{
        result=await transport.reauthorizeWearable(token,{
          provider:source,expectedCursor:status.revocationCursor,
          expectedGrant:status.grantId||null,scopes,
        });
      }
      requireCurrent();
      // Keep pending offline data from the same current consent generation.
      // Never upgrade any older, revoked or pre-consent queue.
      const entries=await queuedEntries();
      requireCurrent();
      for(const [key,item] of entries){
        requireCurrent();
        if(item?.provider===source&&(item.authorizationGrant!==result.grantId||item.blockedReason))
          await queueStore.remove(key);
      }
      requireCurrent();
      explicitGrants.set(source,result.grantId);
      blockedProviders.delete(source);
      deleteRequested=false;
      await refreshState({reason:'wearable-reauthorized'});
      requireCurrent();
      return result;
    });
  }

  // Only the V46 QA consent-submit button may call this wrapper.
  // A passive/background sync never gets access to scope extension.
  function reauthorizeV46({scopes=[]}={}){
    if(!Array.isArray(scopes)||!scopes.length||scopes.length>2
      ||scopes.some(metric=>!['generalHeartRate','exerciseSessions'].includes(metric)))
      return Promise.reject(new Error('M26_V46_QA_SCOPE_EXTENSION_INVALID'));
    return reauthorize({
      provider:'health_connect',scopes,allowQaV46ScopeExtension:true,
    });
  }

  // Used only by a previously consented native reconnect. A passive/background
  // refresh must NEVER call reauthorizeWearable or manufacture a grant.
  async function currentAuthorization({provider,scopes=[]}={}){
    const source=safeProvider(provider);
    if(ownerDisposed)throw new Error('M26_WEARABLE_OWNER_DISPOSED');
    if(deleteRequested||blockedProviders.has(source))throw new Error('M26_WEARABLE_SOURCE_REVOKED');
    if(!Array.isArray(scopes)||!scopes.length||scopes.some((scope)=>!AUTHORIZATION_SCOPES.includes(scope))){
      throw new Error('M26_CONNECTED360_SCOPE_REQUIRED');
    }
    if(!isOnline())throw new Error('M26_WEARABLE_NETWORK_REQUIRED');
    return serialize(async()=>{
      if(ownerDisposed)throw new Error('M26_WEARABLE_OWNER_DISPOSED');
      if(deleteRequested||blockedProviders.has(source))throw new Error('M26_WEARABLE_SOURCE_REVOKED');
      if(typeof transport.wearableAuthorizationStatus!=='function')
        throw new Error('M26_CONNECTED360_REAUTHORIZE_UNAVAILABLE');
      const status=await transport.wearableAuthorizationStatus(await getToken(),source);
      if(ownerDisposed)throw new Error('M26_WEARABLE_OWNER_DISPOSED');
      if(deleteRequested||blockedProviders.has(source))throw new Error('M26_WEARABLE_SOURCE_REVOKED');
      const grant=String(status?.grantId||'');
      if(status?.authorized!==true||!GRANT_ID.test(grant))
        throw new Error('M26_CONNECTED360_GRANT_STALE');
      if(scopes.some((scope)=>!status.scopes?.includes(scope)))
        throw new Error('M26_CONNECTED360_SCOPE_EXPANSION_REQUIRES_REVOKE');
      explicitGrants.set(source,grant);
      return Object.freeze({
        provider:source,
        grantId:grant,
        scopes:Object.freeze([...new Set(scopes)]),
        alreadyAuthorized:true,
      });
    });
  }

  function stage(params={}){
    const source=safeProvider(params.provider);
    if(deleteRequested||blockedProviders.has(source)){
      return Promise.reject(new Error('M26_WEARABLE_SOURCE_REVOKED'));
    }
    return serialize(()=>stageUnlocked(params));
  }
  function flush(params={}){return serialize(()=>flushUnlocked(params));}

  return Object.freeze({
    stage,
    flush,
    revoke,
    deleteAll,
    reauthorize,
    reauthorizeV46,
    currentAuthorization,
    pendingCount,
    clearOwner,
  });
}
