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

const exercise={id:'IBF-BIRD-DOG-CON-BANDA',name_es:'Bird dog con banda',pattern:'anti-rotación',equipment:'banda'};

const validStart='Cuadrupedia estable: ambas palmas apoyadas en el suelo bajo los hombros y ambas rodillas apoyadas en el suelo bajo las caderas, columna neutral y pelvis nivelada. Una banda elástica de bucle queda asegurada entre la mano izquierda y el pie derecho contralateral, sin ningún anclaje externo; ninguno de los dos miembros está todavía extendido.';
const validFinal='Desde la misma cuadrupedia, el brazo izquierdo se extiende claramente hacia delante y la pierna derecha contralateral se extiende hacia atrás. La otra palma permanece apoyada en el suelo y la otra rodilla permanece apoyada en el suelo. La misma banda elástica de bucle conecta la mano izquierda con el pie derecho y queda visiblemente tensionada, con pelvis estable y nivelada y columna neutral.';

test('banded Bird Dog receives an exact hard movement and equipment contract',()=>{
  assert.equal(hasHardMovementPlanGuard(exercise),true);
  const guard=movementVisualGuard(exercise);
  assert.match(guard,/BANDED BIRD DOG HARD MOVEMENT LOCK/);
  assert.match(guard,/ONE light looped resistance band/);
  assert.match(guard,/CONTRALATERAL foot\/forefoot/);
  assert.match(guard,/Do NOT use a wall, floor, post, machine, chest-level point or any other external anchor/);
  assert.match(guard,/START is true tabletop quadruped/);
  assert.match(guard,/FINAL is the canonical bird-dog extension/);
});

test('banded Bird Dog planner rejects the exact external-anchor pattern that failed live generation',()=>{
  const invalid={
    start:'Posición de cuadrupedia: manos bajo hombros, rodillas bajo caderas. La banda elástica está anclada a un punto fijo bajo el pecho, con los extremos sujetos firmemente por ambas manos. Mantén la columna neutral.',
    final:'Extiende simultáneamente la pierna derecha hacia atrás y el brazo izquierdo hacia adelante. La banda se tensa entre las manos y el anclaje fijo bajo el pecho, con pelvis estable.'
  };
  assert.equal(movementPlanIssue(exercise,invalid),'PLAN_MOVEMENT_EQUIPMENT_INVALID:bird-dog-band-external-anchor');
});

test('banded Bird Dog planner accepts a self-contained contralateral hand-to-foot loop',()=>{
  assert.equal(movementPlanIssue(exercise,{start:validStart,final:validFinal}),null);
});

test('banded Bird Dog planner rejects lost tabletop support and wrong final support relationship',()=>{
  const noTabletop={start:'La banda elástica de bucle conecta la mano izquierda y el pie derecho contralateral. El atleta se arrodilla erguido con columna neutral y pelvis estable.',final:validFinal};
  assert.equal(movementPlanIssue(exercise,noTabletop),'PLAN_MOVEMENT_IDENTITY_INVALID:start:bird-dog-band-support');
  const noFinalSupport={start:validStart,final:'El brazo izquierdo se extiende hacia delante y la pierna derecha contralateral se extiende hacia atrás. La banda elástica conecta mano izquierda y pie derecho y está tensionada, pero ambas manos quedan levantadas del suelo y no se describe rodilla de apoyo; pelvis nivelada.'};
  assert.equal(movementPlanIssue(exercise,noFinalSupport),'PLAN_MOVEMENT_PHASE_RELATION_INVALID:bird-dog-band-extension');
});

test('structured QA topology requires four-point START and opposite two-point FINAL with the same band connection',()=>{
  const start={palms_on_floor:2,knees_on_floor:2,arm_reaching_forward:false,opposite_leg_extended_back:false,band_connection:'working_hand_to_opposite_foot',spine_relation:'neutral',pelvis_relation:'level'};
  const final={palms_on_floor:1,knees_on_floor:1,arm_reaching_forward:true,opposite_leg_extended_back:true,band_connection:'working_hand_to_opposite_foot',spine_relation:'neutral',pelvis_relation:'level'};
  assert.match(supportObservationInstruction(exercise),/two palms and two knees/);
  assert.match(supportPairObservationInstruction(exercise),/exactly one supporting palm and one supporting knee/);
  assert.equal(supportObservationPass(exercise,start),true);
  assert.equal(supportPairObservationPass(exercise,{start,final}),true);
  assert.equal(supportPairObservationPass(exercise,{start,final:{...final,band_connection:'other'}}),false);
  assert.equal(supportPairObservationPass(exercise,{start,final:{...final,palms_on_floor:2}}),false);
  assert.equal(supportPairObservationPass(exercise,{start,final:{...final,pelvis_relation:'rotated'}}),false);
});
