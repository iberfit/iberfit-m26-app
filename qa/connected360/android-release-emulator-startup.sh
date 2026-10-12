#!/usr/bin/env bash
set -euo pipefail

# This script is invoked as a SINGLE command by android-emulator-runner;
# separate YAML script lines run in isolated /usr/bin/sh processes.
APK="native/android-host/phone-app/build/outputs/apk/release/phone-app-release.apk"
test -s "$APK"
echo "IBERFIT_ANDROID_RELEASE_INSTALL_BEGIN"
adb install -r "$APK"
echo "IBERFIT_ANDROID_RELEASE_LAUNCH_BEGIN"
adb shell am start -W -n cl.iberfit.m26/cl.iberfit.m26.phone.PhoneMainActivity
sleep 12
adb shell pidof cl.iberfit.m26 >/dev/null || {
  echo 'IBERFIT_ANDROID_RELEASE_PROCESS_NOT_RUNNING' >&2
  adb logcat -d -b crash -t 120 || true
  exit 1
}
adb shell dumpsys activity activities > "${RUNNER_TEMP:?}/iberfit-android-activity.txt"
if ! grep -F 'Connected360SecureWebViewActivity' "$RUNNER_TEMP/iberfit-android-activity.txt"; then
  echo 'IBERFIT_ANDROID_RELEASE_SECURE_WEBVIEW_NOT_ACTIVE' >&2
  adb shell dumpsys activity activities | tail -n 50 || true
  exit 1
fi
# A unrelated Google system package can crash during emulator boot; it is
# not evidence that our process crashed. Check app-specific process marker.
if adb logcat -d -b crash -t 2000 | grep -F 'Process: cl.iberfit.m26,'; then
  echo 'IBERFIT_ANDROID_RELEASE_STARTUP_CRASH' >&2
  exit 1
fi
echo 'IBERFIT_ANDROID_RELEASE_EMULATOR_STARTUP_OK'
