import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  hipHingeDowelCanonicalCamera,
  hipHingeDowelCanonicalPhases,
  hipHingeDowelPlanIssue,
  hipHingeDowelVisualGuard,
  isHipHingeDowelExercise,
} from '../scripts/exercise-media/auto-factory-dowel-hinge-guard.mjs';

const EXERCISE={
  id:'IBF-BISAGRA-DE-CADERA-CON-PALO',
  name_es:'Bisagra de cadera con palo',
  pattern:'bisagra',
  equipment:'palo',
};

test('dowel hip hinge is classified without catching unrelated stick exercises',()=>{
  assert.equal(isHipHingeDowelExercise(EXERCISE),true);
  assert.equal(isHipHingeDowelExercise({id:'IBF-SENTADILLA-OVERHEAD-CON-PALO',name_es:'Sentadilla overhead con palo',pattern:'sentadilla',equipment:'palo'}),false);
  assert.equal(isHipHingeDowelExercise({id:'IBF-JERK-TECNICO-CON-PALO',name_es:'Jerk técnico con palo',pattern:'empuje vertical',equipment:'palo'}),false);
});

test('invalid front-loaded dowel plan from the failed live run is rejected before image generation',()=>{
  const issue=hipHingeDowelPlanIssue({
    start:'De pie con columna neutra. Agarre del palo con ambas manos; el palo permanece vertical delante del cuerpo y puede apoyarse sobre los deltoides o sostenerse a la altura de los muslos.',
    final:'Cadera atrás y tronco inclinado, manteniendo la columna estable. El palo permanece vertical y pegado al cuerpo a la altura de los muslos o sobre los hombros.',
  });
  assert.equal(issue,'PLAN_MOVEMENT_EQUIPMENT_INVALID:start:hip-hinge-dowel-three-point-contact');
});

test('canonical three-point dowel feedback plan passes and keeps a real hip hinge',()=>{
  const plan={
    start:'De pie con rodillas suaves y columna neutra. El palo, que no se usa como carga, recorre la espalda por detrás y mantiene contacto con la parte posterior de la cabeza, la espalda torácica entre los omóplatos y el sacro antes de iniciar el movimiento.',
    final:'La cadera viaja claramente atrás mientras el tronco se inclina hacia delante desde la cadera y la columna permanece neutra. El palo sigue por detrás de la espalda manteniendo contacto con cabeza, región torácica entre los omóplatos y sacro; las rodillas solo permanecen suavemente flexionadas.',
  };
  assert.equal(hipHingeDowelPlanIssue(plan),null);
  const guard=hipHingeDowelVisualGuard(EXERCISE);
  assert.match(guard,/three visible\/defensible contact points/u);
  assert.match(guard,/NOT a front-loaded weight/u);
  assert.match(guard,/true hip hinge/u);
});

test('planner wires the dowel hard guard into initial planning repair and final validation',async()=>{
  const planner=await readFile(new URL('../scripts/exercise-media/auto-factory-plan.mjs',import.meta.url),'utf8');
  assert.match(planner,/isHipHingeDowelExercise/u);
  assert.match(planner,/dowelHinge\?dowelGuard:''/u);
  const repairGate=planner.match(/const maxRepair=Math\.max\(cable\?MAX_CABLE_PLAN_REPAIR_ATTEMPTS:0,([^?]+)\?MAX_MOVEMENT_PLAN_REPAIR_ATTEMPTS:0\)/u);
  assert.ok(repairGate,'movement repair gate must remain wired into maxRepair');
  assert.ok(repairGate[1].split('||').includes('dowelHinge'),'dowelHinge must participate in the bounded movement repair gate');
  assert.match(planner,/if\(dowelHinge\)\{const issue=hipHingeDowelPlanIssue\(plan\);if\(issue\)issues\.push\(issue\);\}/u);
  assert.match(planner,/finalDowelIssue=dowelHinge\?hipHingeDowelPlanIssue\(plan\):null/u);
  assert.match(planner,/const min=inferred\?0\.985:0\.96/u);
});

test('canonical dowel phases specify posterior two-hand grip, a real hinge and a reviewable view',()=>{
  const phases=hipHingeDowelCanonicalPhases(EXERCISE);
  assert.ok(phases);
  assert.equal(hipHingeDowelCanonicalCamera(EXERCISE),'three-quarter-rear');
  assert.equal(hipHingeDowelPlanIssue(phases),null);
  for(const phase of ['start','final']){
    const text=phases[phase];
    assert.ok(text.length>=40&&text.length<=700,'phase must satisfy planner length limits');
    assert.match(text,/mano.{0,65}(?:nuca|cuello)/iu,'upper hand must hold the dowel behind the head');
    assert.match(text,/mano.{0,65}(?:lumbar|espalda)/iu,'lower hand must hold the dowel behind the back');
    assert.match(text,/contacto.{0,95}(?:nuca|occipucio)|(?:nuca|occipucio).{0,95}contacto/iu,'occiput contact must be explicit');
    assert.match(text,/tor[aá]cic/iu);
    assert.match(text,/sacro/iu);
    assert.doesNotMatch(text,/ambas manos a los lados del cuerpo|palo vertical delante del cuerpo/iu);
  }
  assert.match(phases.final,/cadera.{0,100}atr[aá]s/iu);
  assert.equal(hipHingeDowelCanonicalPhases({id:'IBF-OTRO-EJERCICIO',name_es:'Sentadilla',equipment:'palo'}),null);
  assert.equal(hipHingeDowelCanonicalCamera({id:'IBF-OTRO-EJERCICIO',name_es:'Sentadilla',equipment:'palo'}),null);
});

test('model imagery and both QA phases enforce the dowel movement-specific grip and contacts',async()=>{
  const planner=await readFile(new URL('../scripts/exercise-media/auto-factory-plan.mjs',import.meta.url),'utf8');
  const generator=await readFile(new URL('../scripts/exercise-media/auto-factory-generate.mjs',import.meta.url),'utf8');
  assert.match(planner,/hipHingeDowelCanonicalPhases\(exercise\)/u);
  assert.match(planner,/camera:hipHingeDowelCanonicalCamera\(exercise\)/u);
  assert.match(generator,/hipHingeDowelVisualGuard\(exercise\)/u);
  assert.match(generator,/dowel_three_posterior_contacts/u);
  assert.match(generator,/dowel_both_hands_rear_grip/u);
  assert.match(generator,/dowel_three_posterior_contacts_both_phases/u);
  assert.match(generator,/dowel_both_hands_rear_grip_both_phases/u);
  const guard=hipHingeDowelVisualGuard(EXERCISE);
  assert.match(guard,/Exact TWO-HAND REAR GRIP/u);
  assert.match(guard,/three-quarter REAR camera/u);
  assert.match(guard,/three visible\/defensible contact points/u);
});
