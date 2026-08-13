import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const wear = () =>
  fs.readFileSync(
    "native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt",
    "utf8"
  );

const provider = () =>
  fs.readFileSync(
    "native/android/wear/IBERFITWearHealthServicesBridge.kt",
    "utf8"
  );

const phone = () =>
  fs.readFileSync(
    "native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/PhoneMainActivity.kt",
    "utf8"
  );

test("RC57.4 solicita permiso de frecuencia cardiaca segÃºn API", () => {
  const source = wear();
  assert.match(source, /Build\.VERSION\.SDK_INT >= 36/);
  assert.match(source, /android\.permission\.health\.READ_HEART_RATE/);
  assert.match(source, /Manifest\.permission\.BODY_SENSORS/);
  assert.match(source, /requestPermissions/);
});

test("RC57.4 registra ExerciseUpdateCallback antes del ejercicio", () => {
  const source = provider();
  assert.match(source, /ExerciseUpdateCallback/);
  assert.match(source, /setUpdateCallback\(exerciseCallback\)/);
  assert.match(source, /onRegistered\(\)/);
  assert.match(source, /onRegistrationFailed/);
});

test("RC57.4 valida capacidades WORKOUT y HEART_RATE_BPM", () => {
  const source = provider();
  assert.match(source, /getCapabilitiesAsync\(\)/);
  assert.match(source, /ExerciseType\.WORKOUT/);
  assert.match(source, /supportedDataTypes/);
  assert.match(source, /DataType\.HEART_RATE_BPM/);
});

test("RC57.4 implementa start pause resume stop de ExerciseClient", () => {
  const source = provider();
  assert.match(source, /startExerciseAsync\(config\)/);
  assert.match(source, /pauseExerciseAsync\(\)/);
  assert.match(source, /resumeExerciseAsync\(\)/);
  assert.match(source, /endExerciseAsync\(\)/);
});

test("RC57.4 emite frecuencia cardiaca Health Services real por DataLayer", () => {
  assert.match(
    provider(),
    /latestMetrics\.getData\(DataType\.HEART_RATE_BPM\)/
  );
  assert.match(provider(), /IBERFITHeartRateSample\(/);
  assert.match(provider(), /wear_os_health_services/);
  assert.match(
    wear(),
    /dataLayer\.sendSample\(sample\.toDataLayerJson\(\)\)/
  );
  assert.doesNotMatch(`${provider()}\n${wear()}`, /synthetic/i);
});

test("RC57.4 conserva executionId extremo a extremo", () => {
  assert.match(wear(), /\.put\("executionId", it\)/);
  assert.match(phone(), /sample\.optString\("executionId"\)/);
});

test("RC57.4 expone los cuatro controles en el telÃ©fono", () => {
  const source = phone();
  assert.match(source, /sendCommand\("start"\)/);
  assert.match(source, /sendCommand\("pause"\)/);
  assert.match(source, /sendCommand\("resume"\)/);
  assert.match(source, /sendCommand\("stop"\)/);
});

test("RC57.4 expone ListenableFuture de Health Services en compile classpath", () => {
  const build = fs.readFileSync(
    "native/android-host/wear-app/build.gradle.kts",
    "utf8"
  );
  assert.match(build, /com\.google\.guava:guava:32\.0\.1-android/);
});