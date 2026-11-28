import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base='../native/android-host/phone-app/';
const android=readFileSync(new URL(base+'src/main/java/cl/iberfit/m26/phone/Connected360WorkoutReadOnlyQa.kt',import.meta.url),'utf8');
const ui=readFileSync(new URL(base+'src/main/java/cl/iberfit/m26/phone/Connected360HealthPermissionsActivity.kt',import.meta.url),'utf8');
const qaManifest=readFileSync(new URL(base+'src/debug/AndroidManifest.xml',import.meta.url),'utf8');
const mainManifest=readFileSync(new URL(base+'src/main/AndroidManifest.xml',import.meta.url),'utf8');
const model=readFileSync(new URL('../src/m26/wearables/session-evidence.js',import.meta.url),'utf8');

test('exercise, general HR, distance and calories remain explicit read-only Android scopes',()=>{
  for(const metric of ['READ_DISTANCE','READ_TOTAL_CALORIES_BURNED']){
    assert.match(qaManifest,new RegExp('android.permission.health.'+metric));
    assert.doesNotMatch(mainManifest,new RegExp('android.permission.health.'+metric));
  }
  assert.doesNotMatch(qaManifest,/WRITE_/u);
  assert.match(android,/HealthPermission.getReadPermission\(ExerciseSessionRecord::class\)/u);
  assert.match(android,/HeartRateRecord.MEASUREMENTS_COUNT/u);
  assert.match(android,/DistanceRecord.DISTANCE_TOTAL/u);
  assert.match(android,/StepsRecord.COUNT_TOTAL/u);
  assert.match(android,/TotalCaloriesBurnedRecord.ENERGY_TOTAL/u);
});

test('workout read is local-only, bounded, original-source scoped and never treats HR as resting',()=>{
  assert.match(android,/const val DAYS = 7/u);
  assert.match(android,/const val MAX_WORKOUTS = 10/u);
  assert.match(android,/!page\.pageToken\.isNullOrEmpty\(\)/u);
  assert.match(android,/dataOriginFilter=setOf\(exercise.metadata.dataOrigin\)/u);
  assert.match(android,/FC general NO es FC en reposo/u);
  assert.doesNotMatch(android,/RestingHeartRateRecord::class|WRITE_|insertRecords\(|readRecords\(\s*ReadRecordsRequest<HeartRateRecord>|supabase\.co|service_role/u);
  assert.match(ui,/Comprobar carrera y HIIT · sesiones deportivas/u);
  assert.match(ui,/FLAG_DEBUGGABLE/u);
  assert.match(ui,/FLAG_SECURE/u);
  assert.match(ui,/workoutPermissionLauncher.launch\(missing\)/u);
  assert.match(ui,/Connected360WorkoutReadOnlyQa\(client\).read\(\)/u);
});

test('session association is candidate-only and never mutates training or bypasses permissions',()=>{
  assert.match(model,/userConfirmationRequired:true/u);
  assert.match(model,/automaticLoadChange:false/u);
  assert.match(model,/inferredRestingHeartRate:false/u);
  assert.match(model,/clientId!==clientId/u);
  assert.match(model,/status:'ambiguous'/u);
  assert.doesNotMatch(model,/service_role|fetch\(|localStorage|indexedDB|document\.cookie|\.update\(|\.insert\(/u);
});

test('bounded native workout read prioritizes recent completed records before taking the batch',()=>{
  const reader=readFileSync(new URL('../native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/Connected360WorkoutReadOnlyQa.kt',import.meta.url),'utf8');
  assert.match(reader,/ascendingOrder=false/u);
  assert.match(reader,/!it\.endTime\.isAfter\(end\)/u);
  assert.match(reader,/Duration\.between\(it\.startTime,it\.endTime\) <= Duration\.ofHours\(24\)/u);
  assert.match(reader,/opaqueRecordKey\(it\.metadata\.id\) != null/u);
});

test('production requests a larger bounded batch without changing the QA default or granting extra scopes',()=>{
  const native=readFileSync(new URL(base+'src/main/java/cl/iberfit/m26/phone/Connected360SecureWebViewActivity.kt',import.meta.url),'utf8');
  assert.match(android,/const val PRODUCTION_MAX_WORKOUTS = 20/u);
  assert.match(android,/maxWorkouts: Int = MAX_WORKOUTS/u);
  assert.match(native,/val maxWorkouts = if \(production\)/u);
  assert.match(native,/!production && request.has\("maxWorkouts"\)/u);
  assert.match(native,/\.read\(includeHeartRate = "generalHeartRate" in allowed, maxWorkouts = maxWorkouts\)/u);
  assert.match(native,/request.optInt\("days", -1\) != 7/u);
});

test('native workout pagination uses fixed intervals and keeps system tokens out of WebView responses',()=>{
  const native=readFileSync(new URL(base+'src/main/java/cl/iberfit/m26/phone/Connected360SecureWebViewActivity.kt',import.meta.url),'utf8');
  assert.match(android,/val end=continuation\?\.end/u);
  assert.match(android,/val start=continuation\?\.start/u);
  assert.match(android,/pageToken=continuation\?\.pageToken/u);
  assert.match(android,/pageSize=if\(historyDays == null\) PAGE_SIZE else maxWorkouts/u);
  assert.match(android,/page.records.size <= maxWorkouts/u);
  assert.match(native,/historyLease.allowed != allowed/u);
  assert.match(native,/WorkoutHistoryLease/u);
  assert.match(native,/UUID.randomUUID\(\).toString\(\)/u);
  assert.match(native,/put\("nextCursor", nextHandle/u);
  assert.doesNotMatch(native,/put\("pageToken"/u);
  assert.match(native,/workoutHistoryLeases.clear\(\)/u);
});

test('swimming is identified locally without changing the legacy production wire vocabulary',()=>{
  assert.match(android,/EXERCISE_TYPE_SWIMMING_POOL,[\s\S]*?EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "Natación"/u);
  assert.match(android,/EXERCISE_TYPE_SWIMMING_POOL,[\s\S]*?EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "swimming"/u);
  assert.match(android,/ritmo total estimado/u);
  assert.match(android,/min\/100 m/u);
  const wire=readFileSync(new URL(base+'src/main/java/cl/iberfit/m26/phone/Connected360V46QaEnvelope.kt',import.meta.url),'utf8');
  const vocabulary=wire.match(/private val sports = setOf\(([^\n]+)\)/u)?.[1];
  assert.ok(vocabulary);
  assert.doesNotMatch(vocabulary,/"swimming"/u);
  assert.match(wire,/val mode = w\.sport\.takeIf \{ it in sports \} \?: "other"/u);
});
