import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(path, "utf8");

const runtime = () =>
  read(
    "native/android/runtime/IBERFITAndroidNativeTelemetryRuntime.kt"
  );

const preferred = () =>
  read(
    "native/android/runtime/IBERFITPreferredBleHeartRateRuntime.kt"
  );

const parser = () =>
  read(
    "native/android/ble/IBERFITBleHeartRateParser.kt"
  );

test(
  "RC57.6F mantiene contrato historico RC53 sin reintroducir filtros BLE",
  () => {
    const source =
      parser();

    assert.equal(
      source.includes(
        "RR intervals are preserved as raw milliseconds and are NOT converted to VFC."
      ),
      true
    );

    assert.equal(
      source.includes(
        "if (bpm !in 25..240) return null"
      ),
      false
    );

    assert.equal(
      source.includes(
        "250.0..2500.0"
      ),
      false
    );

    assert.equal(
      source.includes(
        "rr.size <"
      ),
      false
    );
  }
);

test(
  "RC57.6F runtime BLE usa solo el dispositivo preferido guardado",
  () => {
    const source =
      preferred();

    assert.equal(
      source.includes(
        "preferredStore.load()"
      ),
      true
    );

    assert.equal(
      source.includes(
        "adapter.getRemoteDevice("
      ),
      true
    );

    assert.equal(
      source.includes(
        "startScan("
      ),
      false
    );

    assert.equal(
      source.includes(
        "ScanCallback"
      ),
      false
    );
  }
);

test(
  "RC57.6F elimina el escaneo BLE ciego del runtime principal",
  () => {
    const source =
      runtime();

    assert.equal(
      source.includes(
        "IBERFITBleHeartRateRuntime("
      ),
      false
    );

    assert.equal(
      source.includes(
        "IBERFITPreferredBleHeartRateRuntime("
      ),
      true
    );
  }
);

test(
  "RC57.6F usa provider y session manager canonicos",
  () => {
    const source =
      preferred();

    for (
      const token of [
        "IBERFITAndroidBleHeartRateTransport(",
        "IBERFITBleHeartRateProvider(",
        "IBERFITHeartRateSessionManager(",
        "IBERFITHeartRateSessionContext("
      ]
    ) {
      assert.equal(
        source.includes(token),
        true
      );
    }
  }
);

test(
  "RC57.6F selecciona Wear primero y BLE preferido solo si no se envia al reloj",
  () => {
    const source =
      runtime();

    const wearDecision =
      source.indexOf(
        "if (sentToWatch)"
      );

    const bleStart =
      source.indexOf(
        "preferredBle.start("
      );

    assert.ok(
      wearDecision >= 0
    );

    assert.ok(
      bleStart > wearDecision
    );
  }
);

test(
  "RC57.6F pause resume respetan la fuente activa",
  () => {
    const source =
      runtime();

    assert.equal(
      source.includes(
        "ActiveSource.WEAR_OS"
      ),
      true
    );

    assert.equal(
      source.includes(
        "ActiveSource.BLUETOOTH_HRS"
      ),
      true
    );

    assert.equal(
      source.includes(
        "preferredBle.pause()"
      ),
      true
    );

    assert.equal(
      source.includes(
        "preferredBle.resume()"
      ),
      true
    );
  }
);

test(
  "RC57.6F ignora muestras con executionId ajeno",
  () => {
    const runtimeSource =
      runtime();

    const preferredSource =
      preferred();

    assert.equal(
      runtimeSource.includes(
        "sampleExecutionId !="
      ),
      true
    );

    assert.equal(
      preferredSource.includes(
        "sample.executionId !="
      ),
      true
    );

    assert.equal(
      runtimeSource.includes(
        "generation != startGeneration"
      ),
      true
    );
  }
);

test(
  "RC57.6F conserva contrato web BLE anterior y aÃ±ade provenance canonica",
  () => {
    const source =
      runtime();

    assert.equal(
      source.includes(
        '"provider",\n                "ble_direct"'
      ),
      true
    );

    assert.equal(
      source.includes(
        '"providerId",\n                providerId'
      ),
      true
    );

    assert.equal(
      source.includes(
        '"canonicalQuality"'
      ),
      true
    );

    assert.equal(
      source.includes(
        '"contactStatus"'
      ),
      true
    );

    assert.equal(
      source.includes(
        '"executionId"'
      ),
      true
    );
  }
);

test(
  "RC57.6F usa receive time cuando HRS no aporta timestamp sensor",
  () => {
    const source =
      runtime();

    assert.equal(
      source.includes(
        "recordedAtEpochMs"
      ),
      true
    );

    assert.equal(
      source.includes(
        "?: receivedAtEpochMs"
      ),
      true
    );
  }
);