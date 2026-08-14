import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(path, "utf8");

const pass = (name, condition) => {
  if (!condition) {
    throw new Error(`FAIL ${name}`);
  }

  console.log(`PASS ${name}`);
};

const runtime =
  read(
    "native/android/runtime/IBERFITAndroidNativeTelemetryRuntime.kt"
  );

const client =
  read(
    "native/android/runtime/IBERFITBluetoothBackgroundBleSessionClient.kt"
  );

const service =
  read(
    "native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/IBERFITBluetoothHeartRateForegroundService.kt"
  );

const manifest =
  read(
    "native/android-host/phone-app/src/main/AndroidManifest.xml"
  );

pass(
  "rc57-6h-connected-device-fgs-manifest",
  manifest.includes(
    "android.permission.FOREGROUND_SERVICE"
  ) &&
    manifest.includes(
      "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE"
    ) &&
    manifest.includes(
      'android:foregroundServiceType="connectedDevice"'
    ) &&
    manifest.includes(
      "IBERFITBluetoothHeartRateForegroundService"
    )
);

pass(
  "rc57-6h-notification-permission-declared",
  manifest.includes(
    "android.permission.POST_NOTIFICATIONS"
  )
);

pass(
  "rc57-6h-service-promotes-with-connected-device-type",
  service.includes(
    "startForeground("
  ) &&
    service.includes(
      "FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE"
    ) &&
    service.includes(
      "NotificationChannel("
    ) &&
    service.includes(
      "START_NOT_STICKY"
    )
);

pass(
  "rc57-6h-prewarm-before-wear-decision",
  runtime.includes(
    "preferredBle.prepare("
  ) &&
    runtime.indexOf(
      "preferredBle.prepare("
    ) <
      runtime.indexOf(
        'dataLayer.sendCommand(\n            "start"'
      )
);

pass(
  "rc57-6h-no-background-fgs-launch-at-failover",
  runtime.includes(
    "bleBackgroundPrepared"
  ) &&
    runtime.includes(
      "preferredBle.start("
    ) &&
    !runtime.includes(
      "startForegroundService("
    )
);

pass(
  "rc57-6h-null-safe-controller-handoff",
  client.includes(
    "return currentController\n            ?.startBle("
  ) &&
    client.includes(
      "?: false"
    )
);

pass(
  "rc57-6h-preferred-device-only",
  client.includes(
    "IBERFITBlePreferredDeviceStore("
  ) &&
    client.includes(
      "BLUETOOTH_CONNECT"
    ) &&
    !client.includes(
      "ScanCallback"
    ) &&
    !client.includes(
      "startScan("
    )
);

pass(
  "rc57-6h-service-owns-preferred-runtime",
  service.includes(
    "IBERFITPreferredBleHeartRateRuntime("
  ) &&
    runtime.includes(
      "IBERFITBluetoothBackgroundBleSessionClient("
    )
);

pass(
  "rc57-6h-warm-stop-vs-release",
  client.includes(
    "fun stop()"
  ) &&
    client.includes(
      "fun release()"
    ) &&
    runtime.includes(
      "preferredBle.stop()"
    ) &&
    runtime.includes(
      "preferredBle.release()"
    )
);

pass(
  "rc57-6h-task-removal-cleanup",
  service.includes(
    "onTaskRemoved("
  ) &&
    service.includes(
      "stopSelf()"
    ) &&
    manifest.includes(
      'android:stopWithTask="true"'
    )
);

pass(
  "rc57-6h-no-brand-assumptions",
  !/(Samsung|Galaxy|Polar|Garmin|Wahoo|Coros|Fitbit|SM-R860|SM_J600G|SM-J600G)/i
    .test(
      [
        runtime,
        client,
        service
      ].join("\n")
    )
);

console.log(
  "RC57_6H_BLUETOOTH_BACKGROUND_RELIABILITY_STATIC=PASS"
);