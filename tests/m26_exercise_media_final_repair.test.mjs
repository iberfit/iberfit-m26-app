import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const generator=await readFile(new URL('../scripts/exercise-media/auto-factory-generate.mjs',import.meta.url),'utf8');

test('ambiguous ab-wheel equipment is locked to realistic compact geometry',()=>{
  assert.match(generator,/function equipmentVisualGuard\(/);
  assert.match(generator,/standard compact ab roller/i);
  assert.match(generator,/one small wheel/i);
  assert.match(generator,/both hands.*side handles/i);
  assert.match(generator,/not a wheelchair/i);
  assert.match(generator,/not two large wheels/i);
});

test('FINAL generation gets one bounded QA-driven repair without weakening fail-closed thresholds',()=>{
  assert.match(generator,/FINAL_REPAIR_ATTEMPTS=1/);
  assert.match(generator,/REPAIR PASS/);
  assert.match(generator,/raw-phase-qa-attempt-/);
  assert.match(generator,/attempt<=FINAL_REPAIR_ATTEMPTS/);
  assert.match(generator,/RAW_PHASE_QA_FAILED/);
  assert.match(generator,/inferred\?0\.985:0\.97/);
  assert.doesNotMatch(generator,/FINAL_REPAIR_ATTEMPTS=[2-9]/);
});
