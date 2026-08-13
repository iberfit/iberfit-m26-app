import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(path, "utf8");

const activity = () =>
  read(
    "native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/PhoneMainActivity.kt"
  );

const discovery = () =>
  read(
    "native/android/ble/IBERFITBleDeviceDiscoveryManager.kt"
  );

const store = () =>
  read(
    "native/android/ble/IBERFITBlePreferredDeviceStore.kt"
  );

test(
  "RC57.6E descubre solo dispositivos que anuncian Heart Rate Service",
  () => {
    const source =
      discovery();

    assert.equal(
      source.includes(
        "HEART_RATE_SERVICE_UUID"
      ),
      true
    );

    assert.equal(
      source.includes(
        "ScanFilter.Builder()"
      ),
      true
    );
  }
);

test(
  "RC57.6E corta el escaneo automaticamente",
  () => {
    const source =
      discovery();

    assert.equal(
      source.includes(
        "12_000L"
      ),
      true
    );

    assert.equal(
      source.includes(
        "handler.postDelayed"
      ),
      true
    );

    assert.equal(
      source.includes(
        "stopScan("
      ),
      true
    );
  }
);

test(
  "RC57.6E no muestra MAC, GATT ni UUID al cliente",
  () => {
    const source =
      activity();

    assert.equal(
      source.includes('"MAC'),
      false
    );

    assert.equal(
      source.includes('"GATT'),
      false
    );

    assert.equal(
      source.includes('"UUID'),
      false
    );

    assert.equal(
      source.includes(
        "text = preferred.address"
      ),
      false
    );
  }
);

test(
  "RC57.6E solicita permisos por version de Android",
  () => {
    const source =
      activity();

    assert.equal(
      source.includes(
        "Manifest.permission.BLUETOOTH_SCAN"
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
        "Manifest.permission.ACCESS_FINE_LOCATION"
      ),
      true
    );

    assert.equal(
      source.includes(
        "Build.VERSION_CODES.S"
      ),
      true
    );
  }
);

test(
  "RC57.6E prueba el dispositivo con el provider canonico",
  () => {
    const source =
      activity();

    assert.equal(
      source.includes(
        "IBERFITAndroidBleHeartRateTransport("
      ),
      true
    );

    assert.equal(
      source.includes(
        "IBERFITBleHeartRateProvider("
      ),
      true
    );

    assert.equal(
      source.includes(
        "IBERFITHeartRateSessionContext("
      ),
      true
    );
  }
);

test(
  "RC57.6E guarda preferido solo tras recibir una muestra",
  () => {
    const source =
      activity();

    const sampleIndex =
      source.indexOf(
        "override fun onHeartRateSample"
      );

    const saveIndex =
      source.indexOf(
        "preferredStore.save("
      );

    assert.ok(
      sampleIndex >= 0
    );

    assert.ok(
      saveIndex > sampleIndex
    );
  }
);

test(
  "RC57.6E mantiene la clave de conexion fuera del presentation code",
  () => {
    const activitySource =
      activity();

    const storeSource =
      store();

    assert.equal(
      activitySource.includes(
        "preferred.address"
      ),
      true
    );

    assert.equal(
      activitySource.includes(
        "device.bluetoothDevice.address"
      ),
      false
    );

    assert.equal(
      storeSource.includes(
        "internal val address: String"
      ),
      true
    );

    assert.equal(
      storeSource.includes(
        "preferred_connection_key"
      ),
      true
    );
  }
);

test(
  "RC57.6E conserva los controles Wear ya validados",
  () => {
    const source =
      activity();

    for (
      const label of [
        "Iniciar en reloj",
        "Pausar en reloj",
        "Reanudar en reloj",
        "Detener en reloj"
      ]
    ) {
      assert.equal(
        source.includes(label),
        true
      );
    }
  }
);