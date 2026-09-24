import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const moduleSource=await readFile(
  new URL('../src/m26/ui/coach-exercise-effort-continuity.js',import.meta.url),
  'utf8',
);

test('el enhancer Coach cablea la evidencia longitudinal en el estudio por ejercicio',()=>{
  assert.match(
    moduleSource,
    /enhanceLongitudinalContext\(study,assessment,documentLike\)/u,
  );
  assert.match(
    moduleSource,
    /data-m26-coach-exercise-longitudinal/u,
  );
  assert.match(
    moduleSource,
    /longitudinalCoachSummary/u,
  );
});

test('la lectura longitudinal no depende de la ventana visual de historial',()=>{
  assert.doesNotMatch(moduleSource,/exercise-history-window/u);
  assert.doesNotMatch(moduleSource,/historyWindow/u);
  assert.doesNotMatch(moduleSource,/\b(?:4|8|12)\s*\/\s*(?:8|12)\b/u);
});
