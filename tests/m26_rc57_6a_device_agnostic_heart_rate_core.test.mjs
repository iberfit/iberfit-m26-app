import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const models = () =>
  read("native/android/heart-rate/IBERFITHeartRateModels.kt");
const provider = () =>
  read("native/android/heart-rate/IBERFITHeartRateProvider.kt");
const selector = () =>
  read("native/android/heart-rate/IBERFITHeartRateProviderSelector.kt");
const manager = () =>
  read("native/android/heart-rate/IBERFITHeartRateSessionManager.kt");

test("RC57.6A enruta el core comÃºn a Phone y Wear", () => {
  const phone = read("native/android-host/phone-app/build.gradle.kts");
  const wear = read("native/android-host/wear-app/build.gradle.kts");

  assert.match(phone, /"\.\.\/\.\.\/android\/heart-rate"/);
  assert.match(wear, /"\.\.\/\.\.\/android\/heart-rate"/);
});

test("RC57.6A define una muestra canÃ³nica independiente del origen", () => {
  const source = models();

  assert.match(source, /data class IBERFITHeartRateSample/);
  assert.match(source, /val bpm: Double/);
  assert.match(source, /val recordedAtEpochMs: Long\?/);
  assert.match(source, /val receivedAtEpochMs: Long/);
  assert.match(source, /val providerId: String/);
  assert.match(source, /val deviceId: String\?/);
  assert.match(source, /val rrIntervalsMs: List<Double>/);
  assert.match(source, /val executionId: String\?/);
  assert.match(source, /val sessionId: String\?/);
  assert.match(source, /val latencyMs: Long\?/);
});

test("RC57.6A modela calidad y contacto sin depender del fabricante", () => {
  const source = models();

  for (const token of [
    "VALID",
    "ACQUIRING",
    "POOR_CONTACT",
    "STALE",
    "OUT_OF_RANGE",
    "DISCONNECTED",
    "UNSUPPORTED",
    "DETECTED",
    "NOT_DETECTED",
    "UNKNOWN",
  ]) {
    assert.match(source, new RegExp(`\\b${token}\\b`));
  }
});

test("RC57.6A expone provider intercambiable y listener comÃºn", () => {
  const source = provider();

  assert.match(source, /interface IBERFITHeartRateProvider/);
  assert.match(source, /interface IBERFITHeartRateProviderListener/);
  assert.match(source, /fun snapshot\(\)/);
  assert.match(source, /fun start\(context: IBERFITHeartRateSessionContext\)/);
  assert.match(source, /fun pause\(\)/);
  assert.match(source, /fun resume\(\)/);
  assert.match(source, /fun stop\(\)/);
});

test("RC57.6A selecciona por capacidades, preferencia y prioridad", () => {
  const source = selector();

  assert.match(source, /supportsLiveHeartRate/);
  assert.match(source, /preferredProviderId/);
  assert.match(source, /it\.connected/);
  assert.match(source, /it\.descriptor\.priority/);
  assert.match(source, /excludedProviderIds/);
});

test("RC57.6A mantiene un Ãºnico provider primario y failover", () => {
  const source = manager();

  assert.match(source, /primaryProviderId/);
  assert.match(source, /failOverFrom/);
  assert.match(source, /SOURCE_UNAVAILABLE/);
  assert.match(source, /SOURCE_DISCONNECTED/);
  assert.match(source, /sample\.providerId != primaryProviderId/);
});

test("RC57.6A conserva bpm original y marca outliers por calidad", () => {
  const source = `${models()}\n${manager()}`;

  assert.match(source, /MIN_PLAUSIBLE_BPM = 25\.0/);
  assert.match(source, /MAX_PLAUSIBLE_BPM = 240\.0/);
  assert.match(source, /IBERFITHeartRateQuality\.OUT_OF_RANGE/);
  assert.doesNotMatch(manager(), /bpm\s*=/);
});

test("RC57.6A core no depende de Android, marcas ni hardware QA", () => {
  const source =
    `${models()}\n${provider()}\n${selector()}\n${manager()}`;

  assert.doesNotMatch(source, /import\s+android\./);
  assert.doesNotMatch(source, /androidx\./);
  assert.doesNotMatch(
    source,
    /Samsung|Galaxy|SM-R860|SM_J600G|SM-J600G|RFATA0LSLFR|5200bf3d8d5b45a3/i
  );
});

test("RC57.6A descriptor permite providers futuros sin cambiar enum central", () => {
  const source = models();

  assert.match(source, /val providerId: String/);
  assert.match(source, /val transportFamily: String/);
  assert.doesNotMatch(source, /enum class IBERFITHeartRateProviderKind/);
});