import {normalizeWearableProvider,WEARABLE_PROVIDERS} from './contracts.js';

export const ZERO_COST_POLICY=Object.freeze({
  normalized_file:Object.freeze({provider:'normalized_file',tier:'free_now',developmentAllowed:true,productionAllowed:true,requiresExternalAccount:false,reason:null,label:'Disponible ahora'}),
  health_connect:Object.freeze({provider:'health_connect',tier:'free_development',developmentAllowed:true,productionAllowed:false,requiresExternalAccount:false,reason:'M26_NATIVE_ANDROID_BRIDGE_REQUIRED',label:'Preparación gratuita'}),
  apple_health:Object.freeze({provider:'apple_health',tier:'paid_distribution',developmentAllowed:false,productionAllowed:false,requiresExternalAccount:true,reason:'M26_ZERO_COST_POLICY_BLOCKED',label:'En pausa por coste'}),
  garmin_connect:Object.freeze({provider:'garmin_connect',tier:'partner_access',developmentAllowed:false,productionAllowed:false,requiresExternalAccount:true,reason:'M26_PARTNER_OR_COMMERCIAL_ACCESS_REQUIRED',label:'No activar'}),
  fitbit:Object.freeze({provider:'fitbit',tier:'restricted_review',developmentAllowed:true,productionAllowed:false,requiresExternalAccount:true,reason:'M26_RESTRICTED_OAUTH_REVIEW_REQUIRED',label:'Evaluación gratuita'}),
  oura:Object.freeze({provider:'oura',tier:'external_oauth',developmentAllowed:false,productionAllowed:false,requiresExternalAccount:true,reason:'M26_FREE_ACCESS_NOT_CONFIRMED',label:'En espera'}),
});

export function wearableZeroCostPolicy(provider){
  const key=normalizeWearableProvider(provider);
  return key?ZERO_COST_POLICY[key]||null:null;
}

export function zeroCostProviderReadiness(items=[]){
  return Object.freeze((Array.isArray(items)?items:[]).map((item)=>{
    const policy=wearableZeroCostPolicy(item.key);
    const usableNow=Boolean(item.available&&policy?.developmentAllowed);
    return Object.freeze({...item,policy,usableNow,activationBlocked:!policy?.developmentAllowed||!item.available});
  }));
}

export function assertZeroCostDevelopmentAllowed(provider){
  const definition=WEARABLE_PROVIDERS[normalizeWearableProvider(provider)];
  if(!definition)throw new Error('M26_WEARABLE_PROVIDER_UNKNOWN');
  const policy=wearableZeroCostPolicy(definition.key);
  if(!policy?.developmentAllowed)throw new Error(policy?.reason||'M26_ZERO_COST_POLICY_BLOCKED');
  return Object.freeze({definition,policy});
}
