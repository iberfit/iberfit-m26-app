import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreNormedTest, explainSexSpecificDifference, validateNormContext } from '../src/m26/norms/norms-engine.js';
import { scoreIriPerformance } from '../src/m26/norms/iri-scoring.js';
import { buildIriCommand } from '../src/m26/workflows/iri-workflow.js';

test('10 flexiones se interpretan distinto por sexo con el mismo protocolo',()=>{
  const c=explainSexSpecificDifference('push_up_standard',10,22);
  assert.equal(c.female.category.key,'good');
  assert.equal(c.male.category.key,'poor');
  assert.equal(c.sameClassification,false);
});

test('no extrapola una tabla fuera de edad validada',()=>{
  const r=scoreNormedTest({testId:'push_up_standard',value:10,context:{sexForNorms:'female',ageYears:35},protocolId:'standard_max_valid_reps'});
  assert.equal(r.scored,false); assert.ok(r.warnings.includes('NORM_NO_VALIDATED_TABLE_FOR_SEX_AGE'));
});

test('rechaza contexto sin sexo para baremos',()=>{
  assert.equal(validateNormContext({ageYears:30}).ok,false);
});

test('chair stand usa bandas chilenas por sexo y edad',()=>{
  const f=scoreNormedTest({testId:'chair_stand_30s',value:18,context:{sexForNorms:'female',ageYears:35},protocolId:'chair_stand_30s_standard'});
  const m=scoreNormedTest({testId:'chair_stand_30s',value:18,context:{sexForNorms:'male',ageYears:35},protocolId:'chair_stand_30s_standard'});
  assert.equal(f.category.key,'p25_p49'); assert.equal(m.category.key,'p25_p49');
  assert.deepEqual(f.evidence.percentileAnchors,{p25:18,p50:20,p75:23});
  assert.deepEqual(m.evidence.percentileAnchors,{p25:18,p50:21,p75:27});
});

test('no inventa puntuación cuando falta tabla completa',()=>{
  const r=scoreNormedTest({testId:'handgrip',value:30,context:{sexForNorms:'female',ageYears:34},protocolId:'handgrip_standard'});
  assert.equal(r.scored,false); assert.ok(r.warnings.includes('NORM_REFERENCE_TABLE_PENDING'));
});

test('IRI incluye trazabilidad científica y cobertura',()=>{
  const draft={id:'11111111-1111-4111-8111-111111111111',clientId:'c1',assessmentDate:'2026-07-18',stepFinalHr:150,stepOneMinuteHr:110,strengthPatterns:{push:1},bodyComposition:{weightKg:60},sexForNorms:'female',ageYears:22,pushUps:10,chairStand30s:20};
  const scoring=scoreIriPerformance(draft); assert.equal(scoring.results.length,2); assert.equal(scoring.compositeScore,null); assert.equal(scoring.aggregation,'per_test_only');
  const cmd=buildIriCommand(draft,3); assert.equal(cmd.payload.patch.normScoring.results[0].evidence.sourceId,'adams-2022-standard-pushup-female'); assert.equal(cmd.payload.patch.normEngineVersion,'m26-rc5.1');
});
