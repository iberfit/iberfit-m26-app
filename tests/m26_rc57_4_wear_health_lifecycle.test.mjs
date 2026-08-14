import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const wear = () =>
  fs.readFileSync(
    "native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt",
    "utf8"
  );

const service = () =>
  fs.readFileSync(
    "native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/IBERFITWearWorkoutService.kt",
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

test("RC57.4 solicita permiso de frecuencia cardiaca según API", () => {
  const source = wear();

  assert.match(
    source,
    /Build\.VERSION\.SDK_INT >= 36/
  );

  assert.match(
    source,
    /android\.permission\.health\.READ_HEART_RATE/
  );

  assert.match(
    source,
    /Manifest\.permission\.BODY_SENSORS/
  );

  assert.match(
    source,
    /requestPermissions/
  );
});

test("RC57.4 registra ExerciseUpdateCallback antes del ejercicio", () => {
  const source = provider();

  assert.match(
    source,
    /ExerciseUpdateCallback/
  );

  assert.match(
    source,
    /setUpdateCallback\(exerciseCallback\)/
  );

  assert.match(
    source,
    /onRegistered\(\)/
  );

  assert.match(
    source,
    /onRegistrationFailed/
  );
});

test("RC57.4 valida capacidades WORKOUT y HEART_RATE_BPM", () => {
  const source = provider();

  assert.match(
    source,
    /getCapabilitiesAsync\(\)/
  );

  assert.match(
    source,
    /ExerciseType\.WORKOUT/
  );

  assert.match(
    source,
    /supportedDataTypes/
  );

  assert.match(
    source,
    /DataType\.HEART_RATE_BPM/
  );
});

test("RC57.4 implementa start pause resume stop de ExerciseClient", () => {
  const source = provider();

  assert.match(
    source,
    /startExerciseAsync\(config\)/
  );

  assert.match(
    source,
    /pauseExerciseAsync\(\)/
  );

  assert.match(
    source,
    /resumeExerciseAsync\(\)/
  );

  assert.match(
    source,
    /endExerciseAsync\(\)/
  );
});

test("RC57.4 emite frecuencia cardiaca Health Services real por DataLayer", () => {
  assert.match(
    provider(),
    /latestMetrics\.getData\(DataType\.HEART_RATE_BPM\)/
  );

  assert.match(
    provider(),
    /IBERFITHeartRateSample\(/
  );

  assert.match(
    provider(),
    /wear_os_health_services/
  );

  assert.match(
    service(),
    /dataLayer\.sendSample\(/
  );

  assert.doesNotMatch(
    `${provider()}\n${service()}`,
    /synthetic/i
  );
});

test("RC57.4 conserva executionId extremo a extremo", () => {
  assert.match(
    service(),
    /\.put\(\s*"executionId"/
  );

  assert.match(
    phone(),
    /sample\.optString\(\s*"executionId"\s*\)/
  );
});

test("RC57.4 expone los cuatro controles en el teléfono", () => {
  const source = phone();

  assert.match(
    source,
    /sendCommand\(\s*"start"\s*\)/
  );

  assert.match(
    source,
    /sendCommand\(\s*"pause"\s*\)/
  );

  assert.match(
    source,
    /sendCommand\(\s*"resume"\s*\)/
  );

  assert.match(
    source,
    /sendCommand\(\s*"stop"\s*\)/
  );
});

test("RC57.4 expone ListenableFuture de Health Services en compile classpath", () => {
  const build =
    fs.readFileSync(
      "native/android-host/wear-app/build.gradle.kts",
      "utf8"
    );

  assert.match(
    build,
    /com\.google\.guava:guava:32\.0\.1-android/
  );
});