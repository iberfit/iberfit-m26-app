import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {hasHardMovementPlanGuard,movementPlanIssue} from '../scripts/exercise-media/auto-factory-movement-guard.mjs';

const planner=await readFile(new URL('../scripts/exercise-media/auto-factory-plan.mjs',import.meta.url),'utf8');

const bear={id:'IBF-BEAR-CRAWL',name_es:'Bear crawl',pattern:'locomoción',equipment:'Peso corporal'};

test('Bear crawl planner hard guard rejects crouch-like plans and accepts real quadrupedal locomotion',()=>{
  assert.equal(hasHardMovementPlanGuard(bear),true);

  const bad={
    start:'Manos bajo hombros. Rodillas bajo caderas y pies planos. Pelvis neutra, core activo y mirada al frente.',
    final:'Mismo punto de partida tras completar unos pasos, listo para repetir el movimiento con control.'
  };
  assert.match(movementPlanIssue(bear,bad),/^PLAN_MOVEMENT_IDENTITY_INVALID:/);

  const good={
    start:'Manos apoyadas en el suelo bajo los hombros, puntas de los pies apoyadas en el suelo, ambas rodillas suspendidas y sin contacto con el suelo, cadera al nivel de los hombros y tronco horizontal con columna neutra.',
    final:'Manos siguen apoyadas en el suelo, puntas de los pies mantienen apoyo, rodillas suspendidas sin tocar el suelo, cadera al nivel de los hombros y tronco horizontal neutro; la mano derecha y el pie izquierdo avanzan en un paso contralateral.'
  };
  assert.equal(movementPlanIssue(bear,good),null);
});

test('planner consumes shared movement guard and allows only one bounded movement-plan repair',()=>{
  assert.match(planner,/movementVisualGuard/);
  assert.match(planner,/movementPlanIssue/);
  assert.match(planner,/hasHardMovementPlanGuard/);
  assert.match(planner,/MAX_MOVEMENT_PLAN_REPAIR_ATTEMPTS=1/);
  assert.match(planner,/hardMovement\?movementGuard:''/);
  assert.match(planner,/previous plan was rejected for \$\{repairReason\}/);
  assert.match(planner,/finalMovementIssue/);
  assert.match(planner,/inferred\?0\.985:0\.96/,'planner confidence threshold must stay unchanged');
});
