import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const pass = (name, ok) => {
  if (!ok) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

const phoneBuild = read("native/android-host/phone-app/build.gradle.kts");
const wearBuild = read("native/android-host/wear-app/build.gradle.kts");

const models = read("native/android/heart-rate/IBERFITHeartRateModels.kt");
const provider = read("native/android/heart-rate/IBERFITHeartRateProvider.kt");
const selector = read("native/android/heart-rate/IBERFITHeartRateProviderSelector.kt");
const manager = read("native/android/heart-rate/IBERFITHeartRateSessionManager.kt");
const core = [models, provider, selector, manager].join("\n");

pass(
  "rc57-6a-shared-source-routing",
  phoneBuild.includes('"../../android/heart-rate"') &&
    wearBuild.includes('"../../android/heart-rate"')
);

pass(
  "rc57-6a-provider-interface",
  provider.includes("interface IBERFITHeartRateProvider") &&
    provider.includes("fun snapshot()") &&
    provider.includes("fun start(context: IBERFITHeartRateSessionContext)") &&
    provider.includes("fun pause()") &&
    provider.includes("fun resume()") &&
    provider.includes("fun stop()")
);

pass(
  "rc57-6a-canonical-sample",
  models.includes("data class IBERFITHeartRateSample") &&
    models.includes("val bpm: Double") &&
    models.includes("val recordedAtEpochMs: Long?") &&
    models.includes("val receivedAtEpochMs: Long") &&
    models.includes("val providerId: String") &&
    models.includes("val deviceId: String?") &&
    models.includes("val deviceType: IBERFITHeartRateDeviceType") &&
    models.includes("val quality: IBERFITHeartRateQuality") &&
    models.includes("val contactStatus: IBERFITHeartRateContactStatus") &&
    models.includes("val rrIntervalsMs: List<Double>") &&
    models.includes("val executionId: String?") &&
    models.includes("val sessionId: String?") &&
    models.includes("val latencyMs: Long?")
);

pass(
  "rc57-6a-quality-model",
  models.includes("VALID") &&
    models.includes("ACQUIRING") &&
    models.includes("POOR_CONTACT") &&
    models.includes("STALE") &&
    models.includes("OUT_OF_RANGE") &&
    models.includes("DISCONNECTED") &&
    models.includes("UNSUPPORTED")
);

pass(
  "rc57-6a-capability-model",
  models.includes("data class IBERFITHeartRateProviderCapabilities") &&
    models.includes("supportsLiveHeartRate") &&
    models.includes("supportsContactStatus") &&
    models.includes("supportsRrIntervals") &&
    models.includes("supportsPauseResume") &&
    models.includes("supportsBackgroundStreaming")
);

pass(
  "rc57-6a-extensible-provider-descriptor",
  models.includes("val providerId: String") &&
    models.includes("val transportFamily: String") &&
    !models.includes("enum class IBERFITHeartRateProviderKind")
);

pass(
  "rc57-6a-capability-selection",
  selector.includes("supportsLiveHeartRate") &&
    selector.includes("preferredProviderId") &&
    selector.includes("it.connected") &&
    selector.includes("it.descriptor.priority") &&
    selector.includes("excludedProviderIds")
);

pass(
  "rc57-6a-provider-arbitration",
  manager.includes("primaryProviderId") &&
    manager.includes("failOverFrom") &&
    manager.includes("SOURCE_UNAVAILABLE") &&
    manager.includes("SOURCE_DISCONNECTED") &&
    manager.includes("sample.providerId != primaryProviderId")
);

pass(
  "rc57-6a-session-correlation",
  manager.includes("executionId = sample.executionId ?: context.executionId") &&
    manager.includes("sessionId = sample.sessionId ?: context.sessionId")
);

pass(
  "rc57-6a-plausibility-without-data-rewrite",
  models.includes("MIN_PLAUSIBLE_BPM = 25.0") &&
    models.includes("MAX_PLAUSIBLE_BPM = 240.0") &&
    manager.includes("IBERFITHeartRateQuality.OUT_OF_RANGE") &&
    !manager.includes("bpm =")
);

pass(
  "rc57-6a-pure-kotlin-core",
  !/import\s+android\./.test(core) &&
    !/androidx\./.test(core) &&
    !/com\.google\.android/.test(core)
);

pass(
  "rc57-6a-no-brand-or-device-assumptions",
  !/(Samsung|Galaxy|SM-R860|SM_J600G|SM-J600G|RFATA0LSLFR|5200bf3d8d5b45a3)/i.test(core)
);

pass(
  "rc57-6a-no-synthetic-heart-rate",
  !/(synthetic|fakeHeartRate|mockHeartRate)/i.test(core)
);

console.log("RC57_6A_DEVICE_AGNOSTIC_HEART_RATE_CORE_STATIC=PASS");