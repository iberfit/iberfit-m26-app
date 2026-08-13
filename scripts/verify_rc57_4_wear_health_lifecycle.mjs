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

const service =
  read("native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/IBERFITWearWorkoutService.kt");

const provider =
  read("native/android/wear/IBERFITWearHealthServicesBridge.kt");

const manifest =
  read("native/android-host/wear-app/src/main/AndroidManifest.xml");

const wearBuild =
  read("native/android-host/wear-app/build.gradle.kts");

pass(
  "rc57-4-runtime-permission-api36",
  wear.includes(
    "android.permission.health.READ_HEART_RATE"
  ) &&
    wear.includes(
      "Build.VERSION.SDK_INT >= 36"
    ) &&
    wear.includes(
      "requestPermissions("
    )
);

pass(
  "rc57-4-runtime-permission-legacy",
  wear.includes(
    "Manifest.permission.BODY_SENSORS"
  )
);

pass(
  "rc57-4-exercise-callback",
  provider.includes(
    "ExerciseUpdateCallback"
  ) &&
    provider.includes(
      "setUpdateCallback(exerciseCallback)"
    ) &&
    provider.includes(
      "clearUpdateCallbackAsync(exerciseCallback)"
    )
);

pass(
  "rc57-4-capabilities-gate",
  provider.includes(
    "getCapabilitiesAsync()"
  ) &&
    provider.includes(
      "ExerciseType.WORKOUT"
    ) &&
    provider.includes(
      "supportedDataTypes"
    ) &&
    provider.includes(
      "DataType.HEART_RATE_BPM"
    )
);

pass(
  "rc57-4-exercise-lifecycle",
  provider.includes(
    "startExerciseAsync(config)"
  ) &&
    provider.includes(
      "pauseExerciseAsync()"
    ) &&
    provider.includes(
      "resumeExerciseAsync()"
    ) &&
    provider.includes(
      "endExerciseAsync()"
    )
);

pass(
  "rc57-4-real-hr-extraction",
  provider.includes(
    "update.latestMetrics.getData(DataType.HEART_RATE_BPM)"
  ) &&
    provider.includes(
      "IBERFITHeartRateSample("
    )
);

pass(
  "rc57-4-real-datalayer-send",
  provider.includes(
    'const val PROVIDER_ID = "wear_os_health_services"'
  ) &&
    service.includes(
      '.put("heartRateBpm", bpm)'
    ) &&
    service.includes(
      "dataLayer.sendSample("
    )
);

pass(
  "rc57-4-execution-correlation",
  /json\.put\(\s*"executionId",\s*it\s*\)/s.test(
    service
  ) &&
    phone.includes(
      'sample.optString("executionId")'
    )
);

pass(
  "rc57-4-phone-controls",
  phone.includes('sendCommand("start")') &&
    phone.includes('sendCommand("pause")') &&
    phone.includes('sendCommand("resume")') &&
    phone.includes('sendCommand("stop")')
);

pass(
  "rc57-4-manifest-permission",
  manifest.includes(
    "android.permission.health.READ_HEART_RATE"
  ) &&
    manifest.includes(
      "android.permission.BODY_SENSORS"
    )
);

pass(
  "rc57-4-guava-listenablefuture-compile-classpath",
  wearBuild.includes(
    "com.google.guava:guava:32.0.1-android"
  )
);

pass(
  "rc57-4-no-synthetic-provider",
  !provider.includes("synthetic") &&
    !service.includes(
      "USE_SYNTHETIC_PROVIDERS"
    )
);

console.log(
  "RC57_4_WEAR_HEALTH_LIFECYCLE_STATIC=PASS"
);