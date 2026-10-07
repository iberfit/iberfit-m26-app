import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createExecution,startExecution,recordSet,advanceExecution,beginRest,
  substituteExercise,canSubstituteCurrentExercise,currentExerciseSubstitutionScope,currentStep,nextExecutionStep,
  previousSetDraftValues,
} from '../src/m26/workflows/session-execution.js';

const actor={role:'coach',id:'coach-substitution'};
const catalog={has:(id)=>['exercise-a','exercise-b','exercise-c'].includes(id)};
const session={id:'session-substitution',clientId:'client-substitution',blocks:[{
  id:'block-a',type:'exercise',exerciseId:'exercise-a',sets:3,reps:'10',restSeconds:60,targetRpe:7,targetRir:3,
}]};

function started(id='execution-substitution'){
  const execution=createExecution({session,clientId:'client-substitution',executionId:id});
  startExecution(execution,{actor});
  return execution;
}

test('una sustitución a mitad del ejercicio conserva lo realizado y aplica la alternativa solo a lo pendiente',()=>{
  const execution=started();
  assert.equal(currentExerciseSubstitutionScope(execution),'all');
  recordSet(execution,session,{reps:10,load:'20 kg',rpe:7,actor});
  advanceExecution(execution,{actor});
  assert.equal(canSubstituteCurrentExercise(execution),true);
  assert.equal(currentExerciseSubstitutionScope(execution),'remaining');

  substituteExercise(execution,session,{
    fromExerciseId:'exercise-a',toExerciseId:'exercise-b',catalog,reason:'Molestia en el patrón',actor,
  });

  assert.equal(execution.queue.length,2);
  assert.deepEqual(
    execution.queue.map((item)=>({exerciseId:item.exerciseId,sets:item.sets})),
    [{exerciseId:'exercise-a',sets:1},{exerciseId:'exercise-b',sets:2}],
  );
  assert.equal(Object.values(execution.results)[0].exerciseId,'exercise-a');
  assert.equal(execution.index,1);
  assert.equal(execution.setIndex,0);
  assert.equal(currentStep(execution,session).exerciseId,'exercise-b');
  assert.equal(previousSetDraftValues(execution),null,'no debe copiarse carga/reps entre ejercicios distintos');
  const event=execution.events.find((item)=>item.type==='EXERCISE_SUBSTITUTED');
  assert.equal(event.payload.partial,true);
  assert.equal(event.payload.preservedSets,1);
  assert.equal(event.payload.remainingSets,2);
});

test('si se decide durante el descanso, conserva ese descanso y cambia desde la siguiente serie pendiente',()=>{
  const execution=started('execution-rest-substitution');
  recordSet(execution,session,{reps:10,load:'20 kg',rpe:7,actor});
  beginRest(execution,60,{actor});
  const restUntil=execution.restUntil;

  substituteExercise(execution,session,{
    fromExerciseId:'exercise-a',toExerciseId:'exercise-b',catalog,reason:'Equipo ocupado',actor,
  });

  assert.equal(execution.index,0,'debe permanecer en la serie completada mientras corre el descanso');
  assert.equal(execution.restUntil,restUntil);
  assert.equal(execution.queue[0].sets,1);
  assert.equal(execution.queue[1].sets,2);
  assert.equal(nextExecutionStep(execution,session).exerciseId,'exercise-b');
});

test('un grupo ya iniciado sigue fail-closed para no romper el orden de rondas',()=>{
  const grouped={id:'session-grouped-substitution',clientId:'client-substitution',blocks:[{
    id:'group-1',type:'biserie',rounds:2,exerciseIds:['exercise-a','exercise-b'],prescriptions:{
      'exercise-a':{reps:'8',restSeconds:30,targetRpe:7,targetRir:3},
      'exercise-b':{reps:'8',restSeconds:30,targetRpe:7,targetRir:3},
    },
  }]};
  const execution=createExecution({session:grouped,clientId:'client-substitution',executionId:'execution-grouped'});
  startExecution(execution,{actor});
  recordSet(execution,grouped,{reps:8,rpe:7,actor});
  advanceExecution(execution,{actor});
  recordSet(execution,grouped,{reps:8,rpe:7,actor});
  advanceExecution(execution,{actor});

  assert.equal(canSubstituteCurrentExercise(execution),false);
  assert.equal(currentExerciseSubstitutionScope(execution),'locked');
  assert.throws(()=>substituteExercise(execution,grouped,{
    fromExerciseId:'exercise-a',toExerciseId:'exercise-c',catalog,reason:'Cambio técnico',actor,
  }),/M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED/);
});




test('en un grupo iniciado se puede sustituir un miembro que todavía no tiene ninguna ronda registrada',()=>{
  const grouped={id:'session-group-safe-substitution',clientId:'client-substitution',blocks:[{
    id:'group-safe',type:'biserie',rounds:2,exerciseIds:['exercise-a','exercise-b'],prescriptions:{
      'exercise-a':{reps:'8',restSeconds:0,targetRpe:7,targetRir:3},
      'exercise-b':{reps:'8',restSeconds:30,targetRpe:7,targetRir:3},
    },
  }]};
  const execution=createExecution({session:grouped,clientId:'client-substitution',executionId:'execution-group-safe'});
  startExecution(execution,{actor});
  recordSet(execution,grouped,{reps:8,rpe:7,actor});
  advanceExecution(execution,{actor}); // B1, aún sin resultados de B
  assert.equal(currentExerciseSubstitutionScope(execution),'all');
  substituteExercise(execution,grouped,{
    fromExerciseId:'exercise-b',toExerciseId:'exercise-c',catalog,reason:'Equipo no disponible',actor,
  });
  assert.equal(currentStep(execution,grouped).exerciseId,'exercise-c');
  assert.equal(execution.queue[1].sets,2);
});

test('la UI explica cuando la sustitución afectará solo a las series restantes',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-ui.js','utf8');
  assert.match(source,/currentExerciseSubstitutionScope/u);
  assert.match(source,/Usar alternativa en las series restantes/u);
});