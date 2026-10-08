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
      await queueStore.set(
        keyFor(ownerPrefix,record),
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
    }

    if(!isOnline()){
      return Object.freeze({
        ok:true,
        queued:true,
        synced:false,
        pending:await pendingCount(),
      });
    }

    return flushUnlocked({
      clientId:safeClientId,
      provider:safeSource,
    });
  }

  async function flushUnlocked({
    clientId='',
    provider='',
  }={}){
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
    const token=await getToken();

    for(const groupEntries of groups.values()){
      const records=groupEntries.map(([,item])=>item.record);
      const groupClientId=groupEntries[0][1].clientId;
      const groupProvider=groupEntries[0][1].provider;

      for(const batch of chunks(groupEntries,200)){
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
            if(revoked){
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

    await refreshState({
      reason:'wearables-synchronized',
    });

    return Object.freeze({
      ok:true,
      queued:false,
      synced:true,
      imported,
      stale,
      pending:await pendingCount(),
    });
  }

  async function revoke({
    provider,
    deleteData=false,
  }={}){
    const safeSource=safeProvider(provider);
    // Block new staged or queued work at the moment of revocation, not after the network request.
    blockedProviders.add(safeSource);
    explicitGrants.delete(safeSource);
    return serialize(async()=>{
    const token=await getToken();
    const result=await transport.revokeWearableConnection(
      token,
      safeSource,
      Boolean(deleteData),
    );

    for(const [key,item] of await queuedEntries()){
      if(item?.provider===safeSource){
        await queueStore.remove(key);
      }
    }

    await refreshState({
      reason:'wearable-revoked',
    });

    return result;
    });
  }

  async function deleteAll(){
    deleteRequested=true;
    explicitGrants.clear();
    return serialize(async()=>{
    const token=await getToken();
    const result=await transport.deleteWearableData(token);
    await queueStore.clear(ownerPrefix);

    await refreshState({
      reason:'wearables-deleted',
    });

    return result;
    });
  }

  async function clearOwner(){
    deleteRequested=true;
    explicitGrants.clear();
    return serialize(()=>queueStore.clear(ownerPrefix));
  }

  async function reauthorize({provider='normalized_file',scopes=[]}={}){
    const source=safeProvider(provider);
    if(source!=='normalized_file'||!Array.isArray(scopes)||!scopes.length)
      throw new Error('M26_CONNECTED360_CLIENT_FILE_REQUIRED');
    if(!isOnline())throw new Error('M26_CONNECTED360_ONLINE_REAUTHORIZE_REQUIRED');
    if(typeof transport.reauthorizeWearable!=='function'
      ||typeof transport.wearableAuthorizationStatus!=='function')
      throw new Error('M26_CONNECTED360_REAUTHORIZE_UNAVAILABLE');
    return serialize(async()=>{
      const token=await getToken();
      const status=await transport.wearableAuthorizationStatus(token,source);
      let result;
      if(status.authorized===true){
        if(scopes.some(metric=>!status.scopes?.includes(metric)))
          throw new Error('M26_CONNECTED360_SCOPE_EXPANSION_REQUIRES_REVOKE');
        result=Object.freeze({...status,alreadyAuthorized:true});
      }else{
        result=await transport.reauthorizeWearable(token,{
          provider:source,expectedCursor:status.revocationCursor,
          expectedGrant:status.grantId||null,scopes,
        });
      }
      // Never upgrade an old offline import to a newly granted generation.
      for(const [key,item] of await queuedEntries()){
        if(item?.provider===source)await queueStore.remove(key);
      }
      explicitGrants.set(source,result.grantId);
      blockedProviders.delete(source);
      deleteRequested=false;
      await refreshState({reason:'wearable-reauthorized'});
      return result;
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
    pendingCount,
    clearOwner,
  });
}
