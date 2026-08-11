import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = process.cwd();
const evidencePath = path.join(root, "recovery/RC56_HARDWARE_VALIDATION.json");
const markdownPath = path.join(root, "native/android/RC56_HARDWARE_VALIDATION.md");

const expectedBase = "9d93330d23a6029bc742676bd5e5463f1e8360a3";
const expectedHealthBlob = "eaa4c1d2945d19d505351352672e1a3b54cf6a4c";
const expectedDataLayerBlob = "5c5ac124bc65253cdc62e4c66649e20fbc3288fa";

const hashBlob = (repoPath) =>
  execFileSync(
    "git",
    ["hash-object", "--filters", `--path=${repoPath}`, "--", repoPath],
    {cwd: root, encoding: "utf8"}
  ).trim();

const failures = [];
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if(!ok) failures.push(name);
};

check("evidence-json-exists", fs.existsSync(evidencePath));
check("evidence-markdown-exists", fs.existsSync(markdownPath));

if(failures.length === 0){
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const md = fs.readFileSync(markdownPath, "utf8");

  check("release", evidence.release === "IBERFIT_M26_RC56");
  check("status-pass", evidence.status === "PASS");
  check("scope-android-wear-os", evidence.scope === "android_wear_os");
  check("base-commit", evidence.baseCommit === expectedBase);

  check("rc56-2-pass", evidence.rc56_2?.status === "PASS");
  check("rc56-2-real-sensor", evidence.rc56_2?.realSensor === true);
  check("rc56-2-provider", evidence.rc56_2?.provider === "wear_os_health_services");
  check("rc56-2-bpm", evidence.rc56_2?.heartRateBpm === 91);

  check("rc56-3-pass", evidence.rc56_3?.status === "PASS");
  check("rc56-3-execution-correlation", evidence.rc56_3?.executionCorrelation === true);
  check("rc56-3-start-command", evidence.rc56_3?.phoneToWearStartCommand === true);
  check("rc56-3-real-sensor", evidence.rc56_3?.realSensor === true);
  check("rc56-3-bpm", evidence.rc56_3?.heartRateBpm === 87);
  check("rc56-3-wear-to-phone", evidence.rc56_3?.wearToPhoneSample === true);
  check("rc56-3-phone-same-sample", evidence.rc56_3?.phoneReceivedSameSample === true);
  check("rc56-3-stop-command", evidence.rc56_3?.phoneToWearStopCommand === true);
  check("rc56-3-watch-terminal", evidence.rc56_3?.watchTerminal === "PASS");
  check("rc56-3-phone-terminal", evidence.rc56_3?.phoneTerminal === "PASS");

  check("hardware-tested", evidence.closure?.deviceHardwareTested === true);
  check("hardware-scope", evidence.closure?.deviceHardwareTestedScope === "ANDROID_WEAR_OS");
  check("apple-not-claimed", evidence.closure?.appleDeviceHardwareTested === false);
  check("xcode-not-claimed", evidence.closure?.appleXcodeBuildRun === false);
  check("ios-not-claimed", evidence.closure?.iosHardwareClaimed === false);

  check("production-untouched", evidence.safety?.productionTouched === false);
  check("supabase-untouched", evidence.safety?.supabaseTouched === false);
  check("canary-untouched", evidence.safety?.canaryRemoteTouched === false);
  check("probe-repo-untouched", evidence.safety?.probeRepositoryModified === false);

  check(
    "health-bridge-source-exact",
    hashBlob("native/android/wear/IBERFITWearHealthServicesBridge.kt") === expectedHealthBlob
  );
  check(
    "datalayer-runtime-source-exact",
    hashBlob("native/android/runtime/IBERFITWearDataLayerRuntime.kt") === expectedDataLayerBlob
  );

  check("markdown-device-scope", md.includes("ANDROID_WEAR_OS"));
  check("markdown-rc56-2", md.includes("RC56_2_WEAR_HEALTH_SERVICES=PASS"));
  check("markdown-rc56-3", md.includes("RC56_3_DATALAYER_END_TO_END=PASS"));
  check("markdown-apple-caveat", md.includes("APPLE_DEVICE_HARDWARE_TESTED=FALSE"));
}

if(failures.length){
  console.error(`RC56_HARDWARE_VALIDATION_FAILED=${failures.join(",")}`);
  process.exit(1);
}

console.log("RC56_HARDWARE_VALIDATION=PASS");
console.log("DEVICE_HARDWARE_TESTED=TRUE");
console.log("DEVICE_HARDWARE_TESTED_SCOPE=ANDROID_WEAR_OS");
console.log("APPLE_DEVICE_HARDWARE_TESTED=FALSE");
