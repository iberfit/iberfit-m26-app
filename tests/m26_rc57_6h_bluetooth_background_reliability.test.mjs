import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(path, "utf8");

const runtime = () =>
  read(
    "native/android/runtime/IBERFITAndroidNativeTelemetryRuntime.kt"
  );

const client = () =>
  read(
    "native/android/runtime/IBERFITBluetoothBackgroundBleSessionClient.kt"
  );

const service = () =>
  read(
    "native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/IBERFITBluetoothHeartRateForegroundService.kt"
  );

const manifest = () =>
  read(
    "native/android-host/phone-app/src/main/AndroidManifest.xml"
  );

test(
  "RC57.6H declara foreground service connectedDevice completo",
  () => {
    const source =
      manifest();

    for (
      const token of [
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE",
        'android:foregroundServiceType="connectedDevice"',
        "IBERFITBluetoothHeartRateForegroundService"
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
  "RC57.6H prepara FGS antes de esperar el resultado Wear",
  () => {
    const source =
      runtime();

    const prepare =
      source.indexOf(
        "preferredBle.prepare("
      );

    const wearStart =
      source.indexOf(
        'dataLayer.sendCommand(\n            "start"'
      );

    assert.ok(
      prepare >= 0
    );

    assert.ok(
      wearStart > prepare
    );
  }
);

test(
  "RC57.6H failover BLE no intenta lanzar FGS cuando ya esta en background",
  () => {
    const source =
      runtime();

    assert.equal(
      source.includes(
        "startForegroundService("
      ),
      false
    );

    assert.equal(
      source.includes(
        "bleBackgroundPrepared"
      ),
      true
    );

    assert.equal(
      source.includes(
        "preferredBle.start("
      ),
      true
    );
  }
);

test(
  "RC57.6H handoff al controller tolera nulabilidad Kotlin",
  () => {
    const source =
      client();

    assert.equal(
      source.includes(
        "return currentController\n            ?.startBle("
      ),
      true
    );

    assert.equal(
      source.includes(
        "?: false"
      ),
      true
    );

    assert.equal(
      source.includes(
        "return currentController\n            .startBle("
      ),
      false
    );
  }
);

test(
  "RC57.6H background client exige preferido y permiso connect",
  () => {
    const source =
      client();

    assert.equal(
      source.includes(
        "IBERFITBlePreferredDeviceStore("
      ),
      true
    );

    assert.equal(
      source.includes(
        "Manifest.permission.BLUETOOTH_CONNECT"
      ),
      true
    );

    assert.equal(
      source.includes(
        "startScan("
      ),
      false
    );
  }
);

test(
  "RC57.6H service usa tipo connectedDevice al promoverse",
  () => {
    const source =
      service();

    assert.equal(
      source.includes(
        "FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE"
      ),
      true
    );

    assert.equal(
      source.includes(
        "NotificationChannel("
      ),
      true
    );

    assert.equal(
      source.includes(
        "START_NOT_STICKY"
      ),
      true
    );
  }
);

test(
  "RC57.6H Wear tardio detiene BLE pero conserva lease caliente",
  () => {
    const source =
      runtime();

    const wearHandler =
      source.indexOf(
        "private fun handleWearSample("
      );

    const nextFunction =
      source.indexOf(
        "private fun handleBleSample(",
        wearHandler
      );

    const wearBody =
      source.slice(
        wearHandler,
        nextFunction
      );

    assert.equal(
      wearBody.includes(
        "preferredBle.stop()"
      ),
      true
    );

    assert.equal(
      wearBody.includes(
        "preferredBle.release()"
      ),
      false
    );
  }
);

test(
  "RC57.6H STOP libera provider y foreground service",
  () => {
    const source =
      runtime();

    const stopFunction =
      source.indexOf(
        "private fun stop("
      );

    const serializer =
      source.indexOf(
        "private fun IBERFITHeartRateSample.toWebSample",
        stopFunction
      );

    const body =
      source.slice(
        stopFunction,
        serializer
      );

    assert.equal(
      body.includes(
        "preferredBle.stop()"
      ),
      true
    );

    assert.equal(
      body.includes(
        "preferredBle.release()"
      ),
      true
    );
  }
);

test(
  "RC57.6H cierre de task no deja pulsometro persistente",
  () => {
    const serviceSource =
      service();

    const manifestSource =
      manifest();

    assert.equal(
      serviceSource.includes(
        "onTaskRemoved("
      ),
      true
    );

    assert.equal(
      serviceSource.includes(
        "preferredBle.stop()"
      ),
      true
    );

    assert.equal(
      manifestSource.includes(
        'android:stopWithTask="true"'
      ),
      true
    );
  }
);