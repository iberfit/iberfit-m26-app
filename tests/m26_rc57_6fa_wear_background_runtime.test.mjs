import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const manifest = () =>
  read("native/android-host/wear-app/src/main/AndroidManifest.xml");

const activity = () =>
  read(
    "native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt"
  );

const service = () =>
  read(
    "native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/IBERFITWearWorkoutService.kt"
  );

const command = () =>
  read(
    "native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/IBERFITWearCommandListenerService.kt"
  );

const provider = () =>
  read(
    "native/android/wear/IBERFITWearHealthServicesBridge.kt"
  );

test("RC57.6F-A declara un foreground service de salud", () => {
  const source = manifest();

  assert.match(
    source,
    /android\.permission\.FOREGROUND_SERVICE/
  );

  assert.match(
    source,
    /android\.permission\.FOREGROUND_SERVICE_HEALTH/
  );

  assert.match(
    source,
    /android:foregroundServiceType="health"/
  );

  assert.match(
    source,
    /IBERFITWearWorkoutService/
  );
});

test("RC57.6F-A declara y solicita permiso de notificaciones", () => {
  const appManifest = manifest();
  const source = activity();

  assert.match(
    appManifest,
    /android\.permission\.POST_NOTIFICATIONS/
  );

  assert.match(
    source,
    /Manifest\.permission\.POST_NOTIFICATIONS/
  );

  assert.match(
    source,
    /REQUEST_NOTIFICATIONS_PERMISSION/
  );
});

test("RC57.6F-A declara permisos de sensor en segundo plano", () => {
  const source = manifest();

  assert.match(
    source,
    /android\.permission\.BODY_SENSORS_BACKGROUND/
  );

  assert.match(
    source,
    /android\.permission\.health\.READ_HEALTH_DATA_IN_BACKGROUND/
  );
});

test("RC57.6F-A solicita permisos según la versión de Wear OS", () => {
  const source = activity();

  assert.match(
    source,
    /Build\.VERSION\.SDK_INT >= 36/
  );

  assert.match(
    source,
    /READ_HEALTH_DATA_IN_BACKGROUND_PERMISSION/
  );

  assert.match(
    source,
    /Manifest\.permission\.BODY_SENSORS_BACKGROUND/
  );

  assert.match(
    source,
    /REQUEST_BACKGROUND_HEALTH_PERMISSION/
  );
});

test("RC57.6F-A el servicio posee provider, manager y transporte", () => {
  const source = service();

  assert.match(
    source,
    /IBERFITWearHealthServicesBridge/
  );

  assert.match(
    source,
    /IBERFITHeartRateSessionManager/
  );

  assert.match(
    source,
    /IBERFITWearDataLayerRuntime/
  );

  assert.match(
    source,
    /dataLayer\.sendSample\(/
  );
});

test("RC57.6F-A promueve el workout a FGS health", () => {
  const source = service();

  assert.match(
    source,
    /startForeground\(/
  );

  assert.match(
    source,
    /ServiceInfo\.FOREGROUND_SERVICE_TYPE_HEALTH/
  );

  assert.match(
    source,
    /NotificationChannel/
  );

  assert.match(
    source,
    /\.setOngoing\(true\)/
  );
});

test("RC57.6F-A recibe comandos DataLayer en background", () => {
  const source = command();
  const appManifest = manifest();

  assert.match(
    source,
    /WearableListenerService/
  );

  assert.match(
    source,
    /IBERFITWearDataLayerRuntime\.COMMAND_PATH/
  );

  assert.match(
    source,
    /IBERFITWearWorkoutService/
  );

  assert.match(
    appManifest,
    /com\.google\.android\.gms\.wearable\.MESSAGE_RECEIVED/
  );

  assert.match(
    appManifest,
    /android:pathPrefix="\/iberfit\/live-command"/
  );
});

test("RC57.6F-A comandos de sesión activa no reinician el FGS", () => {
  const source = service();

  assert.match(
    source,
    /private var running/
  );

  assert.match(
    source,
    /context\.sendBroadcast\(/
  );

  assert.match(
    source,
    /Context\.RECEIVER_NOT_EXPORTED/
  );
});

test("RC57.6F-A Activity no destruye ni posee la sesión", () => {
  const source = activity();

  assert.doesNotMatch(
    source,
    /IBERFITHeartRateSessionManager/
  );

  assert.doesNotMatch(
    source,
    /IBERFITWearHealthServicesBridge/
  );

  assert.doesNotMatch(
    source,
    /IBERFITWearDataLayerRuntime/
  );

  assert.doesNotMatch(
    source,
    /onDestroy\(/
  );
});

test("RC57.6F-A expone observabilidad de provider y DataLayer", () => {
  const workout = service();
  const listener = command();

  assert.match(
    workout,
    /PROVIDER_STATE provider=/
  );

  assert.match(
    workout,
    /PROVIDER_ERROR provider=/
  );

  assert.match(
    workout,
    /HEART_RATE_SAMPLE bpm=/
  );

  assert.match(
    workout,
    /DATALAYER_SAMPLE_SEND=QUEUED/
  );

  assert.match(
    workout,
    /DATALAYER_SAMPLE_SEND=FAILED/
  );

  assert.match(
    listener,
    /DATALAYER_COMMAND_RECEIVED/
  );

  assert.match(
    listener,
    /DATALAYER_COMMAND_DISPATCH/
  );
});

test("RC57.6F-A observa disponibilidad y updates internos de Health Services", () => {
  const source = provider();

  assert.match(
    source,
    /CALLBACK_REGISTERED/
  );

  assert.match(
    source,
    /EXERCISE_UPDATE state=/
  );

  assert.match(
    source,
    /HEART_RATE_POINTS count=/
  );

  assert.match(
    source,
    /HEART_RATE_AVAILABILITY class=/
  );

  assert.match(
    source,
    /EXERCISE_START_SUCCEEDED executionId=/
  );
});

test("RC57.6F-A permanece independiente de marca y hardware QA", () => {
  const source =
    `${manifest()}\n${activity()}\n${service()}\n${command()}`;

  assert.doesNotMatch(
    source,
    /Samsung|Galaxy|SM-R860|SM_J600G|SM-J600G|RFATA0LSLFR|5200bf3d8d5b45a3/i
  );
});