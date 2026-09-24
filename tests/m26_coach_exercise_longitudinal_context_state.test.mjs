import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __coachExerciseEffortContinuityInternals,
} from '../src/m26/ui/coach-exercise-effort-continuity.js';

const {longitudinalCoachSummary}=__coachExerciseEffortContinuityInternals;

test('confirmed y conflicted conservan estados distintos para lectura semántica y QA',()=>{
  const confirmed=longitudinalCoachSummary({
    evidence:{
      longitudinalConfirmation:'confirmed',
      longitudinalDirection:'up',
      longitudinalPointsUsed:3,
    },
  });
  const conflicted=longitudinalCoachSummary({
    evidence:{
      longitudinalConfirmation:'conflicted',
      longitudinalDirection:'flat',
      longitudinalPointsUsed:3,
    },
  });

  assert.equal(confirmed?.state,'confirmed');
  assert.equal(conflicted?.state,'conflicted');
  assert.notEqual(confirmed?.detail,conflicted?.detail);
});
