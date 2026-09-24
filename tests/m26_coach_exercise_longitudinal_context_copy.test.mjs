import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __coachExerciseEffortContinuityInternals,
} from '../src/m26/ui/coach-exercise-effort-continuity.js';

const {longitudinalCoachSummary}=__coachExerciseEffortContinuityInternals;

test('la copia Coach mantiene dato → contexto → decisión sin prescribir ajustes automáticos',()=>{
  const summary=longitudinalCoachSummary({
    evidence:{
      longitudinalConfirmation:'conflicted',
      longitudinalDirection:'down',
      longitudinalPointsUsed:4,
    },
  });

  assert.match(summary?.detail||'',/a la baja/u);
  assert.match(summary?.detail||'',/otra referencia comparable/u);
  assert.doesNotMatch(
    summary?.detail||'',
    /aumenta la carga|reduce la carga|cambia el plan|ajusta la carga|modifica la planificación/iu,
  );
});
