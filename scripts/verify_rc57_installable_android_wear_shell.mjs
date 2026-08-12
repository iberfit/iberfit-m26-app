import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const pass = (name, ok) => {
  if (!ok) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

const rootBuild = read("native/android-host/build.gradle.kts");
const settings = read("native/android-host/settings.gradle.kts");
const phoneBuild = read("native/android-host/phone-app/build.gradle.kts");
const phoneManifest = read("native/android-host/phone-app/src/main/AndroidManifest.xml");
const phoneActivity = read("native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/PhoneMainActivity.kt");
const wearBuild = read("native/android-host/wear-app/build.gradle.kts");
const wearManifest = read("native/android-host/wear-app/src/main/AndroidManifest.xml");
const wearActivity = read("native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt");
const buildApps = read("native/android-host/build-apps.ps1");

pass("application-plugin", rootBuild.includes('id("com.android.application") version "9.3.1" apply false'));
pass("phone-module", settings.includes('include(":phone-app")'));
pass("wear-module", settings.includes('include(":wear-app")'));
pass("same-application-id",
  phoneBuild.includes('applicationId = "cl.iberfit.m26"') &&
  wearBuild.includes('applicationId = "cl.iberfit.m26"'));
pass("distinct-version-codes",
  phoneBuild.includes("versionCode = 265701") &&
  wearBuild.includes("versionCode = 265702"));
pass("phone-sdk", phoneBuild.includes("minSdk = 26") && phoneBuild.includes("targetSdk = 36"));
pass("wear-sdk", wearBuild.includes("minSdk = 30") && wearBuild.includes("targetSdk = 36"));
pass("phone-kotlin-source-routing",
  phoneBuild.includes("kotlin.directories.addAll") &&
  !phoneBuild.includes("java.srcDirs"));
pass("wear-kotlin-source-routing",
  wearBuild.includes("kotlin.directories.addAll") &&
  !wearBuild.includes("java.srcDirs"));
pass("phone-canonical-runtime",
  phoneBuild.includes('"../../android/runtime"') &&
  phoneBuild.includes('"../../android/ble"'));
pass("wear-canonical-runtime",
  wearBuild.includes('"../../android/runtime"') &&
  wearBuild.includes('"../../android/wear"'));
pass("wear-health-services",
  wearBuild.includes('androidx.health:health-services-client:1.1.0-rc02'));
pass("datalayer-dependency",
  phoneBuild.includes('play-services-wearable:20.0.1') &&
  wearBuild.includes('play-services-wearable:20.0.1'));
pass("wear-heart-rate-permission",
  wearManifest.includes("android.permission.health.READ_HEART_RATE"));
pass("wear-device-feature",
  wearManifest.includes('android.hardware.type.watch') &&
  wearManifest.includes('android:required="true"'));
pass("phone-datalayer-shell",
  phoneActivity.includes("IBERFITWearDataLayerRuntime") &&
  phoneActivity.includes('sendCommand("start")') &&
  phoneActivity.includes('sendCommand("stop")'));
pass("wear-datalayer-shell",
  wearActivity.includes("IBERFITWearDataLayerRuntime"));
pass("wear-health-bridge-shell",
  wearActivity.includes("IBERFITWearHealthServicesBridge"));
pass("apk-build-tasks",
  buildApps.includes('":phone-app:assembleDebug"') &&
  buildApps.includes('":wear-app:assembleDebug"'));
pass("signature-match-gate",
  buildApps.includes("PHONE_WEAR_SIGNATURE_MISMATCH") &&
  buildApps.includes("PHONE_WEAR_SIGNATURE_MATCH=TRUE"));

console.log("RC57_INSTALLABLE_SHELL_STATIC=PASS");