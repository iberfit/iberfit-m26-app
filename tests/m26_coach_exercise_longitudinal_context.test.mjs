import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __coachExerciseEffortContinuityInternals,
} from '../src/m26/ui/coach-exercise-effort-continuity.js';

const {longitudinalCoachSummary}=__coachExerciseEffortContinuityInternals;

function assessment({confirmation,direction='up',points=4}={}){
  return {
    evidence:{
      longitudinalConfirmation:confirmation,
      longitudinalDirection:direction,
      longitudinalPointsUsed:points,
    },
  };
}

test('Coach explica cuando la tendencia reciente confirma la última señal',()=>{
  const summary=longitudinalCoachSummary(
    assessment({confirmation:'confirmed',direction:'up',points:4}),
  );

  assert.equal(summary?.state,'confirmed');
  assert.equal(summary?.points,4);
  assert.match(summary?.label||'',/4 exposiciones/u);
  assert.match(summary?.detail||'',/confirma la señal/u);
  assert.match(summary?.detail||'',/al alza/u);
});

test('Coach advierte cuando la tendencia reciente entra en conflicto',()=>{
  const summary=longitudinalCoachSummary(
    assessment({confirmation:'conflicted',direction:'flat',points:3}),
  );

  assert.equal(summary?.state,'conflicted');
  assert.equal(summary?.points,3);
  assert.match(summary?.detail||'',/no confirma todavía/u);
  assert.match(summary?.detail||'',/otra referencia comparable/u);
  assert.match(summary?.detail||'',/estable/u);
});

test('Coach no inventa tendencia longitudinal sin evidencia suficiente',()=>{
  assert.equal(
    longitudinalCoachSummary(
      assessment({confirmation:'confirmed',direction:'down',points:2}),
    ),
    null,
  );
  assert.equal(
    longitudinalCoachSummary(
      assessment({confirmation:'not-applicable',direction:'down',points:4}),
    ),
    null,
  );
  assert.equal(longitudinalCoachSummary(null),null);
});
