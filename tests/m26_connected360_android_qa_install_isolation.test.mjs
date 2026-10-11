import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const gradle=read('native/android-host/phone-app/build.gradle.kts');
const main=read('native/android-host/phone-app/src/main/AndroidManifest.xml');
const debug=read('native/android-host/phone-app/src/debug/AndroidManifest.xml');
const workflow=read('.github/workflows/connected360-android-native-qa.yml');

test('QA debug cannot replace or impersonate production Android application',()=>{
  assert.match(gradle,/applicationId = "cl\.iberfit\.m26"/u);
  assert.match(gradle,/getByName\("debug"\)\s*\{\s*applicationIdSuffix = "\.qa"/u);
  assert.match(main,/android:label="IBERFIT"/u);
  assert.match(debug,/android:label="IBERFIT Canary QA"/u);
  assert.doesNotMatch(debug,/android:name="[^"]*WRITE_/u);
  assert.match(debug,/IBERFITBluetoothPhysicalE2EActivity/u);
});
test('GitHub checks packaged APK identity, not only source or filename',()=>{
  assert.match(workflow,/Verify QA APK cannot replace the normal IBERFIT Android app/u);
  assert.match(workflow,/dump badging "\$QA"/u);
  assert.match(workflow,/dump badging "\$NORMAL"/u);
  assert.match(workflow,/package: name='cl\.iberfit\.m26\.qa'/u);
  assert.match(workflow,/package: name='cl\.iberfit\.m26'/u);
  assert.match(workflow,/application-label:'IBERFIT Canary QA'/u);
  assert.match(workflow,/application-label:'IBERFIT'/u);
  assert.match(workflow,/applicationId:"cl\.iberfit\.m26\.qa"/u);
  assert.match(workflow,/p\.applicationId!=="cl\.iberfit\.m26\.qa"/u);
  assert.match(workflow,/releaseCandidate:false,remoteHealthSync:false/u);
});
