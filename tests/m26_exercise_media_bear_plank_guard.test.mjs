import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasHardMovementPlanGuard,
  movementPlanIssue,
  movementVisualGuard,
  supportObservationInstruction,
  supportObservationPass,
  supportPairObservationInstruction,
  supportPairObservationPass,
} from '../scripts/exercise-media/auto-factory-movement-guard.mjs';

test('base Bear Plank keeps its own tabletop-to-hover phase lock',()=>{
  const exercise={id:'IBF-BEAR-PLANK',name_es:'Bear Plank',pattern:'core',equipment:'suelo'};
  const guard=movementVisualGuard(exercise);
  assert.equal(hasHardMovementPlanGuard(exercise),false,'Base Bear Plank must not inherit the knees-off START hard-plan validator');
  assert.match(guard,/BEAR PLANK HARD PHASE LOCK/);
  assert.match(guard,/four-point tabletop\/quadruped setup/);
  assert.match(guard,/both knees visibly weight-bearing on the floor directly under the hips/);
  assert.match(guard,/knees hover only a few centimetres above the floor/);
  assert.match(guard,/Never solve the FINAL by straightening the knees/);
});

test('Bear Plank Shoulder Tap is not mistaken for the base Bear Plank and gets a hard plan contract',()=>{
  const exercise={id:'IBF-BEAR-PLANK-SHOULDER-TAP',name_es:'Bear plank shoulder tap',pattern:'anti-rotación',equipment:'sin equipo'};
  const guard=movementVisualGuard(exercise);
  assert.equal(hasHardMovementPlanGuard(exercise),true);
  assert.match(guard,/BEAR PLANK SHOULDER TAP HARD MOVEMENT LOCK/);
  assert.match(guard,/START is already an active compact bear plank/);
  assert.match(guard,/touches the OPPOSITE SHOULDER\/upper deltoid/);
  assert.match(guard,/If both hands remain on the floor in FINAL, movement identity MUST fail/);
  assert.doesNotMatch(guard,/both knees visibly weight-bearing on the floor directly under the hips/);
});

test('Shoulder Tap planner rejects wrist/palm substitution and accepts a real contralateral shoulder tap',()=>{
  const exercise={id:'IBF-BEAR-PLANK-SHOULDER-TAP',name_es:'Bear plank shoulder tap',pattern:'anti-rotación',equipment:'sin equipo'};
  const start='Ambas manos apoyadas en el suelo bajo hombros, puntas de ambos pies apoyadas, rodillas flexionadas a 90 grados y suspendidas pocos centímetros bajo las caderas, tronco neutro.';
  const wrong={start,final:'La palma izquierda permanece apoyada en el suelo y las puntas de ambos pies permanecen apoyadas en el suelo; rodillas flexionadas a 90 grados y suspendidas bajo la cadera. La mano derecha se despega, cruza y toca la palma izquierda manteniendo pelvis y tronco neutros.'};
  assert.equal(movementPlanIssue(exercise,wrong),'PLAN_MOVEMENT_PHASE_RELATION_INVALID:bear-plank-shoulder-tap-target');
  const valid={start,final:'La palma izquierda permanece apoyada en el suelo y ambas puntas de pies siguen apoyadas; rodillas flexionadas y suspendidas bajo la cadera. La mano derecha se despega, cruza y toca el hombro izquierdo manteniendo pelvis y tronco neutros.'};
  assert.equal(movementPlanIssue(exercise,valid),null);
});

test('Shoulder Tap structured support topology requires two palms in START and one palm plus opposite shoulder in FINAL',()=>{
  const exercise={id:'IBF-BEAR-PLANK-SHOULDER-TAP',name_es:'Bear plank shoulder tap',pattern:'anti-rotación',equipment:'sin equipo'};
  const start={palms_on_floor:2,forefeet_on_floor:2,knees_weight_bearing:false,hip_height_relation:'near_shoulders',torso_relation:'approximately_parallel',lunge_or_squat:false};
  const final={palms_on_floor:1,forefeet_on_floor:2,knees_weight_bearing:false,free_hand_target:'opposite_shoulder',hip_height_relation:'near_shoulders',torso_relation:'approximately_parallel',lunge_or_squat:false};
  assert.match(supportObservationInstruction(exercise),/exactly two palms and two forefeet\/toes/);
  assert.match(supportPairObservationInstruction(exercise),/free hand visibly contacts the opposite shoulder/);
  assert.equal(supportObservationPass(exercise,start),true);
  assert.equal(supportPairObservationPass(exercise,{start,final}),true);
  assert.equal(supportPairObservationPass(exercise,{start,final:{...final,palms_on_floor:2}}),false);
  assert.equal(supportPairObservationPass(exercise,{start,final:{...final,free_hand_target:'other'}}),false);
});

test('Bear Crawl keeps its stricter hard movement plan guard',()=>{
  const exercise={id:'IBF-BEAR-CRAWL',name_es:'Bear Crawl',pattern:'locomoción',equipment:'suelo'};
  assert.equal(hasHardMovementPlanGuard(exercise),true);
  assert.match(movementVisualGuard(exercise),/BEAR CRAWL HARD MOVEMENT LOCK/);
});
