import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const pass = (name, ok) => {
  if (!ok) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

const phone =
  read("native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/PhoneMainActivity.kt");
const wear =
  read("native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt");
const manifest =
  read("native/android-host/wear-app/src/main/AndroidManifest.xml");
const wearBuild =
  read("native/android-host/wear-app/build.gradle.kts");

pass("rc57-4-runtime-permission-api36",
  wear.includes("android.permission.health.READ_HEART_RATE") &&
  wear.includes("Build.VERSION.SDK_INT >= 36") &&
  wear.includes("requestPermissions("));

pass("rc57-4-runtime-permission-legacy",
  wear.includes("Manifest.permission.BODY_SENSORS"));

pass("rc57-4-exercise-callback",
  wear.includes("ExerciseUpdateCallback") &&
  wear.includes("setUpdateCallback(exerciseCallback)") &&
  wear.includes("clearUpdateCallbackAsync(exerciseCallback)"));

pass("rc57-4-capabilities-gate",
  wear.includes("getCapabilitiesAsync()") &&
  wear.includes("ExerciseType.WORKOUT") &&
  wear.includes("supportedDataTypes") &&
  wear.includes("DataType.HEART_RATE_BPM"));

pass("rc57-4-exercise-lifecycle",
  wear.includes("startExerciseAsync(config)") &&
  wear.includes("pauseExerciseAsync()") &&
  wear.includes("resumeExerciseAsync()") &&
  wear.includes("endExerciseAsync()"));

pass("rc57-4-real-hr-extraction",
  wear.includes("update.latestMetrics.getData(DataType.HEART_RATE_BPM)") &&
  wear.includes("health.validateHeartRate(point.value)"));

pass("rc57-4-real-datalayer-send",
  wear.includes('.put("provider", "wear_os_health_services")') &&
  wear.includes('.put("heartRateBpm", bpm)') &&
  wear.includes("dataLayer.sendSample(sample)"));

pass("rc57-4-execution-correlation",
  wear.includes('.put("executionId", it)') &&
  phone.includes('sample.optString("executionId")'));

pass("rc57-4-phone-controls",
  phone.includes('sendCommand("start")') &&
  phone.includes('sendCommand("pause")') &&
  phone.includes('sendCommand("resume")') &&
  phone.includes('sendCommand("stop")'));

pass("rc57-4-manifest-permission",
  manifest.includes("android.permission.health.READ_HEART_RATE") &&
  manifest.includes("android.permission.BODY_SENSORS"));

pass("rc57-4-guava-listenablefuture-compile-classpath",
  wearBuild.includes('com.google.guava:guava:32.0.1-android'));

pass("rc57-4-no-synthetic-provider",
  !wear.includes("synthetic") &&
  !wear.includes("USE_SYNTHETIC_PROVIDERS"));

console.log("RC57_4_WEAR_HEALTH_LIFECYCLE_STATIC=PASS");