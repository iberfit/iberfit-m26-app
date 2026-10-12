import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base='../native/android-host/phone-app/src/main/';
const probe=readFileSync(new URL(base+'java/cl/iberfit/m26/phone/Connected360GeneralHeartRateDiagnostic.kt',import.meta.url),'utf8');
const activity=readFileSync(new URL(base+'java/cl/iberfit/m26/phone/Connected360HealthPermissionsActivity.kt',import.meta.url),'utf8');
const manifest=readFileSync(new URL(base+'AndroidManifest.xml',import.meta.url),'utf8');
const canonical=readFileSync(new URL('../native/android-health-connect/healthconnect/src/main/java/cl/iberfit/healthconnect/IberfitHealthConnectReader.kt',import.meta.url),'utf8');
const origin=readFileSync(new URL(base+'java/cl/iberfit/m26/phone/Connected360SecureWebViewActivity.kt',import.meta.url),'utf8');

test('general HR probe requests an independent Health Connect READ permission via explicit user action',()=>{
  assert.match(manifest,/android\.permission\.health\.READ_HEART_RATE/u);
  assert.doesNotMatch(manifest,/android\.permission\.health\.WRITE_HEART_RATE/u);
  assert.match(activity,/Comprobar FC general · diagnóstico opcional/u);
  assert.match(activity,/setOnClickListener \{ authorizeGeneralHeartRateFromUserAction\(\) \}/u);
  assert.match(activity,/PermissionController\.createRequestPermissionResultContract\(\)/u);
  assert.match(activity,/generalHeartRatePermissionLauncher\.launch\(setOf\(permission\)\)/u);
  assert.match(activity,/FLAG_DEBUGGABLE/u);
  assert.match(activity,/FLAG_SECURE/u);
});

test('probe reads only aggregate count, not raw pulse values, never uploads or sets RHR',()=>{
  assert.match(probe,/HeartRateRecord\.HEART_MEASUREMENTS_COUNT/u);
  assert.match(probe,/getGrantedPermissions\(\)\.contains\(permission\)/u);
  assert.match(probe,/TimeRangeFilter\.between\(start, end\)/u);
  assert.match(probe,/LOOKBACK_DAYS = 7/u);
  assert.doesNotMatch(probe,/BPM_AVG|readRecords|RestingHeartRateRecord|restingHeartRate =|postMessage|fetch\(|insertRecords|upload|service_role/u);
  assert.match(probe,/No equivalen a frecuencia cardíaca EN REPOSO/u);
  assert.match(probe,/No se han enviado datos a IBERFIT/u);
});

test('general HR QA scope does not expand the native authenticated bridge or remote import contract',()=>{
  assert.match(canonical,/supportedMetrics = setOf\("steps", "sleepMinutes", "restingHeartRate"\)/u);
  assert.doesNotMatch(canonical,/HeartRateRecord::class/u);
  assert.match(origin,/Connected360OriginGate\.QA_ORIGIN/u);
  assert.match(origin,/health\.readDaily/u);
  assert.doesNotMatch(origin,/Connected360GeneralHeartRateDiagnostic/u);
  assert.match(activity,/Connected360GeneralHeartRateDiagnostic\(client\)\.countMeasurements\(\)/u);
});
