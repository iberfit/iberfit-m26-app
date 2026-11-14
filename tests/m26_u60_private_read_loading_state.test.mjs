import test from 'node:test';
import assert from 'node:assert/strict';
import {datedWorkoutPhaseUiState} from '../src/m26/workflows/occurrence-qa-ui.js';

test('U60 private read is explicitly loading and never relabelled ready before server evidence',()=>{
  for(const input of [undefined,null,{phase:'idle'}]){
    assert.deepEqual(datedWorkoutPhaseUiState(input),{
      phase:'idle',
      loading:true,
      label:'Comprobando estado privado de la fecha…',
    });
  }
  assert.deepEqual(datedWorkoutPhaseUiState({phase:'ready'}),{
    phase:'ready',loading:false,label:'Preparada · pendiente de inicio confirmado',
  });
  assert.deepEqual(datedWorkoutPhaseUiState({phase:'active'}),{
    phase:'active',loading:false,label:'Entrenamiento en curso',
  });
});

test('U60 pending and stale are never represented as started or completed',()=>{
  for(const phase of ['pending-recovery','needs-refresh','not-recognized']){
    const state=datedWorkoutPhaseUiState({phase});
    assert.equal(state.loading,false);
    assert.doesNotMatch(state.label,/Preparada|Entrenamiento en curso|Finalizado y confirmado/u);
  }
});
