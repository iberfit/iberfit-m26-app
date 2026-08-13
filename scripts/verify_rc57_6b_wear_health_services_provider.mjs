import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const pass = (name, ok) => {
  if (!ok) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

const bridge =
  read("native/android/wear/IBERFITWearHealthServicesBridge.kt");

const host =
  read("native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/IBERFITWearWorkoutService.kt");

const activity =
  read("native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt");

const runtime =
  read("native/android/runtime/IBERFITWearDataLayerRuntime.kt");

pass(
  "rc57-6b-health-services-is-provider",
  bridge.includes(
    ": IBERFITHeartRateProvider"
  ) &&
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
  bridge.includes(
    "HealthServices.getClient(appContext).exerciseClient"
  ) &&
    bridge.includes(
      "ExerciseUpdateCallback"
    ) &&
    bridge.includes(
      "getCapabilitiesAsync()"
    ) &&
    bridge.includes(
      "startExerciseAsync(config)"
    ) &&
    bridge.includes(
      "pauseExerciseAsync()"
    ) &&
    bridge.includes(
      "resumeExerciseAsync()"
    ) &&
    bridge.includes(
      "endExerciseAsync()"
    )
);

pass(
  "rc57-6b-provider-emits-canonical-sample",
  bridge.includes(
    "IBERFITHeartRateSample("
  ) &&
    bridge.includes(
      "providerId = descriptor.providerId"
    ) &&
    bridge.includes(
      "deviceType = IBERFITHeartRateDeviceType.WATCH"
    ) &&
    bridge.includes(
      "executionId = context.executionId"
    ) &&
    bridge.includes(
      "sessionId = context.sessionId"
    )
);

pass(
  "rc57-6b-provider-preserves-outliers",
  bridge.includes(
    "val bpm = point.value"
  ) &&
    bridge.includes(
      "IBERFITHeartRateQuality.OUT_OF_RANGE"
    ) &&
    !bridge.includes(
      "takeIf { it in 25.0..240.0 }"
    )
);

pass(
  "rc57-6b-host-uses-session-manager",
  host.includes(
    "IBERFITHeartRateSessionManager"
  ) &&
    host.includes(
      "listOf(healthProvider)"
    ) &&
    host.includes(
      "sessionManager.start("
    ) &&
    host.includes(
      "sessionManager.pause()"
    ) &&
    host.includes(
      "sessionManager.resume()"
    ) &&
    host.includes(
      "sessionManager.stop()"
    )
);

pass(
  "rc57-6b-host-no-direct-exerciseclient",
  !host.includes(
    "ExerciseUpdateCallback"
  ) &&
    !host.includes(
      "startExerciseAsync("
    ) &&
    !host.includes(
      "pauseExerciseAsync("
    ) &&
    !host.includes(
      "resumeExerciseAsync("
    ) &&
    !host.includes(
      "endExerciseAsync("
    )
);

pass(
  "rc57-6b-canonical-datalayer-serialization",
  host.includes(
    '.put("provider", providerId)'
  ) &&
    host.includes(
      '.put("heartRateBpm", bpm)'
    ) &&
    host.includes(
      '"quality",'
    ) &&
    host.includes(
      'quality.name.lowercase()'
    ) &&
    host.includes(
      '"deviceType",'
    ) &&
    host.includes(
      'deviceType.name.lowercase()'
    ) &&
    host.includes(
      '"contactStatus",'
    ) &&
    host.includes(
      'contactStatus.name.lowercase()'
    ) &&
    host.includes(
      '"sessionId",'
    ) &&
    host.includes(
      '"executionId",'
    )
);

pass(
  "rc57-6b-datalayer-provider-neutral",
  runtime.includes(
    "provider.isNotBlank()"
  ) &&
    !runtime.includes(
      'provider == "wear_os_health_services"'
    ) &&
    !runtime.includes(
      "bpm in 25.0..240.0"
    )
);

pass(
  "rc57-6b-activity-is-ui-only",
  !activity.includes(
    "IBERFITHeartRateSessionManager"
  ) &&
    !activity.includes(
      "IBERFITWearHealthServicesBridge"
    )
);

pass(
  "rc57-6b-no-brand-hardware-assumptions",
  !/(Samsung|Galaxy|SM-R860|SM_J600G|SM-J600G|RFATA0LSLFR|5200bf3d8d5b45a3)/i
    .test(
      `${bridge}\n${host}\n${activity}\n${runtime}`
    )
);

console.log(
  "RC57_6B_WEAR_HEALTH_SERVICES_PROVIDER_STATIC=PASS"
);