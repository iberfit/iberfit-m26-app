export const WEARABLE_PROVIDERS = Object.freeze({
  apple_health:Object.freeze({key:'apple_health',label:'Apple Watch · Salud (HealthKit)',mode:'native_bridge',platform:'ios',readiness:'requires_native_app',channel:'healthkit'}),
  health_connect:Object.freeze({key:'health_connect',label:'Android · Health Connect',mode:'native_bridge',platform:'android',readiness:'requires_native_app',channel:'health_connect'}),
  samsung_health:Object.freeze({key:'samsung_health',label:'Samsung Health mediante Health Connect',mode:'native_bridge',platform:'android',readiness:'via_health_connect',canonicalBridge:'health_connect',channel:'health_connect'}),
  wear_os_health_services:Object.freeze({key:'wear_os_health_services',label:'Reloj Wear OS · Servicios de Salud',mode:'watch_native',platform:'wear_os',readiness:'requires_watch_app',channel:'health_services'}),
  ble_direct:Object.freeze({key:'ble_direct',label:'Sensor Bluetooth compatible',mode:'direct_ble',platform:'mobile',readiness:'requires_native_app',channel:'ble'}),
  strava:Object.freeze({key:'strava',label:'Strava',mode:'server_oauth',platform:'cloud',readiness:'requires_server_oauth_registration'}),
  garmin_connect:Object.freeze({key:'garmin_connect',label:'Garmin Connect',mode:'server_oauth',platform:'cloud',readiness:'requires_partner_access'}),
  fitbit:Object.freeze({key:'fitbit',label:'Google Health API · Fitbit y Pixel Watch',mode:'server_oauth',platform:'cloud',readiness:'requires_restricted_oauth_review'}),
  oura:Object.freeze({key:'oura',label:'Oura',mode:'server_oauth',platform:'cloud',readiness:'requires_server_oauth'}),
  normalized_file:Object.freeze({key:'normalized_file',label:'Archivo normalizado IBERFIT',mode:'local_file',platform:'browser',readiness:'local_preview'}),
});

export const VFC_METHODS=Object.freeze({
  sdnn:Object.freeze({key:'sdnn',label:'SDNN'}),
  rmssd:Object.freeze({key:'rmssd',label:'RMSSD'}),
  unknown:Object.freeze({key:'unknown',label:'Método no informado'}),
});

export const WEARABLE_METRICS=Object.freeze({
  steps:Object.freeze({key:'steps',label:'Pasos',unit:'pasos',min:0,max:200000,integer:true}),
  activeMinutes:Object.freeze({key:'activeMinutes',label:'Minutos activos',unit:'min',min:0,max:1440,integer:true}),
  sleepMinutes:Object.freeze({key:'sleepMinutes',label:'Sueño',unit:'min',min:0,max:1440,integer:true}),
  restingHeartRate:Object.freeze({key:'restingHeartRate',label:'FC en reposo',unit:'lpm',min:25,max:240,integer:false}),
  hrvMs:Object.freeze({key:'hrvMs',label:'VFC · Variabilidad de la frecuencia cardíaca',unit:'ms',min:0,max:1000,integer:false}),
  activeEnergyKcal:Object.freeze({key:'activeEnergyKcal',label:'Energía activa',unit:'kcal',min:0,max:20000,integer:false}),
  workoutMinutes:Object.freeze({key:'workoutMinutes',label:'Entrenamiento registrado',unit:'min',min:0,max:1440,integer:true}),
});

const PROVIDER_ALIASES=Object.freeze({
  apple:'apple_health',applehealth:'apple_health',healthkit:'apple_health',applewatch:'apple_health',
  healthconnect:'health_connect',google_health_connect:'health_connect',googlefit:'health_connect',
  samsung:'samsung_health',samsunghealth:'samsung_health',galaxywatch:'samsung_health',galaxyring:'samsung_health',
  wearos:'wear_os_health_services',wear_os:'wear_os_health_services',healthservices:'wear_os_health_services',health_services:'wear_os_health_services',
  bluetooth:'ble_direct',bluetoothle:'ble_direct',bluetooth_le:'ble_direct',ble:'ble_direct',
  strava:'strava',garmin:'garmin_connect',garminconnect:'garmin_connect',
  googlehealth:'fitbit',google_health:'fitbit',google_health_api:'fitbit',pixelwatch:'fitbit',
  file:'normalized_file',manual:'normalized_file',csv:'normalized_file',json:'normalized_file',
});
export function normalizeWearableProvider(value){const key=String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_');if(WEARABLE_PROVIDERS[key])return key;return PROVIDER_ALIASES[key.replaceAll('_','')]||PROVIDER_ALIASES[key]||null;}
export function wearableProviderDefinition(value){const key=normalizeWearableProvider(value);return key?WEARABLE_PROVIDERS[key]:null;}
export function normalizeVfcMethod(value){const key=String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_');if(['sdnn','standard_deviation_nn','standard_deviation_of_nn'].includes(key))return 'sdnn';if(['rmssd','root_mean_square_successive_differences','root_mean_square_of_successive_differences'].includes(key))return 'rmssd';return 'unknown';}
export function defaultVfcMethodForProvider(provider){const key=normalizeWearableProvider(provider);if(key==='apple_health')return 'sdnn';if(['health_connect','samsung_health'].includes(key))return 'rmssd';return 'unknown';}
export function detectWearableBridge(scope=globalThis){const common=scope?.IBERFIT_HEALTH_BRIDGE;const device=scope?.IBERFIT_DEVICE_BRIDGE;const apple=Boolean(common?.appleHealth);const android=Boolean(common?.healthConnect||scope?.AndroidHealthBridge?.requestAuthorization);const healthServices=Boolean(common?.healthServices);const ble=Boolean(common?.ble||device?.ble);return Object.freeze({
  appleHealth:Object.freeze({available:apple,reason:apple?null:'M26_NATIVE_BRIDGE_REQUIRED'}),
  healthConnect:Object.freeze({available:android,reason:android?null:'M26_NATIVE_BRIDGE_REQUIRED'}),
  healthServices:Object.freeze({available:healthServices,reason:healthServices?null:'M26_WEAR_OS_BRIDGE_REQUIRED'}),
  bleDirect:Object.freeze({available:ble,reason:ble?null:'M26_BLUETOOTH_BRIDGE_REQUIRED'}),
  normalizedFile:Object.freeze({available:true,reason:null}),
});}
export function providerReadiness(scope=globalThis){const bridge=detectWearableBridge(scope);return Object.freeze([
  Object.freeze({...WEARABLE_PROVIDERS.health_connect,available:bridge.healthConnect.available}),
  Object.freeze({...WEARABLE_PROVIDERS.samsung_health,available:bridge.healthConnect.available}),
  Object.freeze({...WEARABLE_PROVIDERS.apple_health,available:bridge.appleHealth.available}),
  Object.freeze({...WEARABLE_PROVIDERS.wear_os_health_services,available:bridge.healthServices.available}),
  Object.freeze({...WEARABLE_PROVIDERS.ble_direct,available:bridge.bleDirect.available}),
  Object.freeze({...WEARABLE_PROVIDERS.strava,available:false}),
  Object.freeze({...WEARABLE_PROVIDERS.garmin_connect,available:false}),
  Object.freeze({...WEARABLE_PROVIDERS.fitbit,available:false}),
  Object.freeze({...WEARABLE_PROVIDERS.oura,available:false}),
  Object.freeze({...WEARABLE_PROVIDERS.normalized_file,available:true}),
]);}
