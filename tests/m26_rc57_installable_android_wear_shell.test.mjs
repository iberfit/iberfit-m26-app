import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

test("RC57 phone y Wear comparten applicationId para DataLayer", () => {
  const phone = read("native/android-host/phone-app/build.gradle.kts");
  const wear = read("native/android-host/wear-app/build.gradle.kts");
  assert.match(phone, /applicationId = "cl\.iberfit\.m26"/);
  assert.match(wear, /applicationId = "cl\.iberfit\.m26"/);
});

test("RC57 usa versionCode distinto por factor de forma", () => {
  const phone = read("native/android-host/phone-app/build.gradle.kts");
  const wear = read("native/android-host/wear-app/build.gradle.kts");
  assert.match(phone, /versionCode = 265701/);
  assert.match(wear, /versionCode = 265702/);
});

test("RC57 Wear conserva Health Services y permiso de FC", () => {
  const wear = read("native/android-host/wear-app/build.gradle.kts");
  const manifest = read("native/android-host/wear-app/src/main/AndroidManifest.xml");
  assert.match(wear, /health-services-client:1\.1\.0-rc02/);
  assert.match(manifest, /android\.permission\.health\.READ_HEART_RATE/);
  assert.match(manifest, /android\.hardware\.type\.watch/);
});

test("RC57 enruta fuentes Kotlin externas por AndroidSourceSet.kotlin", () => {
  const phone = read("native/android-host/phone-app/build.gradle.kts");
  const wear = read("native/android-host/wear-app/build.gradle.kts");
  assert.match(phone, /kotlin\.directories\.addAll/);
  assert.match(wear, /kotlin\.directories\.addAll/);
  assert.doesNotMatch(phone, /java\.srcDirs/);
  assert.doesNotMatch(wear, /java\.srcDirs/);
});

test("RC57 shells usan el runtime DataLayer canÃ³nico", () => {
  const phone = read("native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/PhoneMainActivity.kt");
  const wear = read("native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt");
  assert.match(phone, /IBERFITWearDataLayerRuntime/);
  assert.match(wear, /IBERFITWearDataLayerRuntime/);
});

test("RC57 build exige firma coincidente entre APKs", () => {
  const build = read("native/android-host/build-apps.ps1");
  assert.match(build, /PHONE_WEAR_SIGNATURE_MISMATCH/);
  assert.match(build, /PHONE_WEAR_SIGNATURE_MATCH=TRUE/);
});