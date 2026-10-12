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
  assert.match(android,/page.pageToken!=null/u);
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
