import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const pass = (name, ok) => {
  if (!ok) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

const bridge =
  read("native/android/wear/IBERFITWearHealthServicesBridge.kt");
const wear =
  read("native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt");
const runtime =
  read("native/android/runtime/IBERFITWearDataLayerRuntime.kt");

pass(
  "rc57-6b-health-services-is-provider",
  bridge.includes(": IBERFITHeartRateProvider") &&
    bridge.includes(
      "override val descriptor = IBERFITHeartRateProviderDescriptor"
    )
);

pass(
  "rc57-6b-stable-provider-id",
  bridge.includes(
    'const val PROVIDER_ID = "wear_os_health_services"'
  )
);

pass(
  "rc57-6b-provider-owns-exerciseclient",
  bridge.includes("HealthServices.getClient(appContext).exerciseClient") &&
    bridge.includes("ExerciseUpdateCallback") &&
    bridge.includes("getCapabilitiesAsync()") &&
    bridge.includes("startExerciseAsync(config)") &&
    bridge.includes("pauseExerciseAsync()") &&
    bridge.includes("resumeExerciseAsync()") &&
    bridge.includes("endExerciseAsync()")
);

pass(
  "rc57-6b-provider-emits-canonical-sample",
  bridge.includes("IBERFITHeartRateSample(") &&
    bridge.includes("providerId = descriptor.providerId") &&
    bridge.includes("deviceType = IBERFITHeartRateDeviceType.WATCH") &&
    bridge.includes("executionId = context.executionId") &&
    bridge.includes("sessionId = context.sessionId")
);

pass(
  "rc57-6b-provider-preserves-outliers",
  bridge.includes("val bpm = point.value") &&
    bridge.includes("IBERFITHeartRateQuality.OUT_OF_RANGE") &&
    !bridge.includes("takeIf { it in 25.0..240.0 }")
);

pass(
  "rc57-6b-host-uses-session-manager",
  wear.includes("IBERFITHeartRateSessionManager") &&
    wear.includes("listOf(healthProvider)") &&
    wear.includes("sessionManager.start(") &&
    wear.includes("sessionManager.pause()") &&
    wear.includes("sessionManager.resume()") &&
    wear.includes("sessionManager.stop()")
);

pass(
  "rc57-6b-host-no-direct-exerciseclient",
  !wear.includes("ExerciseUpdateCallback") &&
    !wear.includes("startExerciseAsync(") &&
    !wear.includes("pauseExerciseAsync(") &&
    !wear.includes("resumeExerciseAsync(") &&
    !wear.includes("endExerciseAsync(")
);

pass(
  "rc57-6b-canonical-datalayer-serialization",
  wear.includes('.put("provider", providerId)') &&
    wear.includes('.put("heartRateBpm", bpm)') &&
    wear.includes('.put("quality", quality.name.lowercase())') &&
    wear.includes('.put("deviceType", deviceType.name.lowercase())') &&
    wear.includes('.put("contactStatus", contactStatus.name.lowercase())') &&
    wear.includes('put("sessionId", it)') &&
    wear.includes('put("executionId", it)')
);

pass(
  "rc57-6b-datalayer-provider-neutral",
  runtime.includes("provider.isNotBlank()") &&
    !runtime.includes(
      'provider == "wear_os_health_services"'
    ) &&
    !runtime.includes("bpm in 25.0..240.0")
);

pass(
  "rc57-6b-no-brand-hardware-assumptions",
  !/(Samsung|Galaxy|SM-R860|SM_J600G|SM-J600G|RFATA0LSLFR|5200bf3d8d5b45a3)/i
    .test(`${bridge}\n${wear}\n${runtime}`)
);

console.log(
  "RC57_6B_WEAR_HEALTH_SERVICES_PROVIDER_STATIC=PASS"
);