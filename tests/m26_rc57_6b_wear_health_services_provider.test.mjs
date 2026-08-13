import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const bridge = () =>
  read("native/android/wear/IBERFITWearHealthServicesBridge.kt");

const host = () =>
  read(
    "native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/IBERFITWearWorkoutService.kt"
  );

const activity = () =>
  read(
    "native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt"
  );

const runtime = () =>
  read("native/android/runtime/IBERFITWearDataLayerRuntime.kt");

test("RC57.6B Health Services implementa el provider comÃºn", () => {
  const source = bridge();

  assert.match(
    source,
    /: IBERFITHeartRateProvider/
  );

  assert.match(
    source,
    /override val descriptor = IBERFITHeartRateProviderDescriptor/
  );

  assert.match(
    source,
    /const val PROVIDER_ID = "wear_os_health_services"/
  );
});

test("RC57.6B el provider encapsula todo ExerciseClient", () => {
  const source = bridge();

  assert.match(
    source,
    /ExerciseUpdateCallback/
  );

  assert.match(
    source,
    /getCapabilitiesAsync\(\)/
  );

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

  assert.match(
    source,
    /clearUpdateCallbackAsync\(exerciseCallback\)/
  );
});

test("RC57.6B convierte Health Services a muestra canÃ³nica", () => {
  const source = bridge();

  assert.match(
    source,
    /IBERFITHeartRateSample\(/
  );

  assert.match(
    source,
    /val bpm = point\.value/
  );

  assert.match(
    source,
    /providerId = descriptor\.providerId/
  );

  assert.match(
    source,
    /deviceType = IBERFITHeartRateDeviceType\.WATCH/
  );

  assert.match(
    source,
    /quality = quality/
  );

  assert.match(
    source,
    /executionId = context\.executionId/
  );

  assert.match(
    source,
    /sessionId = context\.sessionId/
  );
});

test("RC57.6B no elimina un outlier: lo marca OUT_OF_RANGE", () => {
  const source = bridge();

  assert.match(
    source,
    /IBERFITHeartRateQuality\.OUT_OF_RANGE/
  );

  assert.doesNotMatch(
    source,
    /takeIf \{ it in 25\.0\.\.240\.0 \}/
  );
});

test("RC57.6B el ForegroundService orquesta SessionManager", () => {
  const source = host();

  assert.match(
    source,
    /IBERFITHeartRateSessionManager/
  );

  assert.match(
    source,
    /listOf\(healthProvider\)/
  );

  assert.match(
    source,
    /sessionManager\.start\(/
  );

  assert.match(
    source,
    /sessionManager\.pause\(\)/
  );

  assert.match(
    source,
    /sessionManager\.resume\(\)/
  );

  assert.match(
    source,
    /sessionManager\.stop\(\)/
  );
});

test("RC57.6B el host no controla ExerciseClient directamente", () => {
  const source = host();

  assert.doesNotMatch(
    source,
    /ExerciseUpdateCallback/
  );

  assert.doesNotMatch(
    source,
    /startExerciseAsync\(/
  );

  assert.doesNotMatch(
    source,
    /pauseExerciseAsync\(/
  );

  assert.doesNotMatch(
    source,
    /resumeExerciseAsync\(/
  );

  assert.doesNotMatch(
    source,
    /endExerciseAsync\(/
  );
});

test("RC57.6B DataLayer acepta cualquier provider vÃ¡lido", () => {
  const source = runtime();

  assert.match(
    source,
    /provider\.isNotBlank\(\)/
  );

  assert.doesNotMatch(
    source,
    /provider == "wear_os_health_services"/
  );

  assert.doesNotMatch(
    source,
    /bpm in 25\.0\.\.240\.0/
  );
});

test("RC57.6B serializa identidad, calidad y correlaciÃ³n", () => {
  const source = host();

  assert.match(
    source,
    /\.put\("provider", providerId\)/
  );

  assert.match(
    source,
    /\.put\("heartRateBpm", bpm\)/
  );

  assert.match(
    source,
    /quality\.name\.lowercase\(\)/
  );

  assert.match(
    source,
    /deviceType\.name\.lowercase\(\)/
  );

  assert.match(
    source,
    /contactStatus\.name\.lowercase\(\)/
  );

  assert.match(
    source,
    /"executionId"/
  );

  assert.match(
    source,
    /"sessionId"/
  );
});

test("RC57.6B Activity deja de poseer la sesiÃ³n de sensor", () => {
  const source = activity();

  assert.doesNotMatch(
    source,
    /IBERFITHeartRateSessionManager/
  );

  assert.doesNotMatch(
    source,
    /IBERFITWearHealthServicesBridge/
  );
});

test("RC57.6B no contiene supuestos de marca o hardware QA", () => {
  const source =
    `${bridge()}\n${host()}\n${activity()}\n${runtime()}`;

  assert.doesNotMatch(
    source,
    /Samsung|Galaxy|SM-R860|SM_J600G|SM-J600G|RFATA0LSLFR|5200bf3d8d5b45a3/i
  );
});