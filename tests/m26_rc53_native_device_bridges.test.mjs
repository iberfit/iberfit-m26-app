import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createNativeTelemetryBridge,
  nativeTelemetryTransportAvailable,
} from '../src/m26/wearables/native-transport.js';
import {createLiveTelemetryController} from '../src/m26/wearables/live-telemetry.js';

function eventScope(extra={}){
  const listeners=new Map();
  return {
    ...extra,
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
    emit(name,detail){for(const fn of listeners.get(name)||[])fn({detail});},
  };
}

test('RC53 transporta comandos por WKWebView y recibe muestras nativas',async()=>{
  const posted=[];
  const scope=eventScope({
    webkit:{messageHandlers:{iberfitLiveTelemetry:{postMessage(value){posted.push(value);}}}},
  });
  assert.equal(nativeTelemetryTransportAvailable(scope),true);
  const bridge=createNativeTelemetryBridge({scope});
  const samples=[];
  const unsubscribe=bridge.subscribe((sample)=>samples.push(sample));
  await bridge.start({executionId:'E1',clientId:'C1',metrics:['heartRateBpm']});
  assert.equal(posted[0].action,'start');
  scope.emit('iberfit:native-live-telemetry',{
    type:'sample',
    sample:{provider:'apple_health',heartRateBpm:132,quality:'alta'},
  });
  assert.equal(samples[0].heartRateBpm,132);
  unsubscribe();
});

test('RC53 transporta comandos por Android JavascriptInterface',async()=>{
  const posted=[];
  const scope=eventScope({
    IBERFIT_ANDROID_LIVE_TELEMETRY:{
      postMessage(value){posted.push(JSON.parse(value));},
    },
  });
  const bridge=createNativeTelemetryBridge({scope});
  await bridge.pause({executionId:'E2'});
  await bridge.resume({executionId:'E2'});
  await bridge.stop({executionId:'E2',reason:'finish'});
  assert.deepEqual(posted.map((x)=>x.action),['pause','resume','stop']);
});

test('RC53 LiveTelemetry usa fallback nativo si no hay bridge global explícito',async()=>{
  const posted=[];
  const scope=eventScope({
    webkit:{messageHandlers:{iberfitLiveTelemetry:{postMessage(value){posted.push(value);}}}},
  });
  const execution={id:'E3',clientId:'C3'};
  const controller=createLiveTelemetryController({scope});
  assert.equal(controller.supported(),true);
  assert.equal(await controller.start(execution),true);
  assert.equal(execution.liveTelemetry.status,'connected');
  assert.equal(execution.liveTelemetry.provider,null);
  assert.equal(execution.liveTelemetry.providerLabel,'Dispositivo nativo');
  scope.emit('iberfit:native-live-telemetry',{
    type:'sample',
    sample:{provider:'apple_health',heartRateBpm:128,quality:'alta'},
  });
  assert.equal(execution.liveTelemetry.heartRateBpm,128);
  assert.equal(execution.liveTelemetry.provider,'apple_health');
  assert.equal(posted[0].action,'start');
});

test('RC53 fuentes nativas contienen APIs y límites esperados',()=>{
  const watch=readFileSync(new URL('../native/apple/IBERFITWatchHealthKitTelemetry.swift',import.meta.url),'utf8');
  assert.match(watch,/HKWorkoutSession/);
  assert.match(watch,/HKLiveWorkoutBuilder/);
  assert.match(watch,/HKLiveWorkoutDataSource/);
  assert.match(watch,/apple_health/);

  const wear=readFileSync(new URL('../native/android/wear/IBERFITWearHealthServicesBridge.kt',import.meta.url),'utf8');
  assert.match(wear,/HealthServices\.getClient/);
  assert.match(wear,/exerciseClient/);
  assert.match(wear,/DataType\.HEART_RATE_BPM/);

  const ble=readFileSync(new URL('../native/android/ble/IBERFITBleHeartRateParser.kt',import.meta.url),'utf8');
  assert.match(ble,/RR intervals are preserved as raw milliseconds/);
  assert.doesNotMatch(ble,/\bHRV\b/);
});

test('RC53 expresa permisos actuales sin afirmar compilación nativa',()=>{
  const manifest=readFileSync(new URL('../native/android/AndroidManifest.xml.fragment',import.meta.url),'utf8');
  assert.match(manifest,/BODY_SENSORS/);
  assert.match(manifest,/maxSdkVersion="35"/);
  assert.match(manifest,/android\.permission\.health\.READ_HEART_RATE/);
  assert.match(manifest,/BLUETOOTH_SCAN/);
  assert.match(manifest,/BLUETOOTH_CONNECT/);

  const info=readFileSync(new URL('../native/apple/Info.plist.fragment',import.meta.url),'utf8');
  assert.match(info,/NSHealthShareUsageDescription/);
  assert.match(info,/NSHealthUpdateUsageDescription/);
  assert.match(info,/NSBluetoothAlwaysUsageDescription/);

  const entitlements=readFileSync(new URL('../native/apple/IBERFITHealthKit.entitlements',import.meta.url),'utf8');
  assert.match(entitlements,/com\.apple\.developer\.healthkit/);
});

test('RC53 adaptadores nativos no contienen ajuste automático de entrenamiento',()=>{
  const files=[
    '../native/apple/IBERFITWatchHealthKitTelemetry.swift',
    '../native/apple/IBERFITWebTelemetryBridge.swift',
    '../native/android/wear/IBERFITWearHealthServicesBridge.kt',
    '../native/android/ble/IBERFITBleHeartRateParser.kt',
  ];
  const source=files.map((path)=>readFileSync(new URL(path,import.meta.url),'utf8')).join('\n');
  assert.doesNotMatch(source,/targetRpe|targetRir|loadInstruction|automaticProgression/);
});

test('RC53 rechaza proveedor nativo explícito no compatible',async()=>{
  const scope=eventScope({
    IBERFIT_LIVE_TELEMETRY_BRIDGE:{
      provider:'health_connect',
      async start(){return {provider:'health_connect'};},
      subscribe(){return ()=>{};},
    },
  });
  const execution={id:'E4',clientId:'C4'};
  const controller=createLiveTelemetryController({scope});
  assert.equal(await controller.start(execution),false);
  assert.equal(execution.liveTelemetry.status,'error');
  assert.match(execution.liveTelemetry.errorCode,/M26_LIVE_TELEMETRY_PROVIDER_UNSUPPORTED/);
});
