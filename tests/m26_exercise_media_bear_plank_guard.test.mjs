import assert from 'node:assert/strict';
import test from 'node:test';
import {hasHardMovementPlanGuard,movementVisualGuard} from '../scripts/exercise-media/auto-factory-movement-guard.mjs';

test('Bear Plank generation gets an explicit phase lock without inheriting Bear Crawl support QA',()=>{
  const exercise={id:'IBF-BEAR-PLANK',name_es:'Bear Plank',pattern:'core',equipment:'suelo'};
  const guard=movementVisualGuard(exercise);
  assert.equal(hasHardMovementPlanGuard(exercise),false,'Bear Plank must not inherit Bear Crawl knees-off START validation');
  assert.match(guard,/BEAR PLANK HARD PHASE LOCK/);
  assert.match(guard,/four-point tabletop\/quadruped setup/);
  assert.match(guard,/both knees visibly weight-bearing on the floor directly under the hips/);
  assert.match(guard,/knees hover only a few centimetres above the floor/);
  assert.match(guard,/Never solve the FINAL by straightening the knees/);
  assert.match(guard,/conventional high plank with long straight legs/);
});

test('Bear Crawl keeps its stricter hard movement plan guard',()=>{
  const exercise={id:'IBF-BEAR-CRAWL',name_es:'Bear Crawl',pattern:'locomoción',equipment:'suelo'};
  assert.equal(hasHardMovementPlanGuard(exercise),true);
  assert.match(movementVisualGuard(exercise),/BEAR CRAWL HARD MOVEMENT LOCK/);
});
