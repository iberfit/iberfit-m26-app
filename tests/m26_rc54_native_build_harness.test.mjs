import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

test('RC54 build harness estático pasa',()=>{
  const out=execFileSync(process.execPath,['scripts/verify_rc54_native_build_harness.mjs'],{encoding:'utf8'});
  assert.match(out,/RC54_NATIVE_BUILD_HARNESS_STATIC=PASS/);
});

test('RC54 Android fija toolchain actual y usa fuentes canónicas',()=>{
  const build=readFileSync(new URL('../native/android-host/iberfit-native/build.gradle.kts',import.meta.url),'utf8');
  const root=readFileSync(new URL('../native/android-host/build.gradle.kts',import.meta.url),'utf8');
  assert.match(root,/9\.3\.1/);
  assert.match(build,/compileSdk = 36/);
  assert.match(build,/health-services-client:1\.1\.0-rc02/);
  assert.match(build,/\.\.\/\.\.\/android\/wear/);
  assert.match(build,/\.\.\/\.\.\/android\/ble/);
});

test('RC54 Apple separa Watch HealthKit de iOS WebKit',()=>{
  const pkg=readFileSync(new URL('../native/apple/Package.swift',import.meta.url),'utf8');
  const watch=readFileSync(new URL('../native/apple/IBERFITWatchHealthKitTelemetry.swift',import.meta.url),'utf8');
  const web=readFileSync(new URL('../native/apple/IBERFITWebTelemetryBridge.swift',import.meta.url),'utf8');
  assert.match(pkg,/IBERFITWatchTelemetry/);
  assert.match(pkg,/IBERFITWebBridge/);
  assert.match(watch,/#if canImport\(HealthKit\) && os\(watchOS\)/);
  assert.match(web,/#if canImport\(WebKit\) && os\(iOS\)/);
});

test('RC54 no declara compilación nativa ni pruebas de hardware como realizadas',()=>{
  const readme=readFileSync(new URL('../native/apple/README.md',import.meta.url),'utf8');
  assert.match(readme,/does not claim an Xcode build/i);
});
