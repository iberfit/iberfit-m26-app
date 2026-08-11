import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";

const root = process.cwd();
const evidence = JSON.parse(
  fs.readFileSync("recovery/RC56_HARDWARE_VALIDATION.json", "utf8")
);

const gitBlob = (repoPath) =>
  execFileSync(
    "git",
    ["hash-object", "--filters", `--path=${repoPath}`, "--", repoPath],
    {cwd: root, encoding: "utf8"}
  ).trim();

test("RC56.2 conserva evidencia de Health Services y sensor real", () => {
  assert.equal(evidence.release, "IBERFIT_M26_RC56");
  assert.equal(evidence.baseCommit, "9d93330d23a6029bc742676bd5e5463f1e8360a3");
  assert.equal(evidence.rc56_2.status, "PASS");
  assert.equal(evidence.rc56_2.provider, "wear_os_health_services");
  assert.equal(evidence.rc56_2.realSensor, true);
  assert.equal(evidence.rc56_2.heartRateBpm, 91);
  assert.equal(evidence.rc56_2.terminal, "PASS");
});

test("RC56.3 conserva el ciclo DataLayer bidireccional correlacionado", () => {
  assert.equal(evidence.rc56_3.status, "PASS");
  assert.equal(evidence.rc56_3.executionId, "rc563-1786490011551");
  assert.equal(evidence.rc56_3.watchConnectedNodeCount, 1);
  assert.equal(evidence.rc56_3.phoneConnectedNodeCount, 1);
  assert.equal(evidence.rc56_3.phoneToWearStartCommand, true);
  assert.equal(evidence.rc56_3.realSensor, true);
  assert.equal(evidence.rc56_3.heartRateBpm, 87);
  assert.equal(evidence.rc56_3.wearToPhoneSample, true);
  assert.equal(evidence.rc56_3.phoneReceivedSameSample, true);
  assert.equal(evidence.rc56_3.phoneToWearStopCommand, true);
  assert.equal(evidence.rc56_3.executionCorrelation, true);
  assert.equal(evidence.rc56_3.watchTerminal, "PASS");
  assert.equal(evidence.rc56_3.phoneTerminal, "PASS");
});

test("la afirmaciÃ³n DEVICE_HARDWARE_TESTED queda limitada a Android Wear OS", () => {
  assert.equal(evidence.closure.deviceHardwareTested, true);
  assert.equal(evidence.closure.deviceHardwareTestedScope, "ANDROID_WEAR_OS");
  assert.equal(evidence.closure.androidWearOsHardwareTested, true);
  assert.equal(evidence.closure.appleXcodeBuildRun, false);
  assert.equal(evidence.closure.appleDeviceHardwareTested, false);
  assert.equal(evidence.closure.iosHardwareClaimed, false);
});

test("la evidencia pertenece a los bridges exactos realmente probados", () => {
  assert.equal(
    gitBlob("native/android/wear/IBERFITWearHealthServicesBridge.kt"),
    "eaa4c1d2945d19d505351352672e1a3b54cf6a4c"
  );
  assert.equal(
    gitBlob("native/android/runtime/IBERFITWearDataLayerRuntime.kt"),
    "5c5ac124bc65253cdc62e4c66649e20fbc3288fa"
  );
});

test("las pruebas fÃ­sicas no tocaron producciÃ³n ni backends remotos", () => {
  assert.equal(evidence.safety.productionTouched, false);
  assert.equal(evidence.safety.supabaseTouched, false);
  assert.equal(evidence.safety.canaryRemoteTouched, false);
  assert.equal(evidence.safety.probeRepositoryModified, false);
});
