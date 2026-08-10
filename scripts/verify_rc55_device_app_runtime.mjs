import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const need=(p,re,label)=>{if(!re.test(read(p)))throw new Error(`${label}:${p}`);};

need('native/apple/IBERFITWatchRuntimeRelay.swift',/WCSession\.default/,'WATCH_SESSION');
need('native/apple/IBERFITWatchRuntimeRelay.swift',/isReachable/,'WATCH_REACHABLE');
need('native/apple/IBERFITWatchRuntimeRelay.swift',/sendMessage/,'WATCH_SEND');
need('native/apple/IBERFITPhoneWatchRuntimeRelay.swift',/didReceiveMessage/,'PHONE_RECEIVE');
need('native/apple/IBERFITIOSBleHeartRateRuntime.swift',/180D/,'IOS_BLE_SERVICE');
need('native/apple/IBERFITIOSBleHeartRateRuntime.swift',/2A37/,'IOS_BLE_CHAR');
need('native/apple/IBERFITIOSNativeTelemetryRuntime.swift',/handleReachability/,'IOS_FAILOVER');
need('native/apple/IBERFITWebTelemetryBridge.swift',/allowedHosts/,'IOS_ORIGIN_ALLOWLIST');

need('native/android/runtime/IBERFITWearDataLayerRuntime.kt',/MessageClient/,'WEAR_MESSAGE_CLIENT');
need('native/android/runtime/IBERFITWearDataLayerRuntime.kt',/\/iberfit\/live-heart-rate/,'WEAR_SAMPLE_PATH');
need('native/android/runtime/IBERFITAndroidWebRuntime.kt',/addWebMessageListener/,'ANDROID_WEB_MESSAGE');
need('native/android/runtime/IBERFITAndroidWebRuntime.kt',/allowedOrigins/,'ANDROID_ORIGIN_ALLOWLIST');
need('native/android/runtime/IBERFITBleHeartRateRuntime.kt',/BluetoothLeScanner|bluetoothLeScanner/,'ANDROID_BLE_SCAN');
need('native/android/runtime/IBERFITBleHeartRateRuntime.kt',/00002a37/,'ANDROID_BLE_CHAR');
need('native/android/runtime/IBERFITBleHeartRateRuntime.kt',/connectGatt\(appContext/,'ANDROID_GATT_CONTEXT');
need('native/android-host/iberfit-native/build.gradle.kts',/androidx\.webkit:webkit:1\.16\.0/,'WEBKIT_116');
need('native/android-host/iberfit-native/build.gradle.kts',/play-services-wearable:20\.0\.1/,'WEARABLE_2001');

const source=[
  read('native/apple/IBERFITWatchRuntimeRelay.swift'),
  read('native/apple/IBERFITPhoneWatchRuntimeRelay.swift'),
  read('native/apple/IBERFITIOSBleHeartRateRuntime.swift'),
  read('native/android/runtime/IBERFITWearDataLayerRuntime.kt'),
  read('native/android/runtime/IBERFITBleHeartRateRuntime.kt'),
].join('\n');
if(/DataClient|PutDataRequest|transferUserInfo/.test(source))throw new Error('PERSISTENT_LIVE_TRANSPORT_FORBIDDEN');
if(/targetRpe|targetRir|automaticProgression|loadInstruction/.test(source))throw new Error('AUTOMATIC_TRAINING_ADJUSTMENT_PRESENT');
console.log('RC55_DEVICE_TO_APP_RUNTIME_STATIC=PASS');
