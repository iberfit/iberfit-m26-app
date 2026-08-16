import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WEARABLE_METRICS,defaultVfcMethodForProvider,detectWearableBridge,normalizeWearableDailyRecord,summarizeWearableData,createWearableBridgeService,healthDeviceChannel,healthDeviceDescriptors,wearableZeroCostPolicy} from '../src/m26/wearables/index.js';
const clientId='client-rc51';
test('RC51 presenta VFC en español y conserva clave técnica interna',()=>{assert.equal(WEARABLE_METRICS.hrvMs.label,'VFC · Variabilidad de la frecuencia cardíaca');assert.equal(WEARABLE_METRICS.hrvMs.key,'hrvMs');});
test('RC51 conserva método de VFC por plataforma',()=>{const apple=normalizeWearableDailyRecord({clientId,provider:'apple_health',date:'2026-08-10',hrvMs:42,steps:7000}).value;const android=normalizeWearableDailyRecord({clientId,provider:'health_connect',date:'2026-08-10',hrvMs:38,steps:7200}).value;assert.equal(apple.vfcMethod,'sdnn');assert.equal(android.vfcMethod,'rmssd');const mixed=summarizeWearableData([apple,android],{now:'2026-08-10T18:00:00Z',days:1});assert.equal(mixed.vfc.mixedMethods,true);assert.equal(mixed.vfc.comparable,false);assert.equal(mixed.vfc.valueMs,null);assert.equal(mixed.metrics.hrvMs,40);});
test('RC51 VFC homogénea sí es comparable',()=>{const rows=[9,10].map((day,index)=>({clientId,provider:'apple_health',date:`2026-08-${day}`,hrvMs:40+index*4,steps:7000}));const summary=summarizeWearableData(rows,{now:'2026-08-10T18:00:00Z',days:2});assert.equal(summary.vfc.comparable,true);assert.equal(summary.vfc.method,'sdnn');assert.equal(summary.vfc.valueMs,42);});
test('RC51 define HealthKit, Health Connect, Wear OS y BLE',()=>{assert.equal(healthDeviceChannel('apple_health').channel,'healthkit');assert.equal(healthDeviceChannel('health_connect').sync,'background_read');assert.equal(healthDeviceChannel('wear os').channel,'health_services');assert.equal(healthDeviceChannel('bluetooth').channel,'ble');assert.equal(healthDeviceDescriptors().length,5);assert.equal(defaultVfcMethodForProvider('apple_health'),'sdnn');assert.equal(defaultVfcMethodForProvider('health_connect'),'rmssd');});
test('RC51 detecta puentes nativos sin fingir disponibilidad universal',()=>{const support=detectWearableBridge({IBERFIT_HEALTH_BRIDGE:{appleHealth:{},healthConnect:{},healthServices:{}},IBERFIT_DEVICE_BRIDGE:{ble:{}}});assert.equal(support.appleHealth.available,true);assert.equal(support.healthConnect.available,true);assert.equal(support.healthServices.available,true);assert.equal(support.bleDirect.available,true);});
test('RC51 puente genérico normaliza Apple, Android, Wear OS y BLE',async()=>{const adapter=(method)=>({async requestAuthorization({scopes}){return {granted:scopes};},async readDailySummaries({clientId}){return [{clientId,date:'2026-08-10',steps:8100,hrvMs:44,vfcMethod:method,quality:'alta'}];},async setSyncEnabled({enabled}){return {enabled};}});const service=createWearableBridgeService({scope:{IBERFIT_HEALTH_BRIDGE:{appleHealth:adapter('sdnn'),healthConnect:adapter('rmssd'),healthServices:adapter('unknown')},IBERFIT_DEVICE_BRIDGE:{ble:adapter('rmssd')}}});for(const provider of ['apple_health','health_connect','wear_os_health_services','ble_direct']){assert.equal(service.isAvailable(provider),true);const auth=await service.requestAuthorization({provider,clientId,scopes:['steps','hrvMs','bloodPressure']});assert.deepEqual(auth.requested,['steps','hrvMs']);const rows=await service.readDailySummaries({provider,clientId,startDate:'2026-08-09',endDate:'2026-08-10'});assert.equal(rows.length,1);assert.equal(rows[0].provider,provider);}});
test('RC51 habilita desarrollo nativo sin declarar producción lista',()=>{assert.equal(wearableZeroCostPolicy('apple_health').developmentAllowed,true);assert.equal(wearableZeroCostPolicy('apple_health').productionAllowed,false);assert.equal(wearableZeroCostPolicy('wear_os_health_services').developmentAllowed,true);assert.equal(wearableZeroCostPolicy('ble_direct').developmentAllowed,true);});

test('RC51 conserva contrato funcional histórico de Health Connect sobre el adaptador genérico',()=>{
  const source=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  assert.match(source,/connect-health-connect/u);
  assert.match(source,/bridge\.support\.healthConnect\.available/u);
  assert.match(source,/Autorizar Health Connect/u);
  assert.match(
    source,
    /connectHealthConnect\(\{capabilities=null\}=\{\}\)/u
  );
  assert.match(source,/createHealthConnectHistoricalPlan/u);
  assert.match(source,/metrics:plan\.metrics/u);
  assert.match(
    source,
    /connectNativeProvider\(\s*'health_connect',\s*\{/u
  );
});
