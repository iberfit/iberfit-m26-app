import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

test('repository tracked text is valid UTF-8 without mojibake signatures',()=>{
  const result=spawnSync(
    process.execPath,
    ['scripts/check_utf8_mojibake.mjs'],
    {encoding:'utf8'}
  );

  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`
  );

  assert.match(
    result.stdout,
    /IBERFIT_ENCODING_INTEGRITY=PASS/
  );
});

test('user-visible native strings are no longer mojibake',()=>{
  const files=[
    'native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/PhoneMainActivity.kt',
    'native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/IBERFITBluetoothHeartRateForegroundService.kt',
    'native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt',
    'native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/IBERFITWearWorkoutService.kt',
    'native/android/ble/IBERFITBleDeviceDiscoveryManager.kt',
  ];

  for(const file of files){
    const text=fs.readFileSync(file,'utf8');

    assert.doesNotMatch(
      text,
      /(?:\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00e2\u20ac|\ufffd)/u,
      file
    );
  }
});