import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const pass = (name, condition) => {
  if (!condition) {
    throw new Error(`FAIL ${name}`);
  }
  console.log(`PASS ${name}`);
};

const parser =
  read("native/android/ble/IBERFITBleHeartRateParser.kt");
const protocol =
  read("native/android/ble/IBERFITBleHeartRateProtocol.kt");
const transport =
  read("native/android/ble/IBERFITBleHeartRateTransport.kt");
const androidTransport =
  read("native/android/ble/IBERFITAndroidBleHeartRateTransport.kt");
const provider =
  read("native/android/ble/IBERFITBleHeartRateProvider.kt");
const manifest =
  read("native/android-host/phone-app/src/main/AndroidManifest.xml");

pass(
  "rc57-6d-standard-hrs-uuids",
  protocol.includes(
    "0000180d-0000-1000-8000-00805f9b34fb"
  ) &&
    protocol.includes(
      "00002a37-0000-1000-8000-00805f9b34fb"
    ) &&
    protocol.includes(
      "00002902-0000-1000-8000-00805f9b34fb"
    )
);

pass(
  "rc57-6d-parser-preserves-protocol-truth",
  parser.includes("HEART_RATE_FORMAT_UINT16") &&
    parser.includes("SENSOR_CONTACT_DETECTED") &&
    parser.includes("SENSOR_CONTACT_SUPPORTED") &&
    parser.includes("ENERGY_EXPENDED_PRESENT") &&
    parser.includes("RR_INTERVAL_PRESENT") &&
    parser.includes("raw * 1000.0 / 1024.0") &&
    !parser.includes("if (bpm !in 25..240) return null") &&
    !parser.includes("250.0..2500.0") &&
    !parser.includes("rr.size <")
);

pass(
  "rc57-6d-legacy-runtime-compatibility",
  parser.includes("val provider: String") &&
    parser.includes('get() = "bluetooth_hrs"') &&
    parser.includes("val quality: String") &&
    parser.includes('"out_of_range"') &&
    parser.includes('"poor_contact"') &&
    parser.includes('"valid"')
);

pass(
  "rc57-6d-transport-boundary",
  transport.includes(
    "interface IBERFITBleHeartRateTransport"
  ) &&
    transport.includes(
      "interface IBERFITBleHeartRateTransportListener"
    ) &&
    transport.includes(
      "val deviceId: String?"
    ) &&
    transport.includes(
      "does not expose a Bluetooth MAC address"
    )
);

pass(
  "rc57-6d-android-gatt-hrs-subscription",
  androidTransport.includes("BluetoothGattCallback") &&
    androidTransport.includes("discoverServices()") &&
    androidTransport.includes(
      "HEART_RATE_SERVICE_UUID"
    ) &&
    androidTransport.includes(
      "HEART_RATE_MEASUREMENT_UUID"
    ) &&
    androidTransport.includes(
      "setCharacteristicNotification"
    ) &&
    androidTransport.includes(
      "CLIENT_CHARACTERISTIC_CONFIGURATION_UUID"
    ) &&
    androidTransport.includes(
      "ENABLE_NOTIFICATION_VALUE"
    ) &&
    androidTransport.includes(
      "Build.VERSION.SDK_INT >= 33"
    ) &&
    androidTransport.includes(
      "BluetoothStatusCodes.SUCCESS"
    )
);

pass(
  "rc57-6d-provider-canonical-contract",
  provider.includes(
    "IBERFITHeartRateProvider"
  ) &&
    provider.includes(
      'providerId = PROVIDER_ID'
    ) &&
    provider.includes(
      'transportFamily = "ble"'
    ) &&
    provider.includes(
      '"bluetooth_hrs"'
    ) &&
    provider.includes(
      "IBERFITHeartRateSample("
    ) &&
    provider.includes(
      "executionId = context.executionId"
    ) &&
    provider.includes(
      "sessionId = context.sessionId"
    )
);

pass(
  "rc57-6d-contact-rr-and-outlier-truth",
  provider.includes(
    "IBERFITHeartRateContactStatus.DETECTED"
  ) &&
    provider.includes(
      "IBERFITHeartRateContactStatus.NOT_DETECTED"
    ) &&
    provider.includes(
      "IBERFITHeartRateContactStatus.UNSUPPORTED"
    ) &&
    provider.includes(
      "IBERFITHeartRateQuality.POOR_CONTACT"
    ) &&
    provider.includes(
      "IBERFITHeartRateQuality.OUT_OF_RANGE"
    ) &&
    provider.includes(
      "rrIntervalsMs = parsed.rrIntervalsMs"
    )
);

pass(
  "rc57-6d-local-pause-resume-gate",
  provider.includes("emissionPaused = true") &&
    provider.includes("emissionPaused = false") &&
    provider.includes("if (emissionPaused) return") &&
    provider.includes(
      "IBERFITHeartRateProviderState.PAUSED"
    )
);

pass(
  "rc57-6d-android-bluetooth-permissions",
  manifest.includes(
    "android.permission.BLUETOOTH_SCAN"
  ) &&
    manifest.includes(
      "android.permission.BLUETOOTH_CONNECT"
    ) &&
    manifest.includes(
      "android.permission.BLUETOOTH_ADMIN"
    ) &&
    manifest.includes(
      'android:maxSdkVersion="30"'
    ) &&
    manifest.includes(
      'android:usesPermissionFlags="neverForLocation"'
    ) &&
    manifest.includes(
      'android.hardware.bluetooth_le'
    ) &&
    manifest.includes(
      'android:required="false"'
    )
);

pass(
  "rc57-6d-no-brand-or-model-assumptions",
  !/(Samsung|Galaxy|SM-R860|SM_J600G|SM-J600G|RFATA0LSLFR|5200bf3d8d5b45a3)/i
    .test(
      [
        parser,
        protocol,
        transport,
        androidTransport,
        provider,
        manifest
      ].join("\n")
    )
);

console.log(
  "RC57_6D_BLUETOOTH_HRS_PROVIDER_FOUNDATION_STATIC=PASS"
);