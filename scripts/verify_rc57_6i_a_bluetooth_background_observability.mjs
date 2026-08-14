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

const diagnostics =
  read(
    "native/android/runtime/IBERFITAndroidTelemetryDiagnostics.kt"
  );

const service =
  read(
    "native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/IBERFITBluetoothHeartRateForegroundService.kt"
  );

const qa =
  read(
    "native/android-host/phone-app/src/debug/java/cl/iberfit/m26/phone/IBERFITBluetoothPhysicalE2EActivity.kt"
  );

const debugManifest =
  read(
    "native/android-host/phone-app/src/debug/AndroidManifest.xml"
  );

const mainManifest =
  read(
    "native/android-host/phone-app/src/main/AndroidManifest.xml"
  );

pass(
  "rc57-6i-debug-only-diagnostics",
  diagnostics.includes(
    "ApplicationInfo.FLAG_DEBUGGABLE"
  ) &&
    diagnostics.includes(
      "rc57_6i_telemetry_diagnostics.log"
    ) &&
    diagnostics.includes(
      "^[A-Z0-9_]+$"
    )
);

pass(
  "rc57-6i-no-health-values-in-diagnostic-writer",
  !diagnostics.includes(
    "heartRateBpm"
  ) &&
    !diagnostics.includes(
      "rrIntervals"
    ) &&
    !diagnostics.includes(
      "deviceId"
    ) &&
    !diagnostics.includes(
      "executionId"
    )
);

pass(
  "rc57-6i-runtime-transition-observability",
  [
    "RUNTIME_START",
    "BLE_FGS_PREPARED",
    "WEAR_START_QUEUED",
    "WEAR_SAMPLE_RECEIVED",
    "WEAR_WATCHDOG_FIRED",
    "BLE_FAILOVER_REQUESTED",
    "BLE_FAILOVER_STARTED",
    "BLE_SAMPLE_RECEIVED",
    "WEAR_RECOVERY_FROM_BLE",
    "RUNTIME_PAUSE",
    "RUNTIME_RESUME",
    "RUNTIME_STOP"
  ].every(
    (event) =>
      runtime.includes(`"${event}"`)
  )
);

pass(
  "rc57-6i-fgs-observability",
  [
    "FGS_ON_CREATE",
    "FGS_PREPARE_SESSION",
    "FGS_PROMOTED",
    "FGS_BLE_START_REQUEST",
    "FGS_BLE_STARTED",
    "FGS_BLE_SAMPLE",
    "FGS_BLE_PAUSE",
    "FGS_BLE_RESUME",
    "FGS_BLE_WARM_STOP",
    "FGS_SESSION_STOP",
    "FGS_TASK_REMOVED",
    "FGS_ON_DESTROY"
  ].every(
    (event) =>
      service.includes(`"${event}"`)
  )
);

pass(
  "rc57-6i-debug-qa-only",
  debugManifest.includes(
    "IBERFITBluetoothPhysicalE2EActivity"
  ) &&
    debugManifest.includes(
      'android:exported="true"'
    ) &&
    !mainManifest.includes(
      "IBERFITBluetoothPhysicalE2EActivity"
    )
);

pass(
  "rc57-6i-qa-does-not-fake-preferred-device",
  qa.includes(
    "IBERFITBluetoothBackgroundBridge"
  ) &&
    qa.includes(
      ".prepare("
    ) &&
    qa.includes(
      ".startBle("
    ) &&
    qa.includes(
      ".pauseBle("
    ) &&
    qa.includes(
      ".resumeBle("
    ) &&
    qa.includes(
      ".stopSession("
    ) &&
    !qa.includes(
      "IBERFITBlePreferredDeviceStore"
    ) &&
    !qa.includes(
      "putString("
    )
);

pass(
  "rc57-6i-background-sample-evidence",
  service.includes(
    '"FGS_BLE_SAMPLE"'
  ) &&
    runtime.includes(
      '"BLE_SAMPLE_RECEIVED"'
    )
);

pass(
  "rc57-6i-no-brand-assumptions",
  !/(Samsung|Galaxy|Polar|Garmin|Wahoo|Coros|Fitbit|SM-R860|SM_J600G|SM-J600G)/i
    .test(
      [
        runtime,
        diagnostics,
        service,
        qa
      ].join("\n")
    )
);

console.log(
  "RC57_6I_A_BLUETOOTH_BACKGROUND_OBSERVABILITY_STATIC=PASS"
);
