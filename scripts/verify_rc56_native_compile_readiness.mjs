import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');
const need=(p,re,label)=>{
  const text=read(p);
  if(!re.test(text))throw new Error(`${label}:${p}`);
};

need('native/android-host/toolchain.ps1',/Android Studio\\jbr\\bin\\java\.exe/,'ANDROID_STUDIO_JBR_DISCOVERY');
need('native/android-host/toolchain.ps1',/LOCALAPPDATA.*Android\\Sdk/s,'DEFAULT_SDK_DISCOVERY');
need('native/android-host/toolchain.ps1',/platforms\\android-36\\android\.jar/,'ANDROID_PLATFORM_36');
need('native/android-host/toolchain.ps1',/build-tools\\36\.0\.0\\aapt2\.exe/,'BUILD_TOOLS_36');
need('native/android-host/toolchain.ps1',/platform-tools\\adb\.exe/,'ADB_DISCOVERY');
need('native/android-host/toolchain.ps1',/sdkmanager\.bat/,'SDKMANAGER_DISCOVERY');

need('native/android-host/doctor.ps1',/adbPath devices -l|AdbPath devices -l/,'ADB_DEVICES');
need('native/android-host/doctor.ps1',/ro\.build\.characteristics/,'WEAR_CHARACTERISTICS');
need('native/android-host/doctor.ps1',/MACOS_XCODE_REQUIRED/,'APPLE_MAC_REQUIREMENT');

need('native/android-host/build.ps1',/Gradle\s*=\s*"9\.5\.0"|Version="9\.5\.0"/,'GRADLE_950');
need('native/android-host/build.ps1',/gradle-.*bin\.zip\.sha256/,'GRADLE_CHECKSUM_SOURCE');
need('native/android-host/build.ps1',/Get-FileHash -Algorithm SHA256/,'GRADLE_CHECKSUM_VERIFY');
need('native/android-host/build.ps1',/:iberfit-native:compileDebugKotlin/,'REAL_KOTLIN_COMPILE');
need('native/android-host/build.ps1',/ANDROID_COMPILE_RUN=TRUE/,'COMPILE_MARKER');

need('native/apple/BUILD_READINESS.md',/macOS with Xcode/i,'APPLE_XCODE_BOUNDARY');
need('native/apple/BUILD_READINESS.md',/Hardware testing remains a separate release gate/i,'HARDWARE_SEPARATE_GATE');

const operational=[
  read('native/android-host/toolchain.ps1'),
  read('native/android-host/doctor.ps1'),
  read('native/android-host/build.ps1'),
].join('\n');

if(/sdkmanager(?:\.bat)?\s+["']?--?install|winget\s+install|choco\s+install|scoop\s+install/i.test(operational)){
  throw new Error('AUTO_INSTALL_FORBIDDEN');
}
if(/supabase|pjhmrhejsoofmouedavw|tvqnvvwaddcuehqmzvty/i.test(operational)){
  throw new Error('REMOTE_BACKEND_REFERENCE_FORBIDDEN');
}

console.log('RC56_NATIVE_COMPILE_READINESS_STATIC=PASS');
