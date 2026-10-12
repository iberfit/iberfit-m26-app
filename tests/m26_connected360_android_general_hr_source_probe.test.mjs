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

test('general HR probe does not read raw pulses or set resting HR and never writes',()=>{
  assert.match(probe,/HeartRateRecord\.MEASUREMENTS_COUNT/u);
  assert.match(probe,/getGrantedPermissions\(\)\.contains\(permission\)/u);
  assert.match(probe,/TimeRangeFilter\.between\(start, end\)/u);
  assert.match(probe,/LOOKBACK_DAYS = 7/u);
  assert.doesNotMatch(probe,/BPM_AVG|readRecords\(|RestingHeartRateRecord\.BPM_|restingHeartRate =|postMessage\(|fetch\(|insertRecords\(|service_role/u);
  assert.match(probe,/No equivalen a frecuencia cardíaca EN REPOSO/u);
  assert.match(probe,/No se han enviado datos a IBERFIT/u);
});

test('general HR remains independent in QA and release, with strict OS category permission',()=>{
  assert.match(canonical,/supportedMetrics = setOf\("steps", "sleepMinutes", "restingHeartRate"\)/u);
  assert.doesNotMatch(canonical,/(?:^|[^A-Za-z])HeartRateRecord::class/u);
  assert.match(origin,/Connected360OriginGate\.origin\(production\)/u);
  assert.match(origin,/health\.readDaily/u);
  // V48 extends the DEBUG-only, one-shot Canary channel, without changing the
  // production reader or granting an unconsented pulse export.
  assert.match(origin,/"health.readV46"/u);
  assert.match(origin,/Connected360GeneralHeartRateDiagnostic\.permission in osPermissions/u);
  assert.match(origin,/Connected360WorkoutReadOnlyQa\.requiredPermission in osPermissions/u);
  assert.match(origin,/includeHeartRate = "generalHeartRate" in allowed/u);
  assert.match(origin,/oneReadApproved/u);
  assert.match(origin,/readFence\.isCurrent\(documentLease\)/u);
  assert.match(origin,/\.put\("automatic", false\)/u);
  assert.match(origin,/\.put\("persisted", false\)/u);
  assert.match(activity,/Connected360GeneralHeartRateDiagnostic\(client\)\.readDailyRanges\(\)/u);
});

test('daily generic HR uses bounded civil-day aggregates, never impersonating resting HR',()=>{
  assert.match(probe,/suspend fun readDailyRanges\(\): List<DailyHeartRateRange>/u);
  assert.match(probe,/for \(offset in \(LOOKBACK_DAYS - 1\) downTo 0\)/u);
  assert.match(probe,/dayWindow\(date, zone\)/u);
  assert.match(probe,/HeartRateRecord\.BPM_MIN/u);
  assert.match(probe,/HeartRateRecord\.BPM_MAX/u);
  assert.match(probe,/HeartRateRecord\.MEASUREMENTS_COUNT/u);
  assert.match(probe,/getGrantedPermissions\(\)\.contains\(permission\)/u);
  assert.match(probe,/NO son frecuencia cardíaca en reposo/u);
  assert.doesNotMatch(probe,/HeartRateRecord\.BPM_AVG/u);
  assert.doesNotMatch(probe,/readRecords\(|postMessage\(|supabase\.|persisted\s*=|uploadToServer\(/u);
  assert.match(activity,/Connected360ReadBudget\.run \{/u);
  assert.match(activity,/Connected360GeneralHeartRateDiagnostic\.dailyText\(daily\)/u);
});
