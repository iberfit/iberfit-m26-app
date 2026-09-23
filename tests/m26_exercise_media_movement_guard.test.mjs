import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {movementPlanIssue,movementVisualGuard} from '../scripts/exercise-media/auto-factory-movement-guard.mjs';

const generator=await readFile(new URL('../scripts/exercise-media/auto-factory-generate.mjs',import.meta.url),'utf8');
const planner=await readFile(new URL('../scripts/exercise-media/auto-factory-plan.mjs',import.meta.url),'utf8');
const qa=await readFile(new URL('../scripts/exercise-media/auto-factory-qa.mjs',import.meta.url),'utf8');
const bear={id:'IBF-BEAR-CRAWL',name_es:'Bear crawl',pattern:'locomoción',equipment:'sin equipo'};

test('bear crawl movement guard encodes the defining quadrupedal support contract',()=>{
  const guard=movementVisualGuard(bear);
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

test('bear crawl plan rejects the exact feet-support contradiction observed in the real pilot',()=>{
  const plan={
    start:'Manos apoyadas en el suelo bajo hombros. Rodillas elevadas, cadera a la altura de hombros y columna en línea recta. Sin contacto con el suelo de las rodillas o pies.',
    final:'Manos apoyadas en el suelo y puntas de los pies en contacto con el suelo. Rodillas suspendidas, cadera a la altura de hombros y tronco horizontal con columna neutra.'
  };
  assert.equal(movementPlanIssue(bear,plan),'PLAN_BEAR_CRAWL_FEET_SUPPORT_CONTRADICTION:start');
});

test('bear crawl plan accepts a physically coherent quadrupedal support contract',()=>{
  const plan={
    start:'Manos apoyadas en el suelo bajo hombros y puntas de los pies apoyadas en el suelo. Rodillas suspendidas, cadera a la altura de hombros y tronco horizontal con columna neutra.',
    final:'Manos en contacto con el suelo tras avanzar un apoyo y antepiés apoyados en el suelo. Rodillas elevadas, pelvis alineada con hombros y tronco horizontal con columna neutra.'
  };
  assert.equal(movementPlanIssue(bear,plan),null);
});

test('planner validates movement support semantics and has one bounded repair',()=>{
  assert.match(planner,/MAX_PLAN_REPAIR_ATTEMPTS=1/);
  assert.match(planner,/movementPlanIssue\(exercise,plan\)/);
  assert.match(planner,/REPAIR PASS/);
  assert.match(planner,/Remove the contradiction rather than paraphrasing it/);
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
