import test from 'node:test';
import assert from 'node:assert/strict';
import {selectCoachExerciseEffortMetric} from '../src/m26/ui/exercise-effort-metric.js';

function metric(values){
  const points=values.map((value,index)=>({
    completedAt:`2026-09-${String(index+1).padStart(2,'0')}T10:00:00Z`,
    value,
  }));
  return {
    comparable:points.length>=2,
    latest:points.length?points[points.length-1]:null,
    points,
  };
}

test('usa RIR cuando RIR es la señal causal aunque también exista RPE',()=>{
  const selection=selectCoachExerciseEffortMetric(
    {
      averageRpe:metric([7,8,8]),
      averageRir:metric([3,2,1]),
    },
    {causalMetric:'averageRir'},
  );

  assert.equal(selection.key,'averageRir');
  assert.equal(selection.label,'RIR medio');
  assert.equal(selection.prefix,'RIR');
  assert.equal(selection.metric.latest.value,1);
});

test('mantiene RPE como fallback cuando la lectura causal no depende del esfuerzo',()=>{
  const selection=selectCoachExerciseEffortMetric(
    {
      averageRpe:metric([7,8]),
      averageRir:metric([3,2]),
    },
    {causalMetric:'load'},
  );

  assert.equal(selection.key,'averageRpe');
  assert.equal(selection.label,'RPE medio');
});

test('usa RIR como fallback cuando RPE no tiene evidencia disponible',()=>{
  const selection=selectCoachExerciseEffortMetric(
    {
      averageRpe:null,
      averageRir:metric([3,2]),
    },
    null,
  );

  assert.equal(selection.key,'averageRir');
  assert.equal(selection.label,'RIR medio');
});
