import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

test('RC55 verificación estática pasa',()=>{
  const out=execFileSync(process.execPath,['scripts/verify_rc55_device_app_runtime.mjs'],{encoding:'utf8'});
  assert.match(out,/RC55_DEVICE_TO_APP_RUNTIME_STATIC=PASS/);
});

test('RC55 usa transporte vivo no persistente en Apple y Wear OS',()=>{
  const watch=readFileSync(new URL('../native/apple/IBERFITWatchRuntimeRelay.swift',import.meta.url),'utf8');
  const wear=readFileSync(new URL('../native/android/runtime/IBERFITWearDataLayerRuntime.kt',import.meta.url),'utf8');
  assert.match(watch,/sendMessage/);
  assert.doesNotMatch(watch,/transferUserInfo/);
  assert.match(wear,/MessageClient/);
  assert.doesNotMatch(wear,/DataClient|PutDataRequest/);
});

test('RC55 restringe la frontera WebView por origen',()=>{
  const ios=readFileSync(new URL('../native/apple/IBERFITWebTelemetryBridge.swift',import.meta.url),'utf8');
  const android=readFileSync(new URL('../native/android/runtime/IBERFITAndroidWebRuntime.kt',import.meta.url),'utf8');
  assert.match(ios,/allowedHosts/);
  assert.match(ios,/securityOrigin\.host/);
  assert.match(android,/addWebMessageListener/);
  assert.match(android,/allowedOrigins/);
  assert.match(android,/require\(allowedOrigins\.none/);
});

test('RC55 mantiene RR crudos sin derivar VFC ni ajustar entrenamiento',()=>{
  const source=[
    '../native/apple/IBERFITIOSBleHeartRateRuntime.swift',
    '../native/android/runtime/IBERFITBleHeartRateRuntime.kt',
    '../native/android/runtime/IBERFITAndroidNativeTelemetryRuntime.kt',
  ].map(p=>readFileSync(new URL(p,import.meta.url),'utf8')).join('\n');
  assert.match(source,/rrIntervalsMs/);
  assert.doesNotMatch(source,/\bHRV\b|hrvMs|vfcMs|targetRpe|targetRir|automaticProgression/);
});

test('RC55 Android BLE conecta GATT usando contexto de aplicación válido',()=>{
  const source=readFileSync(new URL('../native/android/runtime/IBERFITBleHeartRateRuntime.kt',import.meta.url),'utf8');
  assert.match(source,/private val appContext = context\.applicationContext/);
  assert.match(source,/connectGatt\(appContext, false, gattCallback\)/);
  assert.doesNotMatch(source,/manager\.context/);
});
