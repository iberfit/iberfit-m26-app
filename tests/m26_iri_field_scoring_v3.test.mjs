import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreNormedTest} from '../src/m26/norms/norms-engine.js';
import {scoreIriPerformance,IRI_SCORING_VERSION} from '../src/m26/norms/iri-scoring.js';

test('modified knee push-up uses female age bands only when protocol matches',()=>{
  const result=scoreNormedTest({testId:'modified_push_up_female',value:25,context:{sexForNorms:'female',ageYears:34},protocolId:'modified_knee_max_valid_reps'});
  assert.equal(result.scored,true);
  assert.equal(result.category.key,'good');
  assert.equal(result.grade10,8);
  assert.equal(result.evidence.sourceId,'essa-acsm-2006-modified-pushup');
  const male=scoreNormedTest({testId:'modified_push_up_female',value:25,context:{sexForNorms:'male',ageYears:34},protocolId:'modified_knee_max_valid_reps'});
  assert.equal(male.scored,false);
});

test('forearm plank percentiles are limited to young adult reference population',()=>{
  const young=scoreNormedTest({testId:'forearm_plank',value:72,context:{sexForNorms:'female',ageYears:24},protocolId:'forearm_plank_to_technical_failure'});
  assert.equal(young.scored,true);
  assert.equal(young.percentileEstimate,50);
  const older=scoreNormedTest({testId:'forearm_plank',value:72,context:{sexForNorms:'female',ageYears:42},protocolId:'forearm_plank_to_technical_failure'});
  assert.equal(older.scored,false);
  assert.ok(older.warnings.includes('NORM_NO_VALIDATED_TABLE_FOR_SEX_AGE'));
});

test('strength domain can score a real field battery without forcing chair stand',()=>{
  const scoring=scoreIriPerformance({
    assessmentDate:'2026-10-02',
    personProfile:{birthDate:'1992-04-01',sexForNorms:'female'},
    mobility:{ankle:{leftBest:10,rightBest:10}},
    strength:{
      chairStand:{repetitions:null,valid:false},
      push:{variant:'knees',repetitions:25,valid:true},
      core:{frontPlankSeconds:80,variant:'front-only',valid:true},
    },
  });
  assert.equal(scoring.engineVersion,IRI_SCORING_VERSION);
  assert.equal(scoring.domainScores.strength.scored,true);
  assert.equal(scoring.domainScores.strength.tests.some((item)=>item.key==='modified_push_up'&&item.scored),true);
  assert.ok(scoring.domainScores.strength.score10>0);
});
