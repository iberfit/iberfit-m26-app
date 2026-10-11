import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {hasHardMovementPlanGuard,canonicalHardMovementPlanPhases,canonicalHardMovementCamera,movementPlanIssue,movementVisualGuard,supportObservationPass,supportPairObservationPass} from '../scripts/exercise-media/auto-factory-movement-guard.mjs';
const bottom={id:'IBF-BOTTOM-UP-PRESS-CON-KETTLEBELL',name_es:'Bottom-up press con kettlebell',pattern:'empuje vertical',equipment:'kettlebell'};
const bound={id:'IBF-BOUND-LATERAL-CONTROLADO',name_es:'Bound lateral controlado',pattern:'potencia unilateral',equipment:'peso corporal'};
const planner=await readFile(new URL('../scripts/exercise-media/auto-factory-plan.mjs',import.meta.url),'utf8');

test('bottom-up press is canonically unilateral with bell above handle in BOTH phases',()=>{
  const p=canonicalHardMovementPlanPhases(bottom);
  assert.ok(hasHardMovementPlanGuard(bottom));
  assert.equal(canonicalHardMovementCamera(bottom),'three-quarter-front');
  assert.match(p.start,/una sola kettlebell INVERTIDA/);
  assert.match(p.start,/esfera arriba del asa/);
  assert.match(p.final,/POR ENCIMA del asa/);
  assert.match(p.final,/solo con la mano derecha/);
  assert.match(p.final,/codo extendido/);
  assert.equal(movementPlanIssue(bottom,p),null);
  assert.match(movementVisualGuard(bottom),/BOTTOM-UP PRESS INDEPENDENT/);
  assert.ok(movementPlanIssue(bottom,{start:'Ambas manos sostienen una kettlebell frente al pecho, esfera debajo del asa.',final:'Ambas manos empujan la kettlebell al frente, esfera debajo del asa.'}));
});
test('bottom-up observations fail closed on bilateral grip, hanging bell, or hidden evidence',()=>{
  const start={kettlebell_count:1,gripping_hands:1,bell_above_handle:true,free_hand_off_kettlebell:true,wrist_neutral:true,bell_near_working_shoulder:true};
  const final={kettlebell_count:1,gripping_hands:1,bell_above_handle:true,free_hand_off_kettlebell:true,wrist_neutral:true,bell_overhead:true,elbow_extended:true};
  assert.equal(supportObservationPass(bottom,start),true);
  assert.equal(supportPairObservationPass(bottom,{start,final}),true);
  assert.equal(supportPairObservationPass(bottom,{start,final:{...final,bell_above_handle:false}}),false);
  assert.equal(supportPairObservationPass(bottom,{start:{...start,gripping_hands:2},final}),false);
  assert.equal(supportPairObservationPass(bottom,{start,final:{...final,bell_above_handle:undefined}}),false);
});
test('lateral bound is a right-to-left jump and controlled left-leg landing, not a leg raise',()=>{
  const p=canonicalHardMovementPlanPhases(bound);
  assert.ok(hasHardMovementPlanGuard(bound));
  assert.equal(canonicalHardMovementCamera(bound),'front');
  assert.match(p.start,/IMPULSO LATERAL/);
  assert.match(p.final,/SALTO CON DESPLAZAMIENTO LATERAL/);
  assert.match(p.final,/ATERRIZA sobre la pierna izquierda/);
  assert.equal(movementPlanIssue(bound,p),null);
  assert.match(movementVisualGuard(bound),/LATERAL BOUND INDEPENDENT/);
  assert.ok(movementPlanIssue(bound,{start:'Eleva una rodilla al frente manteniendo el equilibrio.',final:'Eleva una pierna al costado sin salto.'}));
});
test('lateral bound observations reject forward knee raise or missing displacement',()=>{
  const start={support_foot:'right',lateral_takeoff_preparation:true,front_knee_raise:false};
  const final={landing_foot:'left',lateral_displacement_visible:true,landing_knee_aligned:true,landing_hip_knee_flexed:true,front_knee_raise:false};
  assert.equal(supportPairObservationPass(bound,{start,final}),true);
  assert.equal(supportPairObservationPass(bound,{start,final:{...final,lateral_displacement_visible:false}}),false);
  assert.equal(supportPairObservationPass(bound,{start:{...start,front_knee_raise:true},final}),false);
});
test('planner applies hard canonical geometry before model plan can consume image attempts',()=>{
  assert.match(planner,/canonicalHardMovementPlanPhases\(exercise\)/);
  assert.match(planner,/camera:canonicalHardMovementCamera\(exercise\)\|\|plan\.camera/);
  assert.match(planner,/if\(hardMovement\)\{const issue=movementPlanIssue\(exercise,plan\)/);
});
