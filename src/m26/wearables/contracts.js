export const WEARABLE_PROVIDERS=Object.freeze({
  apple_health:Object.freeze({key:'apple_health',label:'Apple Health',mode:'native_bridge',platform:'ios',readiness:'requires_native_app'}),
  health_connect:Object.freeze({key:'health_connect',label:'Health Connect',mode:'native_bridge',platform:'android',readiness:'requires_native_app'}),
  garmin_connect:Object.freeze({key:'garmin_connect',label:'Garmin Connect',mode:'server_oauth',platform:'cloud',readiness:'requires_partner_access'}),
  fitbit:Object.freeze({key:'fitbit',label:'Google Health API · Fitbit y Pixel Watch',mode:'server_oauth',platform:'cloud',readiness:'requires_restricted_oauth_review'}),
  oura:Object.freeze({key:'oura',label:'Oura',mode:'server_oauth',platform:'cloud',readiness:'requires_server_oauth'}),
  normalized_file:Object.freeze({key:'normalized_file',label:'Archivo normalizado IBERFIT',mode:'local_file',platform:'browser',readiness:'local_preview'}),
});

export const WEARABLE_METRICS=Object.freeze({
  steps:Object.freeze({key:'steps',label:'Pasos',unit:'pasos',min:0,max:200000,integer:true}),
  activeMinutes:Object.freeze({key:'activeMinutes',label:'Minutos activos',unit:'min',min:0,max:1440,integer:true}),
  sleepMinutes:Object.freeze({key:'sleepMinutes',label:'Sueño',unit:'min',min:0,max:1440,integer:true}),
  restingHeartRate:Object.freeze({key:'restingHeartRate',label:'FC en reposo',unit:'lpm',min:25,max:240,integer:false}),
  hrvMs:Object.freeze({key:'hrvMs',label:'Variabilidad cardiaca',unit:'ms',min:0,max:1000,integer:false}),
  activeEnergyKcal:Object.freeze({key:'activeEnergyKcal',label:'Energía activa',unit:'kcal',min:0,max:20000,integer:false}),
  workoutMinutes:Object.freeze({key:'workoutMinutes',label:'Entrenamiento registrado',unit:'min',min:0,max:1440,integer:true}),
});

const PROVIDER_ALIASES=Object.freeze({
  apple:'apple_health',applehealth:'apple_health',healthkit:'apple_health',
  healthconnect:'health_connect',google_health_connect:'health_connect',googlefit:'health_connect',
  garmin:'garmin_connect',garminconnect:'garmin_connect',
  googlehealth:'fitbit',google_health:'fitbit',google_health_api:'fitbit',pixelwatch:'fitbit',
  file:'normalized_file',manual:'normalized_file',csv:'normalized_file',json:'normalized_file',
});

export function normalizeWearableProvider(value){
  const key=String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  if(WEARABLE_PROVIDERS[key])return key;
  return PROVIDER_ALIASES[key.replaceAll('_','')]||PROVIDER_ALIASES[key]||null;
}

export function wearableProviderDefinition(value){const key=normalizeWearableProvider(value);return key?WEARABLE_PROVIDERS[key]:null;}

export function detectWearableBridge(scope=globalThis){
  const apple=Boolean(scope?.webkit?.messageHandlers?.iberfitHealth?.postMessage||scope?.IBERFIT_HEALTH_BRIDGE?.appleHealth);
  const android=Boolean(scope?.AndroidHealthBridge?.requestAuthorization||scope?.IBERFIT_HEALTH_BRIDGE?.healthConnect);
  return Object.freeze({
    appleHealth:Object.freeze({available:apple,reason:apple?null:'M26_NATIVE_BRIDGE_REQUIRED'}),
    healthConnect:Object.freeze({available:android,reason:android?null:'M26_NATIVE_BRIDGE_REQUIRED'}),
    normalizedFile:Object.freeze({available:true,reason:null}),
  });
}

export function providerReadiness(scope=globalThis){
  const bridge=detectWearableBridge(scope);
  return Object.freeze([
    Object.freeze({...WEARABLE_PROVIDERS.apple_health,available:bridge.appleHealth.available}),
    Object.freeze({...WEARABLE_PROVIDERS.health_connect,available:bridge.healthConnect.available}),
    Object.freeze({...WEARABLE_PROVIDERS.garmin_connect,available:false}),
    Object.freeze({...WEARABLE_PROVIDERS.fitbit,available:false}),
    Object.freeze({...WEARABLE_PROVIDERS.oura,available:false}),
    Object.freeze({...WEARABLE_PROVIDERS.normalized_file,available:true}),
  ]);
}
