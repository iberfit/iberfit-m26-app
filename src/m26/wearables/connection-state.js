import {normalizeWearableProvider} from './contracts.js';
import {wearableZeroCostPolicy} from './free-policy.js';

export const WEARABLE_CONNECTION_STATES=Object.freeze(['unavailable','available','authorizing','connected','syncing','paused','revoked','error']);
const TRANSITIONS=Object.freeze({
  unavailable:Object.freeze(['available']),
  available:Object.freeze(['authorizing','revoked','error']),
  authorizing:Object.freeze(['connected','available','revoked','error']),
  connected:Object.freeze(['syncing','paused','revoked','error']),
  syncing:Object.freeze(['connected','paused','revoked','error']),
  paused:Object.freeze(['connected','revoked','error']),
  revoked:Object.freeze(['available']),
  error:Object.freeze(['available','authorizing','connected','paused','revoked']),
});
const SAFE_ERROR_CODES=new Set(['M26_NATIVE_BRIDGE_REQUIRED','M26_PERMISSION_DENIED','M26_PERMISSION_CANCELLED','M26_SYNC_TIMEOUT','M26_NETWORK_UNAVAILABLE','M26_DATA_INVALID','M26_ZERO_COST_POLICY_BLOCKED','M26_RESTRICTED_OAUTH_REVIEW_REQUIRED','M26_PARTNER_OR_COMMERCIAL_ACCESS_REQUIRED','M26_FREE_ACCESS_NOT_CONFIRMED']);

function safeState(value){const state=String(value||'').trim().toLowerCase();return WEARABLE_CONNECTION_STATES.includes(state)?state:'unavailable';}
function safeIso(value){const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date.toISOString():null;}
function safeCode(value){const code=String(value||'').trim().toUpperCase();return SAFE_ERROR_CODES.has(code)?code:'M26_DATA_INVALID';}

export function createWearableConnectionState({provider,state,grantedScopes=[],lastSyncedAt=null,errorCode=null,revision=0}={}){
  const normalized=normalizeWearableProvider(provider);if(!normalized)throw new Error('M26_WEARABLE_PROVIDER_UNKNOWN');
  const policy=wearableZeroCostPolicy(normalized);let next=safeState(state);
  if(!policy?.developmentAllowed&&next!=='unavailable'&&next!=='error')next='unavailable';
  return Object.freeze({provider:normalized,state:next,grantedScopes:Object.freeze([...new Set((Array.isArray(grantedScopes)?grantedScopes:[]).map(String).filter(Boolean))]),lastSyncedAt:safeIso(lastSyncedAt),errorCode:errorCode?safeCode(errorCode):null,revision:Math.max(0,Math.trunc(Number(revision)||0))});
}

export function transitionWearableConnection(current,nextState,{grantedScopes,lastSyncedAt,errorCode}={}){
  const source=createWearableConnectionState(current);const target=safeState(nextState);
  if(source.state===target)return source;
  if(!TRANSITIONS[source.state]?.includes(target))throw new Error('M26_WEARABLE_TRANSITION_INVALID');
  const policy=wearableZeroCostPolicy(source.provider);
  if(!policy?.developmentAllowed&&target!=='unavailable'&&target!=='error')throw new Error(policy?.reason||'M26_ZERO_COST_POLICY_BLOCKED');
  if(['connected','syncing'].includes(target)&&!(grantedScopes||source.grantedScopes).length)throw new Error('M26_WEARABLE_SCOPE_REQUIRED');
  return createWearableConnectionState({provider:source.provider,state:target,grantedScopes:grantedScopes||source.grantedScopes,lastSyncedAt:lastSyncedAt??source.lastSyncedAt,errorCode:target==='error'?safeCode(errorCode):null,revision:source.revision+1});
}

export function wearableConnectionHealth(connection,{now=new Date()}={}){
  const value=createWearableConnectionState(connection);const end=now instanceof Date?now:new Date(now);if(Number.isNaN(end.getTime()))throw new Error('M26_WEARABLE_NOW_INVALID');
  const ageHours=value.lastSyncedAt?Math.max(0,(end.getTime()-new Date(value.lastSyncedAt).getTime())/3_600_000):null;
  return Object.freeze({state:value.state,ageHours:ageHours===null?null:Math.round(ageHours*10)/10,freshness:ageHours===null?'sin_datos':ageHours<=48?'reciente':ageHours<=168?'atrasada':'obsoleta',actionRequired:['error','revoked','unavailable'].includes(value.state)});
}

export function wearableErrorMessage(code){
  const messages={M26_NATIVE_BRIDGE_REQUIRED:'Esta función necesita la futura aplicación móvil IBERFIT.',M26_PERMISSION_DENIED:'El permiso fue rechazado. Puedes revisarlo desde los ajustes del dispositivo.',M26_PERMISSION_CANCELLED:'La autorización se canceló sin realizar cambios.',M26_SYNC_TIMEOUT:'La sincronización tardó demasiado. Intenta nuevamente más tarde.',M26_NETWORK_UNAVAILABLE:'No hay conexión. Los datos confirmados no se alteraron.',M26_ZERO_COST_POLICY_BLOCKED:'Esta integración permanece desactivada por la política de coste cero.',M26_RESTRICTED_OAUTH_REVIEW_REQUIRED:'La integración requiere una revisión externa antes de activarse.',M26_PARTNER_OR_COMMERCIAL_ACCESS_REQUIRED:'La integración requiere acceso de socio o licencia y permanece desactivada.',M26_FREE_ACCESS_NOT_CONFIRMED:'No se ha confirmado una vía gratuita, por lo que la integración permanece en espera.',M26_DATA_INVALID:'Los datos recibidos no tienen un formato válido.'};
  return messages[safeCode(code)];
}
