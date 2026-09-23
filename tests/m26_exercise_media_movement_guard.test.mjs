import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {movementVisualGuard} from '../scripts/exercise-media/auto-factory-movement-guard.mjs';

const generator=await readFile(new URL('../scripts/exercise-media/auto-factory-generate.mjs',import.meta.url),'utf8');
const qa=await readFile(new URL('../scripts/exercise-media/auto-factory-qa.mjs',import.meta.url),'utf8');

test('bear crawl movement guard encodes the defining quadrupedal support contract',()=>{
  const guard=movementVisualGuard({id:'IBF-BEAR-CRAWL',name_es:'Bear crawl',pattern:'locomoción',equipment:'sin equipo'});
  assert.match(guard,/BEAR CRAWL HARD MOVEMENT LOCK/);
  assert.match(guard,/Both hands must visibly contact the floor/);
  assert.match(guard,/both knees must remain visibly off the floor/);
  assert.match(guard,/hips must stay approximately level with the shoulders/);
  assert.match(guard,/trunk must remain long and near-horizontal/);
  assert.match(guard,/squat, crouch, lunge, sprinter start or resting pose/);
});

test('generic movement guard remains fail-closed on support and contact identity',()=>{
  const guard=movementVisualGuard({id:'IBF-OTHER',name_es:'Otro ejercicio',pattern:'fuerza',equipment:'mancuernas'});
  assert.match(guard,/MOVEMENT IDENTITY LOCK/);
  assert.match(guard,/support\/contact pattern/);
  assert.match(guard,/must fail/);
});

test('generation and both biomechanics gates consume the same movement identity contract',()=>{
  assert.match(generator,/import \{movementVisualGuard\}/);
  assert.match(generator,/const movementGuard=movementVisualGuard\(exercise\)/);
  assert.match(generator,/movement_identity_lock/);
  assert.match(generator,/Set movement_identity_lock=false/);
  assert.match(qa,/import \{movementVisualGuard\}/);
  assert.match(qa,/const movementGuard=movementVisualGuard\(exercise\)/);
  assert.match(qa,/movement_identity_lock/);
  assert.match(qa,/Set movement_identity_lock=false/);
});

test('movement hardening does not weaken automatic QA thresholds',()=>{
  assert.match(generator,/inferred\?0\.985:0\.97/);
  assert.match(qa,/inferred\?0\.985:0\.97/);
  assert.match(generator,/keys\.every\(k=>checks\[k\]===true\)/);
  assert.match(qa,/keys\.every\(k=>checks\[k\]===true\)/);
});
