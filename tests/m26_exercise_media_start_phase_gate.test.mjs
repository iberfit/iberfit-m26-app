import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const generator=await readFile(new URL('../scripts/exercise-media/auto-factory-generate.mjs',import.meta.url),'utf8');

test('START has its own bounded fail-closed QA and repair before FINAL',()=>{
  assert.match(generator,/const START_REPAIR_ATTEMPTS=1/);
  assert.match(generator,/async function validateStartPhase/);
  assert.match(generator,/start_matches_plan/);
  assert.match(generator,/movement_identity_lock/);
  assert.match(generator,/grip_support_setup/);
  assert.match(generator,/START_PHASE_QA_FAILED/);
  assert.match(generator,/archiveRejectedPhase\(generated\.file,outDir,exercise\.id,'start',attempt-1\)/);
});

test('START QA preserves the strict automatic confidence thresholds',()=>{
  assert.match(generator,/validateStartPhase[\s\S]*?inferred\?0\.985:0\.97/);
  assert.match(generator,/validateStartPhase[\s\S]*?keys\.every\(k=>checks\[k\]===true\)/);
});

test('a rejected START is repaired as a new pose instead of being preserved',()=>{
  assert.match(generator,/strict START QA rejected the previous START/);
  assert.match(generator,/DO NOT preserve the rejected pose or invalid support\/contact geometry/);
});

test('FINAL continuity explicitly consumes an independently QA-approved START',()=>{
  const startGate=generator.indexOf("if(phase==='start'){");
  const finalLoop=generator.indexOf('for(let attempt=0;attempt<=FINAL_REPAIR_ATTEMPTS');
  assert.ok(startGate>=0,'START gate missing');
  assert.ok(finalLoop>startGate,'FINAL loop must remain downstream from START gate');
  assert.match(generator,/independently QA-approved START phase continuity reference/);
  assert.match(generator,/FINAL_CONTINUITY_REFERENCE_MISSING/);
});

test('START failure exits before any FINAL generation in the workflow contract',()=>{
  assert.match(generator,/if\(phase==='start'\)[\s\S]*?throw new Error\(`START_PHASE_QA_FAILED:[\s\S]*?\);\s*}\s*let generated=null;let review=null;let repairIssues=\[\];/);
});
