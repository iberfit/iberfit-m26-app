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

const preferred =
  read(
    "native/android/runtime/IBERFITPreferredBleHeartRateRuntime.kt"
  );

const parser =
  read(
    "native/android/ble/IBERFITBleHeartRateParser.kt"
  );

pass(
  "rc57-6f-legacy-rc53-parser-contract",
  parser.includes(
    "RR intervals are preserved as raw milliseconds and are NOT converted to VFC."
  ) &&
    !parser.includes("if (bpm !in 25..240) return null") &&
    !parser.includes("250.0..2500.0") &&
    !parser.includes("rr.size <")
);

pass(
  "rc57-6f-preferred-store-runtime",
  preferred.includes(
    "IBERFITBlePreferredDeviceStore("
  ) &&
    preferred.includes(
      "preferredStore.load()"
    ) &&
    preferred.includes(
      "adapter.getRemoteDevice("
    )
);

pass(
  "rc57-6f-no-blind-runtime-scan",
  !preferred.includes(
    "ScanCallback"
  ) &&
    !preferred.includes(
      "ScanFilter"
    ) &&
    !preferred.includes(
      "startScan("
    ) &&
    !runtime.includes(
      "IBERFITBleHeartRateRuntime("
    )
);

pass(
  "rc57-6f-canonical-provider-runtime",
  preferred.includes(
    "IBERFITAndroidBleHeartRateTransport("
  ) &&
    preferred.includes(
      "IBERFITBleHeartRateProvider("
    ) &&
    preferred.includes(
      "IBERFITHeartRateSessionManager("
    ) &&
    preferred.includes(
      "preferredProviderId ="
    )
);

pass(
  "rc57-6f-execution-correlation",
  preferred.includes(
    "sample.executionId !="
  ) &&
    runtime.includes(
      "sampleExecutionId !="
    ) &&
    runtime.includes(
      "generation != startGeneration"
    )
);

pass(
  "rc57-6f-source-sticky-routing",
  runtime.includes(
    "ActiveSource.WEAR_OS"
  ) &&
    runtime.includes(
      "ActiveSource.BLUETOOTH_HRS"
    ) &&
    runtime.includes(
      "preferredBle.pause()"
    ) &&
    runtime.includes(
      "preferredBle.resume()"
    ) &&
    runtime.includes(
      'dataLayer.sendCommand('
    )
);

pass(
  "rc57-6f-wear-first-ble-fallback",
  runtime.includes(
    "if (sentToWatch)"
  ) &&
    runtime.includes(
      "preferredBle.start("
    ) &&
    runtime.includes(
      "ActiveSource.BLUETOOTH_HRS"
    )
);

pass(
  "rc57-6f-web-contract-backward-compatible",
  runtime.includes(
    '"provider",\n                "ble_direct"'
  ) &&
    runtime.includes(
      '"providerId",\n                providerId'
    ) &&
    runtime.includes(
      '"canonicalQuality"'
    ) &&
    runtime.includes(
      '"executionId"'
    )
);

pass(
  "rc57-6f-canonical-timestamp-provenance",
  runtime.includes(
    "recordedAtEpochMs"
  ) &&
    runtime.includes(
      "receivedAtEpochMs"
    ) &&
    runtime.includes(
      "Instant.ofEpochMilli("
    )
);

pass(
  "rc57-6f-no-brand-assumptions",
  !/(Samsung|Galaxy|Polar|Garmin|Wahoo|Coros|Fitbit|SM-R860|SM_J600G|SM-J600G)/i
    .test(
      [
        runtime,
        preferred
      ].join("\n")
    )
);

console.log(
  "RC57_6F_BLUETOOTH_PREFERRED_RUNTIME_INTEGRATION_STATIC=PASS"
);