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

  async function stage({
    clientId,
    provider,
    records=[],
  }={}){
    const safeClientId=safeId(
      clientId,
      'M26_WEARABLE_CLIENT_REQUIRED',
    );
    const safeSource=safeProvider(provider);
    const normalized=deduplicateWearableDailyRecords(records)
      .filter((record)=>
        record.clientId===safeClientId&&
        record.provider===safeSource
      );

    if(!normalized.length){
      throw new Error('M26_WEARABLE_RECORDS_REQUIRED');
    }

    for(const record of normalized){
      await queueStore.set(
        keyFor(ownerPrefix,record),
        {
          ownerId:owner,
          record:clone(record),
          clientId:safeClientId,
          provider:safeSource,
          queuedAt:new Date().toISOString(),
          attempts:0,
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

    return flush({
      clientId:safeClientId,
      provider:safeSource,
    });
  }

  async function flush({
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

    const safeClientId=clientId
      ?safeId(clientId,'M26_WEARABLE_CLIENT_REQUIRED')
      :'';

    const safeSource=provider
      ?safeProvider(provider)
      :'';

    const entries=(await queuedEntries()).filter(([,item])=>
      (!safeClientId||item?.clientId===safeClientId)&&
      (!safeSource||item?.provider===safeSource)
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
      const groupKey=`${item.clientId}|${item.provider}`;
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
          const result=await transport.importWearableSummaries(
            token,
            {records:batchRecords},
          );

          if(Number(result?.rejected||0)!==0){
            throw new Error('M26_WEARABLE_REMOTE_REJECTED');
          }

          imported+=Number(result?.accepted||0);
          stale+=Number(result?.stale||0);

          for(const [key] of batch){
            await queueStore.remove(key);
          }
        }catch(error){
          for(const [key,item] of batch){
            await queueStore.set(
              key,
              {
                ...item,
                attempts:Number(item?.attempts||0)+1,
                lastError:String(error?.message||error)
                  .replace(/[^A-Z0-9_:-]/giu,'')
                  .slice(0,120),
              },
            );
          }

          throw error;
        }
      }

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
  }

  async function deleteAll(){
    const token=await getToken();
    const result=await transport.deleteWearableData(token);
    await queueStore.clear(ownerPrefix);

    await refreshState({
      reason:'wearables-deleted',
    });

    return result;
  }

  async function clearOwner(){
    await queueStore.clear(ownerPrefix);
  }

  return Object.freeze({
    stage,
    flush,
    revoke,
    deleteAll,
    pendingCount,
    clearOwner,
  });
}
