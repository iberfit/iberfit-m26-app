import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const planner=await readFile(new URL('../scripts/exercise-media/auto-factory-plan.mjs',import.meta.url),'utf8');

test('cable plans require persistent handle grip and taut resistance in both phases',()=>{
  assert.match(planner,/function usesCableEquipment\(/);
  assert.match(planner,/function phaseHasCableGripContinuity\(/);
  assert.match(planner,/PLAN_CABLE_GRIP_CONTINUITY_MISSING/);
  assert.match(planner,/both hands must remain visibly gripping one cable handle each in START and FINAL/i);
  assert.match(planner,/cables remain visibly connected and under tension/i);
});

test('cable planner rejects folded-arm ambiguity and allows one bounded repair only',()=>{
  assert.match(planner,/MAX_CABLE_PLAN_REPAIR_ATTEMPTS=1/);
  assert.match(planner,/PLAN_CABLE_ARM_FOLD_AMBIGUOUS/);
  assert.match(planner,/hands may cross the body midline, but forearms must never fold across the torso/i);
  assert.match(planner,/repairAttempt<=MAX_CABLE_PLAN_REPAIR_ATTEMPTS/);
  assert.doesNotMatch(planner,/MAX_CABLE_PLAN_REPAIR_ATTEMPTS=[2-9]/);
});
