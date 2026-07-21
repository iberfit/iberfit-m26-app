import {detectWearableBridge,normalizeWearableProvider} from './contracts.js';
import {deduplicateWearableDailyRecords,normalizeWearableDailyRecord} from './normalization.js';

const READ_SCOPES=Object.freeze(['steps','activeMinutes','sleepMinutes','restingHeartRate','hrvMs','activeEnergyKcal','workoutMinutes']);
function client(value){const id=String(value||'').trim();if(!id)throw new Error('M26_WEARABLE_CLIENT_REQUIRED');return id;}
function adapterFor(scope,provider){
  const normalized=normalizeWearableProvider(provider);
  const common=scope?.IBERFIT_HEALTH_BRIDGE;
  if(normalized==='apple_health')return common?.appleHealth||null;
  if(normalized==='health_connect')return common?.healthConnect||null;
  return null;
}
function requireMethod(adapter,name){if(typeof adapter?.[name]!=='function')throw new Error('M26_WEARABLE_NATIVE_BRIDGE_UNAVAILABLE');return adapter[name].bind(adapter);}

export function createWearableBridgeService({scope=globalThis}={}){
  const support=detectWearableBridge(scope);
  async function requestAuthorization({provider,clientId,scopes=READ_SCOPES}={}){const id=client(clientId);const adapter=adapterFor(scope,provider);const request=requireMethod(adapter,'requestAuthorization');const allowed=[...new Set((Array.isArray(scopes)?scopes:[]).filter((item)=>READ_SCOPES.includes(item)))];if(!allowed.length)throw new Error('M26_WEARABLE_SCOPE_REQUIRED');const result=await request({clientId:id,scopes:allowed});return Object.freeze({provider:normalizeWearableProvider(provider),clientId:id,granted:Array.isArray(result?.granted)?result.granted.filter((item)=>allowed.includes(item)):[],requested:allowed});}
  async function readDailySummaries({provider,clientId,startDate,endDate}={}){const id=client(clientId);const adapter=adapterFor(scope,provider);const read=requireMethod(adapter,'readDailySummaries');const rows=await read({clientId:id,startDate,endDate,metrics:READ_SCOPES});if(!Array.isArray(rows))throw new Error('M26_WEARABLE_BRIDGE_RESPONSE_INVALID');const normalized=[];for(const row of rows){const result=normalizeWearableDailyRecord(row,{clientId:id,provider});if(result.ok&&result.value.clientId===id)normalized.push(result.value);}return Object.freeze(deduplicateWearableDailyRecords(normalized));}
  async function setSyncEnabled({provider,clientId,enabled}={}){const id=client(clientId);const adapter=adapterFor(scope,provider);const change=requireMethod(adapter,'setSyncEnabled');const result=await change({clientId:id,enabled:Boolean(enabled)});return Object.freeze({provider:normalizeWearableProvider(provider),clientId:id,enabled:Boolean(result?.enabled)});}
  return Object.freeze({support,requestAuthorization,readDailySummaries,setSyncEnabled,readScopes:READ_SCOPES});
}
