import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('RC56 verifier de readiness pasa',()=>{
  const out=execFileSync(process.execPath,['scripts/verify_rc56_native_compile_readiness.mjs'],{encoding:'utf8'});
  assert.match(out,/RC56_NATIVE_COMPILE_READINESS_STATIC=PASS/);
});

test('RC56 descubre toolchain sin instalar dependencias',()=>{
  const toolchain=readFileSync(new URL('../native/android-host/toolchain.ps1',import.meta.url),'utf8');
  const doctor=readFileSync(new URL('../native/android-host/doctor.ps1',import.meta.url),'utf8');
  assert.match(toolchain,/Android Studio\\jbr\\bin\\java\.exe/);
  assert.match(toolchain,/Android\\Sdk/);
  assert.match(doctor,/devices -l/);
  assert.match(doctor,/ro\.build\.characteristics/);
  assert.doesNotMatch(toolchain+doctor,/winget\s+install|choco\s+install|sdkmanager(?:\.bat)?\s+["']?--?install/i);
});

test('RC56 build real usa JDK17 SDK36 Gradle95 y checksum',()=>{
  const build=readFileSync(new URL('../native/android-host/build.ps1',import.meta.url),'utf8');
  assert.match(build,/JDK17_REQUIRED/);
  assert.match(build,/ANDROID_PLATFORM_36_NOT_FOUND/);
  assert.match(build,/BUILD_TOOLS_36_0_0_NOT_FOUND/);
  assert.match(build,/Version="9\.5\.0"/);
  assert.match(build,/Get-FileHash -Algorithm SHA256/);
  assert.match(build,/:iberfit-native:compileDebugKotlin/);
});

test('RC56 mantiene compilación y hardware como gates distintos',()=>{
  const apple=readFileSync(new URL('../native/apple/BUILD_READINESS.md',import.meta.url),'utf8');
  assert.match(apple,/macOS with Xcode/i);
  assert.match(apple,/Hardware testing remains a separate release gate/i);
});
