import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(path, "utf8");

const runtime = () =>
  read(
    "native/android/runtime/IBERFITAndroidNativeTelemetryRuntime.kt"
  );

const diagnostics = () =>
  read(
    "native/android/runtime/IBERFITAndroidTelemetryDiagnostics.kt"
  );

const service = () =>
  read(
    "native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/IBERFITBluetoothHeartRateForegroundService.kt"
  );

const qa = () =>
  read(
    "native/android-host/phone-app/src/debug/java/cl/iberfit/m26/phone/IBERFITBluetoothPhysicalE2EActivity.kt"
  );

test(
  "RC57.6I-A diagnostics solo escribe en builds debuggable",
  () => {
    const source =
      diagnostics();

    assert.equal(
      source.includes(
        "ApplicationInfo.FLAG_DEBUGGABLE"
      ),
      true
    );

    assert.equal(
      source.includes(
        "if (!enabled) return"
      ),
      true
    );
  }
);

test(
  "RC57.6I-A diagnostics no acepta payloads arbitrarios",
  () => {
    const source =
      diagnostics();

    assert.equal(
      source.includes(
        "^[A-Z0-9_]+$"
      ),
      true
    );

    for (
      const forbidden of [
        "heartRateBpm",
        "rrIntervals",
        "deviceId",
        "executionId"
      ]
    ) {
      assert.equal(
        source.includes(forbidden),
        false
      );
    }
  }
);

test(
  "RC57.6I-A runtime deja evidencia del watchdog y failover",
  () => {
    const source =
      runtime();

    for (
      const event of [
        "WEAR_WATCHDOG_FIRED",
        "BLE_FAILOVER_REQUESTED",
        "BLE_FAILOVER_STARTED",
        "BLE_SAMPLE_RECEIVED",
        "WEAR_RECOVERY_FROM_BLE"
      ]
    ) {
      assert.equal(
        source.includes(`"${event}"`),
        true
      );
    }
  }
);

test(
  "RC57.6I-A service deja una marca por muestra BLE fisica",
  () => {
    const source =
      service();

    assert.equal(
      source.includes(
        '"FGS_BLE_SAMPLE"'
      ),
      true
    );

    assert.equal(
      source.includes(
        "IBERFITBluetoothBackgroundBridge"
      ),
      true
    );
  }
);

test(
  "RC57.6I-A QA controla servicio real sin fabricar sensor",
  () => {
    const source =
      qa();

    for (
      const token of [
        ".prepare(",
        ".startBle(",
        ".pauseBle(",
        ".resumeBle(",
        ".stopSession("
      ]
    ) {
      assert.equal(
        source.includes(token),
        true
      );
    }

    assert.equal(
      source.includes(
        "IBERFITBlePreferredDeviceStore"
      ),
      false
    );
  }
);

test(
  "RC57.6I-A conserva watchdogs RC57.6G",
  () => {
    const source =
      runtime();

    assert.equal(
      source.includes(
        "WEAR_INITIAL_SAMPLE_TIMEOUT_MS"
      ),
      true
    );

    assert.equal(
      source.includes(
        "WEAR_STALE_SAMPLE_TIMEOUT_MS"
      ),
      true
    );

    assert.equal(
      source.includes(
        "bleBackgroundPrepared"
      ),
      true
    );
  }
);
