import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = () =>
  fs.readFileSync(
    "native/android/runtime/IBERFITAndroidNativeTelemetryRuntime.kt",
    "utf8"
  );

test(
  "RC57.6G diferencia command queued de HR realmente recibido",
  () => {
    const runtime =
      source();

    assert.equal(
      runtime.includes(
        "wearSessionQueued"
      ),
      true
    );

    assert.equal(
      runtime.includes(
        "WEAR_INITIAL_SAMPLE_TIMEOUT_MS"
      ),
      true
    );

    assert.equal(
      runtime.includes(
        "30_000L"
      ),
      true
    );
  }
);

test(
  "RC57.6G hace failover a BLE preferido si Wear no entrega muestras",
  () => {
    const runtime =
      source();

    const watchdog =
      runtime.indexOf(
        "val watchdog ="
      );

    const fallback =
      runtime.indexOf(
        "fallbackToPreferredBle(",
        watchdog
      );

    assert.ok(
      watchdog >= 0
    );

    assert.ok(
      fallback > watchdog
    );

    assert.equal(
      runtime.includes(
        "preferredBle.start("
      ),
      true
    );
  }
);

test(
  "RC57.6G rearma watchdog stale despues de cada muestra Wear",
  () => {
    const runtime =
      source();

    const wearHandler =
      runtime.indexOf(
        "private fun handleWearSample("
      );

    const staleArm =
      runtime.indexOf(
        "WEAR_STALE_SAMPLE_TIMEOUT_MS",
        wearHandler
      );

    assert.ok(
      wearHandler >= 0
    );

    assert.ok(
      staleArm > wearHandler
    );
  }
);

test(
  "RC57.6G una muestra Wear tardia recupera Wear y apaga BLE",
  () => {
    const runtime =
      source();

    const wearHandler =
      runtime.indexOf(
        "private fun handleWearSample("
      );

    const bleStop =
      runtime.indexOf(
        "preferredBle.stop()",
        wearHandler
      );

    const wearActive =
      runtime.indexOf(
        "ActiveSource.WEAR_OS",
        bleStop
      );

    assert.ok(
      wearHandler >= 0
    );

    assert.ok(
      bleStop > wearHandler
    );

    assert.ok(
      wearActive > bleStop
    );
  }
);

test(
  "RC57.6G pausa cancela watchdog y evita failover durante pausa",
  () => {
    const runtime =
      source();

    const pause =
      runtime.indexOf(
        "private fun pause("
      );

    const resume =
      runtime.indexOf(
        "private fun resume(",
        pause
      );

    const pauseBody =
      runtime.slice(
        pause,
        resume
      );

    assert.equal(
      pauseBody.includes(
        "paused ="
      ),
      true
    );

    assert.equal(
      pauseBody.includes(
        "cancelWearWatchdog()"
      ),
      true
    );
  }
);

test(
  "RC57.6G STOP termina Wear aunque BLE este en failover",
  () => {
    const runtime =
      source();

    const stop =
      runtime.indexOf(
        "private fun stop("
      );

    const serializer =
      runtime.indexOf(
        "private fun IBERFITHeartRateSample.toWebSample",
        stop
      );

    const stopBody =
      runtime.slice(
        stop,
        serializer
      );

    assert.equal(
      stopBody.includes(
        "if (wearSessionQueued)"
      ),
      true
    );

    assert.equal(
      stopBody.includes(
        '"stop"'
      ),
      true
    );

    assert.equal(
      stopBody.includes(
        "preferredBle.stop()"
      ),
      true
    );
  }
);

test(
  "RC57.6G callbacks viejos no pueden cambiar una ejecucion nueva",
  () => {
    const runtime =
      source();

    assert.equal(
      runtime.includes(
        "generation != startGeneration"
      ),
      true
    );

    assert.equal(
      runtime.includes(
        "generation !=\n                        expectedGeneration"
      ),
      true
    );

    assert.equal(
      runtime.includes(
        "generation !=\n                            resumeGeneration"
      ),
      true
    );
  }
);

test(
  "RC57.6G mantiene compatibilidad web BLE y no reintroduce scan ciego",
  () => {
    const runtime =
      source();

    assert.equal(
      runtime.includes(
        '"provider",\n                "ble_direct"'
      ),
      true
    );

    assert.equal(
      runtime.includes(
        "IBERFITBleHeartRateRuntime("
      ),
      false
    );

    assert.equal(
      runtime.includes(
        "startScan("
      ),
      false
    );
  }
);