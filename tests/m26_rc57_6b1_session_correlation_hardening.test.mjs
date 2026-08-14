import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const manager = () =>
  read("native/android/heart-rate/IBERFITHeartRateSessionManager.kt");

const provider = () =>
  read("native/android/wear/IBERFITWearHealthServicesBridge.kt");

test("RC57.6B.1 no sustituye el contexto si llega otro start distinto", () => {
  const source = manager();

  assert.match(source, /val activeContext = sessionContext/);
  assert.match(source, /val activeProviderId = primaryProviderId/);
  assert.match(
    source,
    /activeContext\.executionId == context\.executionId/
  );
  assert.match(source, /return false/);
});

test("RC57.6B.1 un start duplicado con mismo executionId es idempotente", () => {
  const source = manager();

  assert.match(
    source,
    /activeContext\.executionId == context\.executionId/
  );
  assert.match(source, /sessionListener = listener/);
});

test("RC57.6B.1 descarta muestras con correlación antigua", () => {
  const source = manager();

  assert.match(
    source,
    /sampleExecutionId != context\.executionId/
  );
  assert.match(
    source,
    /sampleSessionId != context\.sessionId/
  );
});

test("RC57.6B.1 consulta el ejercicio actual antes de iniciar", () => {
  const source = provider();

  assert.match(source, /getCurrentExerciseInfoAsync\(\)/);
  assert.match(
    source,
    /info\.exerciseType == ExerciseType\.UNKNOWN/
  );
});

test("RC57.6B.1 termina un ejercicio propio previo antes del nuevo", () => {
  const source = provider();

  assert.match(
    source,
    /val endFuture = exerciseClient\.endExerciseAsync\(\)/
  );
  assert.match(
    source,
    /beginFreshExercise\(generation, context\)/
  );
});

test("RC57.6B.1 protege callbacks async con generación de start", () => {
  const source = provider();

  assert.match(source, /private var startGeneration = 0L/);
  assert.match(source, /generation == startGeneration/);
  assert.match(source, /sessionContext == context/);
});

test("RC57.6B.1 un ENDED previo no borra el contexto pendiente", () => {
  const source = provider();

  assert.match(
    source,
    /if \(!pendingStart\) \{\s*sessionContext = null/s
  );
});

test("RC57.6B.1 mantiene arquitectura independiente de marca", () => {
  const source = `${manager()}\n${provider()}`;

  assert.doesNotMatch(
    source,
    /Samsung|Galaxy|SM-R860|SM_J600G|SM-J600G|RFATA0LSLFR|5200bf3d8d5b45a3/i
  );
});