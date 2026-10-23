import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalHardMovementPlanPhases,movementPlanIssue,supportPairObservationPass} from '../scripts/exercise-media/auto-factory-movement-guard.mjs';
const exercise={id:'IBF-BUENOS-DIAS-SENTADO',name_es:'Buenos días sentado',equipment:'barra'};
test('seated hinge plan',()=>{const p=canonicalHardMovementPlanPhases(exercise);assert.match(p.final,/BISAGRA DE CADERA/);assert.equal(movementPlanIssue(exercise,p),null);});
test('seated hinge QA rejects wrong support',()=>{const a={seated:true,buttocks_on_bench:true,feet_grounded:2,bar_position:'upper_back',both_hands_on_bar:true,spine_neutral:true,torso_upright:true};const b={...a,hip_hinge_forward:true};assert.equal(supportPairObservationPass(exercise,{start:a,final:b}),true);assert.equal(supportPairObservationPass(exercise,{start:a,final:{...b,seated:false}}),false);});
