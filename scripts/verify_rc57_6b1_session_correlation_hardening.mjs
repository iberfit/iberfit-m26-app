import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const pass = (name, ok) => {
  if (!ok) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

const manager =
  read("native/android/heart-rate/IBERFITHeartRateSessionManager.kt");
const provider =
  read("native/android/wear/IBERFITWearHealthServicesBridge.kt");

pass(
  "rc57-6b1-manager-does-not-overwrite-active-context",
  manager.includes("val activeContext = sessionContext") &&
    manager.includes("val activeProviderId = primaryProviderId") &&
    manager.includes("activeContext.executionId == context.executionId") &&
    manager.includes("return false")
);

pass(
  "rc57-6b1-manager-drops-stale-execution-samples",
  manager.includes("sampleExecutionId != context.executionId") &&
    manager.includes("sampleSessionId != context.sessionId")
);

pass(
  "rc57-6b1-provider-checks-existing-exercise",
  provider.includes("getCurrentExerciseInfoAsync()") &&
    provider.includes("info.exerciseType == ExerciseType.UNKNOWN")
);

pass(
  "rc57-6b1-provider-ends-owned-stale-exercise-before-fresh-start",
  provider.includes("val endFuture = exerciseClient.endExerciseAsync()") &&
    provider.includes("beginFreshExercise(generation, context)")
);

pass(
  "rc57-6b1-provider-protects-start-generation",
  provider.includes("private var startGeneration = 0L") &&
    provider.includes("generation == startGeneration") &&
    provider.includes("sessionContext == context")
);

pass(
  "rc57-6b1-ended-update-does-not-clear-pending-new-context",
  provider.includes("if (!pendingStart)") &&
    provider.includes("sessionContext = null")
);

pass(
  "rc57-6b1-no-brand-assumptions",
  !/(Samsung|Galaxy|SM-R860|SM_J600G|SM-J600G|RFATA0LSLFR|5200bf3d8d5b45a3)/i
    .test(`${manager}\n${provider}`)
);

console.log("RC57_6B1_SESSION_CORRELATION_HARDENING_STATIC=PASS");