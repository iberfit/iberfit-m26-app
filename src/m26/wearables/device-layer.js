import {normalizeWearableProvider,wearableProviderDefinition,defaultVfcMethodForProvider} from './contracts.js';
export const HEALTH_DEVICE_CHANNELS=Object.freeze({
  apple_health:Object.freeze({channel:'healthkit',sync:'background_event',history:true,live:false,label:'Apple HealthKit'}),
  health_connect:Object.freeze({channel:'health_connect',sync:'background_read',history:true,live:false,label:'Health Connect'}),
  samsung_health:Object.freeze({channel:'health_connect',sync:'background_read',history:true,live:false,label:'Samsung Health mediante Health Connect'}),
  wear_os_health_services:Object.freeze({channel:'health_services',sync:'passive_batch',history:false,live:true,label:'Servicios de Salud de Wear OS'}),
  ble_direct:Object.freeze({channel:'ble',sync:'device_stream',history:false,live:true,label:'Bluetooth BLE'}),
});
export function healthDeviceChannel(provider){const key=normalizeWearableProvider(provider);return key?HEALTH_DEVICE_CHANNELS[key]||null:null;}
export function buildHealthDeviceDescriptor(provider){const key=normalizeWearableProvider(provider);if(!key)return null;const definition=wearableProviderDefinition(key),channel=healthDeviceChannel(key);return Object.freeze({provider:key,label:definition?.label||key,channel:channel?.channel||definition?.mode||'external',syncMode:channel?.sync||'external',supportsHistory:channel?.history===true,supportsLive:channel?.live===true,defaultVfcMethod:defaultVfcMethodForProvider(key)});}
export function healthDeviceDescriptors(){return Object.freeze(Object.keys(HEALTH_DEVICE_CHANNELS).map(buildHealthDeviceDescriptor));}
