import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {sessionAdjustmentCounts} from '../src/m26/workflows/session-ui.js';

test('el cierre resume solo ajustes estructurales realmente registrados',()=>{
  const counts=sessionAdjustmentCounts({events:[
    {type:'EXERCISE_SUBSTITUTED'},
    {type:'SET_SKIPPED'},
    {type:'EXERCISE_SKIPPED'},
    {type:'SET_ADDED'},
    {type:'SET_ADDED'},
    {type:'GROUP_ROUND_ADDED'},
    {type:'EXERCISE_ADDED'},
    {type:'SET_CORRECTED'},
    {type:'STEP_ADVANCED'},
  ]});
  assert.deepEqual(counts,{
    substitutions:1,
    skippedSets:1,
    skippedExercises:1,
    extraSets:2,
    extraRounds:1,
    addedExercises:1,
  });
});

test('el resumen de ajustes aparece tanto antes como después de confirmar el cierre',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-ui.js','utf8');
  const calls=[...source.matchAll(/\$\{renderSessionAdjustmentSummary\(execution\)\}/gu)];
  assert.equal(calls.length,2);
  for(const label of ['Ajustes realizados','Sustituciones','Series omitidas','Ejercicios omitidos','Series extra','Rondas extra','Ejercicios añadidos']){
    assert.match(source,new RegExp(label,'u'));
  }
});