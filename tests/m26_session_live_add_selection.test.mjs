import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {liveAddExerciseSelectionState} from '../src/m26/workflows/session-controller.js';

const catalog={has:(exerciseId)=>exerciseId==='exercise-valid'};

test('Coach live add remains disabled until a catalog exercise is selected',()=>{
  assert.deepEqual(liveAddExerciseSelectionState('',catalog),{exerciseId:'',enabled:false});
  assert.deepEqual(liveAddExerciseSelectionState('   ',catalog),{exerciseId:'',enabled:false});
  assert.deepEqual(liveAddExerciseSelectionState('exercise-missing',catalog),{exerciseId:'exercise-missing',enabled:false});
  assert.deepEqual(liveAddExerciseSelectionState('  exercise-valid  ',catalog),{exerciseId:'exercise-valid',enabled:true});
  assert.deepEqual(liveAddExerciseSelectionState('exercise-valid',null),{exerciseId:'exercise-valid',enabled:false});
});

test('session controller synchronizes and guards the live-add action across render and selection changes',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(source,/function syncLiveAddExerciseControl\(context=getContext\(\)\)/u);
  assert.match(source,/button\.disabled=liveAddPending\|\|uncertain\|\|!state\.enabled/u);
  assert.match(source,/setAttribute\?\.\('aria-disabled',!button\.disabled\?'false':'true'\)/u);
  assert.match(source,/select\.disabled=liveAddPending\|\|!hasSelectableOption/u);
  assert.match(source,/render=\(\)=>\{[^}]*syncLiveAddExerciseControl\(getContext\(\)\)/u);
  assert.match(source,/if\(action==='add-live-exercise'\)\{\s*const liveSelection=liveAddExerciseSelectionState/u);
  assert.match(source,/if\(!liveSelection\.enabled\)\{syncLiveAddExerciseControl\(context\);return;\}/u);
  assert.match(source,/payload\.operationId=liveAddOperationId/u);
  assert.match(source,/markExecutionSync\(context\.execution,'pending',\{operationId:liveAddOperationId,errorCode:'M26_SESSION_ACTION_TIMEOUT'\}\)/u);
  assert.match(source,/root\.addEventListener\('change',change\)/u);
  assert.match(source,/root\.removeEventListener\('change',change\)/u);
});