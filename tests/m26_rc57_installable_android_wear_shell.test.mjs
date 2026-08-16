import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

test("RC57 phone y Wear comparten applicationId para DataLayer", () => {
  const phone =
    read("native/android-host/phone-app/build.gradle.kts");
  const wear =
    read("native/android-host/wear-app/build.gradle.kts");

  assert.match(
    phone,
    /applicationId = "cl\.iberfit\.m26"/
  );

  assert.match(
    wear,
    /applicationId = "cl\.iberfit\.m26"/
  );
});

test("RC57 usa versionCode distinto por factor de forma", () => {
  const phone =
    read("native/android-host/phone-app/build.gradle.kts");
  const wear =
    read("native/android-host/wear-app/build.gradle.kts");

  const phoneVersion =
    Number(phone.match(/versionCode = (\d+)/)?.[1]);

  const wearVersion =
    Number(wear.match(/versionCode = (\d+)/)?.[1]);

  assert.equal(Number.isInteger(phoneVersion), true);
  assert.equal(Number.isInteger(wearVersion), true);
  assert.notEqual(phoneVersion, wearVersion);

  // Wear remains on the RC57 shell identity while Phone advances independently.
  assert.equal(wearVersion, 265702);
});

test("RC57 Wear conserva Health Services y permiso de FC", () => {
  const wear =
    read("native/android-host/wear-app/build.gradle.kts");

  const manifest =
    read(
      "native/android-host/wear-app/src/main/AndroidManifest.xml"
    );

  assert.match(
    wear,
    /health-services-client:1\.1\.0-rc02/
  );

  assert.match(
    manifest,
    /android\.permission\.health\.READ_HEART_RATE/
  );

  assert.match(
    manifest,
    /android\.hardware\.type\.watch/
  );
});

test("RC57 enruta fuentes Kotlin externas por AndroidSourceSet.kotlin", () => {
  const phone =
    read("native/android-host/phone-app/build.gradle.kts");

  const wear =
    read("native/android-host/wear-app/build.gradle.kts");

  assert.match(
    phone,
    /kotlin\.directories\.addAll/
  );

  assert.match(
    wear,
    /kotlin\.directories\.addAll/
  );

  assert.doesNotMatch(
    phone,
    /java\.srcDirs/
  );

  assert.doesNotMatch(
    wear,
    /java\.srcDirs/
  );
});

test("RC57 shells usan el runtime DataLayer canónico", () => {
  const phone =
    read(
      "native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/PhoneMainActivity.kt"
    );

  const workoutService =
    read(
      "native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/IBERFITWearWorkoutService.kt"
    );

  const commandService =
    read(
      "native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/IBERFITWearCommandListenerService.kt"
    );

  assert.match(
    phone,
    /IBERFITWearDataLayerRuntime/
  );

  assert.match(
    workoutService,
    /IBERFITWearDataLayerRuntime/
  );

  assert.match(
    commandService,
    /WearableListenerService/
  );
});

test("RC57 build exige firma coincidente entre APKs", () => {
  const build =
    read("native/android-host/build-apps.ps1");

  assert.match(
    build,
    /PHONE_WEAR_SIGNATURE_MISMATCH/
  );

  assert.match(
    build,
    /PHONE_WEAR_SIGNATURE_MATCH=TRUE/
  );
});