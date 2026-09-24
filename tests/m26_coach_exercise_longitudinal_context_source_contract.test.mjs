import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(
  new URL('../src/m26/ui/coach-exercise-effort-continuity.js',import.meta.url),
  'utf8',
);

test('la UI Coach consume únicamente evidencia longitudinal ya confirmada por el motor',()=>{
  assert.match(source,/longitudinalConfirmation/u);
  assert.match(source,/longitudinalDirection/u);
  assert.match(source,/longitudinalPointsUsed/u);
  assert.doesNotMatch(source,/percentageDelta[^\n]{0,120}longitudinal/u);
  assert.doesNotMatch(source,/history\.slice\(/u);
});
