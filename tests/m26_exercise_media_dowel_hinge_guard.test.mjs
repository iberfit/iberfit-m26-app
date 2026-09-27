import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
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
