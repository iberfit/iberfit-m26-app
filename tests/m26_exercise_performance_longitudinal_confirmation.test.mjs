import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessExercisePerformance,
  buildExercisePerformanceMemory,
  projectExercisePerformanceForRole,
} from '../src/m26/engagement/exercise-performance-engine.js';

const clientId='client-longitudinal';

function memoryFromReps(repetitions){
  const sessionExecutions=
    repetitions.map(
      (reps,index)=>({
        id:`long-${index+1}`,
        clientId,
        status:'completed',
        completedAt:
          `2026-09-${String(index+1).padStart(2,'0')}T10:00:00Z`,
        results:[{
          exerciseId:'bodyweight-squat',
          setNumber:1,
          reps,
          rpe:8,
          rir:2,
        }],
      }),
    );

  return buildExercisePerformanceMemory(
    {
      collections:{sessionExecutions},
      pendingOperations:[],
      conflicts:[],
      rejectedOperations:[],
    },
    clientId,
    'bodyweight-squat',
  );
}

test(
  'Coach no confirma una mejora aislada cuando la tendencia reciente no la respalda',
  ()=>{
    const memory=memoryFromReps([10,8,10]);
    const assessment=assessExercisePerformance(memory);

    assert.equal(assessment.status,'indeterminate');
    assert.equal(assessment.colorEligible,false);
    assert.equal(assessment.causalMetric,null);
    assert.equal(
      assessment.evidence.longitudinalConfirmation,
      'conflicted',
    );
    assert.equal(
      assessment.evidence.longitudinalDirection,
      'flat',
    );
    assert.equal(
      assessment.evidence.longitudinalExpectedDirection,
      'up',
    );
    assert.equal(
      assessment.evidence.longitudinalPointsUsed,
      3,
    );
  },
);

test(
  'Coach mantiene progreso cuando la mejora reciente y la tendencia longitudinal coinciden',
  ()=>{
    const memory=memoryFromReps([8,10,12]);
    const assessment=assessExercisePerformance(memory);

    assert.equal(assessment.status,'progress');
    assert.equal(assessment.colorEligible,true);
    assert.equal(assessment.causalMetric,'repsPerSet');
    assert.equal(
      assessment.evidence.longitudinalConfirmation,
      'confirmed',
    );
    assert.equal(
      assessment.evidence.longitudinalDirection,
      'up',
    );
  },
);

test(
  'Coach conserva una caída reciente como revisión aunque el historial todavía no confirme retroceso sostenido',
  ()=>{
    const memory=memoryFromReps([8,10,9]);
    const assessment=assessExercisePerformance(memory);

    assert.equal(assessment.status,'regression');
    assert.equal(assessment.colorEligible,true);
    assert.equal(assessment.confidence,'low');
    assert.equal(assessment.causalMetric,'repsPerSet');
    assert.equal(
      assessment.evidence.longitudinalConfirmation,
      'conflicted',
    );
    assert.equal(
      assessment.evidence.longitudinalDirection,
      'up',
    );
    assert.match(
      assessment.basis,
      /no confirma todavía que sea un retroceso sostenido/u,
    );
  },
);

test(
  'La proyección por rol aplica confirmación longitudinal sólo al Coach y mantiene Cliente facts-only',
  ()=>{
    const memory=memoryFromReps([10,8,10]);

    const clientProjection=
      projectExercisePerformanceForRole(
        memory,
        {
          role:'client',
          viewerClientId:clientId,
        },
      );

    assert.equal(clientProjection.coachAssessment,null);
    assert.equal(
      clientProjection.facts.interpretation,
      'facts-only',
    );

    const coachProjection=
      projectExercisePerformanceForRole(
        memory,
        {role:'coach'},
      );

    assert.equal(
      coachProjection.coachAssessment.status,
      'indeterminate',
    );
    assert.equal(
      coachProjection.coachAssessment.evidence.longitudinalConfirmation,
      'conflicted',
    );
  },
);
