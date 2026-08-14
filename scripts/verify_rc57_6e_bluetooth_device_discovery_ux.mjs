import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(path, "utf8");

const pass = (name, condition) => {
  if (!condition) {
    throw new Error(`FAIL ${name}`);
  }

  console.log(`PASS ${name}`);
};

const activity =
  read(
    "native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/PhoneMainActivity.kt"
  );

const discovery =
  read(
    "native/android/ble/IBERFITBleDeviceDiscoveryManager.kt"
  );

const store =
  read(
    "native/android/ble/IBERFITBlePreferredDeviceStore.kt"
  );

pass(
  "rc57-6e-friendly-device-entry",
  activity.includes('"Dispositivos"') &&
    activity.includes('"Añadir dispositivo"') &&
    activity.includes(
      '"Probar dispositivo preferido"'
    )
);

pass(
  "rc57-6e-runtime-permission-flow",
  activity.includes(
    "Manifest.permission.BLUETOOTH_SCAN"
  ) &&
    activity.includes(
      "Manifest.permission.BLUETOOTH_CONNECT"
    ) &&
    activity.includes(
      "Manifest.permission.ACCESS_FINE_LOCATION"
    ) &&
    activity.includes(
      "Build.VERSION_CODES.S"
    ) &&
    activity.includes(
      "requestPermissions("
    ) &&
    activity.includes(
      "onRequestPermissionsResult"
    )
);

pass(
  "rc57-6e-hrs-filtered-discovery",
  discovery.includes(
    "IBERFITBleHeartRateProtocol"
  ) &&
    discovery.includes(
      "HEART_RATE_SERVICE_UUID"
    ) &&
    discovery.includes(
      "ScanFilter.Builder()"
    ) &&
    discovery.includes(
      "SCAN_MODE_LOW_LATENCY"
    )
);

pass(
  "rc57-6e-bounded-user-initiated-scan",
  discovery.includes(
    "DEFAULT_SCAN_TIMEOUT_MS"
  ) &&
    discovery.includes(
      "12_000L"
    ) &&
    discovery.includes(
      "handler.postDelayed"
    ) &&
    activity.includes(
      "setOnClickListener"
    ) &&
    activity.includes(
      "beginDiscovery()"
    )
);

pass(
  "rc57-6e-friendly-discovery-metadata",
  discovery.includes(
    '"Pulsómetro Bluetooth"'
  ) &&
    discovery.includes(
      '"Señal excelente"'
    ) &&
    discovery.includes(
      '"Señal buena"'
    ) &&
    discovery.includes(
      '"Señal disponible"'
    )
);

pass(
  "rc57-6e-canonical-provider-test",
  activity.includes(
    "IBERFITAndroidBleHeartRateTransport("
  ) &&
    activity.includes(
      "IBERFITBleHeartRateProvider("
    ) &&
    activity.includes(
      "IBERFITHeartRateSessionContext("
    ) &&
    activity.includes(
      "onHeartRateSample"
    )
);

pass(
  "rc57-6e-preferred-device-persistence",
  store.includes(
    "IBERFITBlePreferredDeviceStore"
  ) &&
    store.includes(
      "preferred_connection_key"
    ) &&
    activity.includes(
      "preferredStore.save("
    ) &&
    activity.includes(
      "testPreferredDevice()"
    )
);

pass(
  "rc57-6e-no-mac-in-presentation",
  !activity.includes('"MAC') &&
    !activity.includes('"GATT') &&
    !activity.includes('"UUID') &&
    !activity.includes("text = preferred.address")
);

pass(
  "rc57-6e-no-brand-assumptions",
  !/(Samsung|Galaxy|Polar|Garmin|Wahoo|Coros|Fitbit|SM-R860|SM_J600G|SM-J600G)/i
    .test(
      [
        activity,
        discovery,
        store
      ].join("\n")
    )
);

pass(
  "rc57-6e-existing-wear-controls-preserved",
  activity.includes(
    '"Iniciar en reloj"'
  ) &&
    activity.includes(
      '"Pausar en reloj"'
    ) &&
    activity.includes(
      '"Reanudar en reloj"'
    ) &&
    activity.includes(
      '"Detener en reloj"'
    )
);

console.log(
  "RC57_6E_BLUETOOTH_DEVICE_DISCOVERY_UX_STATIC=PASS"
);