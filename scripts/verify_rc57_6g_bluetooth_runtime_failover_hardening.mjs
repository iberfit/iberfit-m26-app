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

pass(
  "rc57-6g-main-looper-state-serialization",
  runtime.includes(
    "Handler("
  ) &&
    runtime.includes(
      "Looper.getMainLooper()"
    ) &&
    runtime.includes(
      "runtimeHandler.post {"
    )
);

pass(
  "rc57-6g-startup-watchdog",
  runtime.includes(
    "WEAR_INITIAL_SAMPLE_TIMEOUT_MS"
  ) &&
    runtime.includes(
      "30_000L"
    ) &&
    runtime.includes(
      "armWearWatchdog("
    ) &&
    runtime.includes(
      "fallbackToPreferredBle("
    )
);

pass(
  "rc57-6g-stale-stream-watchdog",
  runtime.includes(
    "WEAR_STALE_SAMPLE_TIMEOUT_MS"
  ) &&
    runtime.includes(
      "20_000L"
    ) &&
    runtime.includes(
      "handleWearSample("
    )
);

pass(
  "rc57-6g-queued-is-not-sample-proof",
  runtime.includes(
    "accepted for transport"
  ) &&
    runtime.includes(
      "wearSessionQueued"
    )
);

pass(
  "rc57-6g-preferred-ble-failover",
  runtime.includes(
    "preferredBle.start("
  ) &&
    runtime.includes(
      "ActiveSource.BLUETOOTH_HRS"
    ) &&
    runtime.includes(
      "bleFallbackAttempted"
    )
);

pass(
  "rc57-6g-late-wear-recovery",
  runtime.includes(
    "if (\n            activeSource ==\n                ActiveSource.BLUETOOTH_HRS"
  ) &&
    runtime.includes(
      "preferredBle.stop()"
    ) &&
    runtime.includes(
      "activeSource =\n            ActiveSource.WEAR_OS"
    )
);

pass(
  "rc57-6g-pause-watchdog-suppression",
  runtime.includes(
    "paused =\n            true"
  ) &&
    runtime.includes(
      "cancelWearWatchdog()"
    ) &&
    runtime.includes(
      "if (\n            !active ||\n            paused ||"
    )
);

pass(
  "rc57-6g-stop-both-possible-sources",
  runtime.includes(
    "When BLE is active because Wear stalled"
  ) &&
    runtime.includes(
      'dataLayer.sendCommand(\n                "stop"'
    ) &&
    runtime.includes(
      "preferredBle.stop()"
    )
);

pass(
  "rc57-6g-stale-callback-generation-guard",
  runtime.includes(
    "generation !="
  ) &&
    runtime.includes(
      "expectedGeneration"
    ) &&
    runtime.includes(
      "resumeGeneration"
    )
);

pass(
  "rc57-6g-no-blind-ble-scan-regression",
  !runtime.includes(
    "IBERFITBleHeartRateRuntime("
  ) &&
    !runtime.includes(
      "ScanCallback"
    ) &&
    !runtime.includes(
      "startScan("
    )
);

pass(
  "rc57-6g-no-brand-assumptions",
  !/(Samsung|Galaxy|Polar|Garmin|Wahoo|Coros|Fitbit|SM-R860|SM_J600G|SM-J600G)/i
    .test(runtime)
);

console.log(
  "RC57_6G_BLUETOOTH_RUNTIME_FAILOVER_HARDENING_STATIC=PASS"
);