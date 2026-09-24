import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const progressContinuityUrl=new URL(
  '../src/m26/ui/progress-continuity.js',
  import.meta.url,
);

test('Progress Continuity conecta la coherencia causal de esfuerzo antes del workspace por ejercicio',async()=>{
  const source=await readFile(progressContinuityUrl,'utf8');

  assert.match(
    source,
    /import \{enhanceCoachExerciseEffortContinuity\} from '\.\/coach-exercise-effort-continuity\.js';/u,
  );

  const effortIndex=source.indexOf(
    'const exerciseEffort=enhanceCoachExerciseEffortContinuity({root,viewModel,state,now});',
  );
  const focusIndex=source.indexOf(
    'const exerciseFocus=enhanceCoachExerciseFocus({root,viewModel});',
  );

  assert.ok(effortIndex>=0,'debe ejecutar el enhancer causal de esfuerzo');
  assert.ok(focusIndex>=0,'debe mantener el workspace por ejercicio');
  assert.ok(
    effortIndex<focusIndex,
    'la señal de esfuerzo debe corregirse antes de que las tarjetas se reubiquen en el workspace',
  );

  assert.match(
    source,
    /home\|\|constancy\|\|exerciseEffort\|\|exerciseFocus\|\|feedback\|\|completed/u,
  );
});
