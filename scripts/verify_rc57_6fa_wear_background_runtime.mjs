import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const pass = (name, ok) => {
  if (!ok) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

const manifest =
  read("native/android-host/wear-app/src/main/AndroidManifest.xml");

const activity =
  read("native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt");

const service =
  read("native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/IBERFITWearWorkoutService.kt");

const command =
  read("native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/IBERFITWearCommandListenerService.kt");

pass(
  "rc57-6fa-health-foreground-service-manifest",
  manifest.includes(
    "android.permission.FOREGROUND_SERVICE"
  ) &&
    manifest.includes(
      "android.permission.FOREGROUND_SERVICE_HEALTH"
    ) &&
    manifest.includes(
      'android:foregroundServiceType="health"'
    ) &&
    manifest.includes(
      'android:name=".IBERFITWearWorkoutService"'
    )
);

pass(
  "rc57-6fa-notification-permission",
  manifest.includes(
    "android.permission.POST_NOTIFICATIONS"
  ) &&
    activity.includes(
      "Manifest.permission.POST_NOTIFICATIONS"
    ) &&
    activity.includes(
      "REQUEST_NOTIFICATIONS_PERMISSION"
    )
);

pass(
  "rc57-6fa-background-health-permissions",
  manifest.includes(
    "android.permission.BODY_SENSORS_BACKGROUND"
  ) &&
    manifest.includes(
      'android:maxSdkVersion="35"'
    ) &&
    manifest.includes(
      "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"
    )
);

pass(
  "rc57-6fa-activity-requests-background-health",
  activity.includes(
    "READ_HEALTH_DATA_IN_BACKGROUND_PERMISSION"
  ) &&
    activity.includes(
      "Manifest.permission.BODY_SENSORS_BACKGROUND"
    ) &&
    activity.includes(
      "REQUEST_BACKGROUND_HEALTH_PERMISSION"
    )
);

pass(
  "rc57-6fa-service-owns-workout-runtime",
  service.includes(
    "IBERFITWearHealthServicesBridge"
  ) &&
    service.includes(
      "IBERFITHeartRateSessionManager"
    ) &&
    service.includes(
      "IBERFITWearDataLayerRuntime"
    ) &&
    service.includes(
      "sessionManager.start("
    ) &&
    service.includes(
      "dataLayer.sendSample("
    )
);

pass(
  "rc57-6fa-service-promotes-health-fgs",
  service.includes(
    "startForeground("
  ) &&
    service.includes(
      "ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH"
    ) &&
    service.includes(
      "NotificationChannel"
    ) &&
    service.includes(
      ".setOngoing(true)"
    )
);

pass(
  "rc57-6fa-background-command-listener",
  command.includes(
    "WearableListenerService"
  ) &&
    command.includes(
      "IBERFITWearDataLayerRuntime.COMMAND_PATH"
    ) &&
    command.includes(
      "IBERFITWearWorkoutService"
    ) &&
    manifest.includes(
      "com.google.android.gms.wearable.MESSAGE_RECEIVED"
    ) &&
    manifest.includes(
      'android:pathPrefix="/iberfit/live-command"'
    )
);

pass(
  "rc57-6fa-running-service-command-bus",
  service.includes(
    "@Volatile"
  ) &&
    service.includes(
      "private var running"
    ) &&
    service.includes(
      "context.sendBroadcast("
    ) &&
    service.includes(
      "Context.RECEIVER_NOT_EXPORTED"
    )
);

pass(
  "rc57-6fa-activity-does-not-own-workout",
  !activity.includes(
    "IBERFITHeartRateSessionManager"
  ) &&
    !activity.includes(
      "IBERFITWearHealthServicesBridge"
    ) &&
    !activity.includes(
      "IBERFITWearDataLayerRuntime"
    ) &&
    !activity.includes(
      "onDestroy()"
    )
);

pass(
  "rc57-6fa-runtime-observability",
  service.includes(
    "PROVIDER_STATE provider="
  ) &&
    service.includes(
      "PROVIDER_ERROR provider="
    ) &&
    service.includes(
      "HEART_RATE_SAMPLE bpm="
    ) &&
    service.includes(
      "DATALAYER_SAMPLE_SEND=QUEUED"
    ) &&
    service.includes(
      "DATALAYER_SAMPLE_SEND=FAILED"
    ) &&
    command.includes(
      "DATALAYER_COMMAND_RECEIVED"
    ) &&
    command.includes(
      "DATALAYER_COMMAND_DISPATCH"
    )
);

pass(
  "rc57-6fa-no-brand-assumptions",
  !/(Samsung|Galaxy|SM-R860|SM_J600G|SM-J600G|RFATA0LSLFR|5200bf3d8d5b45a3)/i
    .test(
      `${manifest}\n${activity}\n${service}\n${command}`
    )
);

console.log(
  "RC57_6FA_WEAR_BACKGROUND_RUNTIME_STATIC=PASS"
);