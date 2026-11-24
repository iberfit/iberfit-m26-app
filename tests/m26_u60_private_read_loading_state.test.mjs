import test from 'node:test';
import assert from 'node:assert/strict';
import {datedWorkoutPhaseUiState,datedWorkoutViewForFocus,requireDatedWorkoutReceipt} from '../src/m26/workflows/occurrence-qa-ui.js';

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

import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
test('U60 loading state and private-read notice are fully localized in EN/FR/PT',()=>{
  const copy=[
    'Comprobando estado privado de la fecha…',
    'Verificando autorización, fecha y estado con el servidor. Todavía no se ha iniciado ningún entrenamiento.',
  ];
  for(const label of copy)for(const language of ['en','fr','pt']){
    const translated=iberfitSurfaceTranslate(label,{language});
    assert.notEqual(translated,label,language+' missing translation: '+label);
    assert.ok(translated.length>=10);
  }
});

test('U60 focus never exposes another date or client private result',()=>{
 const focus={clientId:'c1',occurrenceId:'date2'};
 const view={clientId:'c1',occurrenceId:'date1',phase:'active',currentStep:{private:true}};
 assert.deepEqual(datedWorkoutViewForFocus(view,focus),{phase:'idle'});
 assert.deepEqual(datedWorkoutViewForFocus({...view,clientId:'c2',occurrenceId:'date2'},focus),{phase:'idle'});
 assert.equal(datedWorkoutViewForFocus(view,null),null);
 const matching={...view,occurrenceId:'date2'};
 assert.equal(datedWorkoutViewForFocus(matching,focus),matching);
});
test('U60 success copy requires a settled confirmed receipt, not a refusal or stale view',()=>{
 const ok={phase:'active',busy:false,hasUncertain:false,unsavedWork:false,error:null};
 assert.equal(requireDatedWorkoutReceipt(ok),ok);
 for(const bad of [null,{...ok,phase:'needs-refresh'},{...ok,phase:'pending-recovery'},
   {...ok,busy:true},{...ok,error:'REVISION_MISMATCH'},{...ok,hasUncertain:true},
   {...ok,unsavedWork:true}]){
  assert.throws(()=>requireDatedWorkoutReceipt(bad),/RECOVERY_REQUIRED/);
 }
 assert.throws(()=>requireDatedWorkoutReceipt(ok,{phases:['completed']}),/RECOVERY_REQUIRED/);
 assert.equal(requireDatedWorkoutReceipt({...ok,phase:'completed'},{phases:['completed']}).phase,'completed');
 assert.equal(requireDatedWorkoutReceipt({...ok,unsavedWork:true},{allowUnsaved:true}).unsavedWork,true);
});
