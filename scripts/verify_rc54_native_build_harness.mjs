import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const need=(p,re,label)=>{const text=read(p);if(!re.test(text))throw new Error(`${label}:${p}`);};

need('native/android-host/build.gradle.kts',/com\.android\.library"\) version "9\.3\.1"/,'AGP_931');
need('native/android-host/gradle.properties',/android\.useAndroidX=true/,'ANDROIDX');
need('native/android-host/iberfit-native/build.gradle.kts',/compileSdk = 36/,'COMPILE_SDK');
need('native/android-host/iberfit-native/build.gradle.kts',/health-services-client:1\.1\.0-rc02/,'HEALTH_SERVICES');
need('native/android-host/iberfit-native/build.gradle.kts',/\.\.\/\.\.\/android\/wear/,'CANONICAL_WEAR_SOURCE');
need('native/android-host/iberfit-native/build.gradle.kts',/\.\.\/\.\.\/android\/ble/,'CANONICAL_BLE_SOURCE');
need('native/android-host/iberfit-native/src/main/AndroidManifest.xml',/READ_HEART_RATE/,'READ_HEART_RATE');
need('native/android-host/iberfit-native/src/main/AndroidManifest.xml',/BLUETOOTH_SCAN/,'BLE_SCAN');
need('native/android-host/build.ps1',/Gradle 9\.5\.0|Version="9\.5\.0"/,'GRADLE_950');
need('native/android-host/build.ps1',/JDK17_REQUIRED/,'JDK17');

need('native/apple/Package.swift',/IBERFITWatchTelemetry/,'APPLE_WATCH_TARGET');
need('native/apple/Package.swift',/IBERFITWebBridge/,'APPLE_WEB_TARGET');
need('native/apple/Package.swift',/\.watchOS\(\.v10\)/,'WATCHOS_PLATFORM');
need('native/apple/Package.swift',/\.iOS\(\.v17\)/,'IOS_PLATFORM');
need('native/apple/IBERFITWatchHealthKitTelemetry.swift',/#if canImport\(HealthKit\) && os\(watchOS\)/,'WATCH_GUARD');
need('native/apple/IBERFITWebTelemetryBridge.swift',/#if canImport\(WebKit\) && os\(iOS\)/,'IOS_GUARD');

const all=[
  read('native/android-host/iberfit-native/build.gradle.kts'),
  read('native/apple/Package.swift'),
  read('native/android-host/build.ps1'),
].join('\n');
if(/targetRpe|targetRir|automaticProgression|loadInstruction/.test(all))throw new Error('AUTOMATIC_TRAINING_ADJUSTMENT_PRESENT');

console.log('RC54_NATIVE_BUILD_HARNESS_STATIC=PASS');
