import {providerReadiness,wearableProviderDefinition} from './contracts.js';
import {zeroCostProviderReadiness,wearableZeroCostPolicy} from './free-policy.js';
import {createWearableConnectionState,wearableConnectionHealth} from './connection-state.js';
import {summarizeWearableData} from './normalization.js';

function clone(value){return value==null?value:structuredClone(value);}
function status(value){const key=String(value||'').trim().toLowerCase();return ['active','activo','connected','conectado'].includes(key)?'conectado':['paused','pausado'].includes(key)?'pausado':['revoked','revocado'].includes(key)?'revocado':'pendiente';}

export function buildWearableViewModel({records=[],connections=[],role='client',now=new Date(),scope=globalThis}={}){
  const summary=summarizeWearableData(records,{now,days:7});
  const connectionRows=(Array.isArray(connections)?connections:[]).map((item)=>{const definition=wearableProviderDefinition(item.provider||item.source);const legacyStatus=status(item.status);const state=createWearableConnectionState({provider:definition?.key||item.provider||item.source,state:legacyStatus==='conectado'?'connected':legacyStatus==='pausado'?'paused':legacyStatus==='revocado'?'revoked':'available',grantedScopes:Array.isArray(item.scopes)?item.scopes:[],lastSyncedAt:item.lastSyncedAt||item.last_synced_at||null});return Object.freeze({id:item.id||null,provider:state.provider,label:definition?.label||'Fuente desconocida',status:legacyStatus,state:state.state,lastSyncedAt:state.lastSyncedAt,scopes:clone(state.grantedScopes),health:wearableConnectionHealth(state,{now}),policy:wearableZeroCostPolicy(state.provider)});});
  return Object.freeze({summary,connections:Object.freeze(connectionRows),providers:zeroCostProviderReadiness(providerReadiness(scope)),canControl:String(role||'').toLowerCase()==='client',zeroCostOnly:true});
}
