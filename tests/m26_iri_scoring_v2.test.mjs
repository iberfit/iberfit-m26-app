import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreNormedTest} from '../src/m26/norms/norms-engine.js';
import {scoreIriPerformance,WBLT_ASYMMETRY_MDC_CM,IRI_SCORING_VERSION} from '../src/m26/norms/iri-scoring.js';

test('WBLT usa sexo y edad, puntúa cada lado y conserva la categoría de la fuente',()=>{
  const female=scoreNormedTest({testId:'weight_bearing_lunge',value:4.5,context:{sexForNorms:'female',ageYears:55},protocolId:'wblt_distance_cm'});
  const male=scoreNormedTest({testId:'weight_bearing_lunge',value:4.5,context:{sexForNorms:'male',ageYears:55},protocolId:'wblt_distance_cm'});
  assert.equal(female.category.key,'low');
  assert.equal(male.category.key,'very_low');
  assert.equal(female.evidence.sourceId,'mcbride-2026-wblt');
});

test('WBLT inválido en el registro técnico queda fuera de la puntuación',()=>{
  const scoring=scoreIriPerformance({
    assessmentDate:'2026-10-02',personProfile:{birthDate:'1996-04-05',sexForNorms:'female'},
    mobility:{ankle:{leftBest:4,rightBest:10}},
    protocolRecords:[
      {testId:'weight-bearing-lunge',side:'left',valid:false},
      {testId:'weight-bearing-lunge',side:'right',valid:true},
    ],
    strength:{chairStand:{repetitions:20,valid:true}},
  });
  const mobility=scoring.domainScores.mobility;
  const left=mobility.tests.find((item)=>item.side==='left');
  const right=mobility.tests.find((item)=>item.side==='right');
  assert.equal(left.scored,false);
  assert.match(left.warnings.join(' '),/PROTOCOL_INVALID/);
  assert.equal(right.scored,true);
  assert.equal(mobility.score100,right.score);
});

test('movilidad usa el lado limitante y no diluye una restricción promediando tobillos',()=>{
  const scoring=scoreIriPerformance({
    assessmentDate:'2026-10-02',personProfile:{birthDate:'1996-04-05',sexForNorms:'female'},
    mobility:{ankle:{leftBest:3,rightBest:10}},
    strength:{chairStand:{repetitions:20,valid:true}},
    cardio:{protocol:'ymca-3min-standard',valid:true,durationSeconds:180},
  });
  const mobility=scoring.domainScores.mobility;
  assert.equal(mobility.tests.length,2);
  assert.equal(mobility.score100,Math.min(...mobility.tests.map((item)=>item.score)));
  assert.equal(mobility.signal.differenceCm,7);
  assert.equal(mobility.signal.exceedsTypicalMdc,true);
  assert.equal(mobility.signal.thresholdCm,WBLT_ASYMMETRY_MDC_CM);
});

test('silla 30 s devuelve percentil estimado con anclas chilenas completas',()=>{
  const result=scoreNormedTest({testId:'chair_stand_30s',value:20,context:{sexForNorms:'female',ageYears:35},protocolId:'chair_stand_30s_standard'});
  assert.equal(result.scored,true);
  assert.equal(result.percentileEstimate,50);
  assert.equal(result.percentileLabel,'≈P50');
  assert.deepEqual(result.evidence.percentileAnchors,{p2_5:14,p25:18,p50:20,p75:23,p97_5:39});
});

test('1MSTS usa referencia chilena y YMCA nunca hereda ese baremo',()=>{
  const oneMinute=scoreIriPerformance({
    assessmentDate:'2026-10-02',personProfile:{birthDate:'1996-04-05',sexForNorms:'female'},
    mobility:{ankle:{leftBest:10,rightBest:10}},
    strength:{chairStand:{repetitions:20,valid:true}},
    cardio:{protocol:'1msts-standard',durationSeconds:60,repetitions:38,valid:true},
  });
  assert.equal(oneMinute.domainScores.cardio.scored,true);
  assert.equal(oneMinute.domainScores.cardio.tests[0].percentileEstimate,50);
  const ymca=scoreIriPerformance({
    assessmentDate:'2026-10-02',personProfile:{birthDate:'1996-04-05',sexForNorms:'female'},
    mobility:{ankle:{leftBest:10,rightBest:10}},
    strength:{chairStand:{repetitions:20,valid:true}},
    cardio:{protocol:'ymca-3min-standard',durationSeconds:180,valid:true,finalHr:140,oneMinuteHr:100},
  });
  assert.equal(ymca.domainScores.cardio.scored,false);
  assert.match(ymca.domainScores.cardio.note,/YMCA/);
});

test('nota global exige dos dominios, declara cobertura y composición no la altera',()=>{
  const scoring=scoreIriPerformance({
    assessmentDate:'2026-10-02',personProfile:{birthDate:'1996-04-05',sexForNorms:'female'},
    bodyComposition:{bodyFatPercent:99},
    mobility:{ankle:{leftBest:10,rightBest:10}},
    strength:{chairStand:{repetitions:20,valid:true}},
    cardio:{protocol:'ymca-3min-standard',durationSeconds:180,valid:true},
  });
  assert.equal(scoring.engineVersion,IRI_SCORING_VERSION);
  assert.equal(scoring.global.available,true);
  assert.equal(scoring.global.coverage.scoredDomains,2);
  assert.equal(scoring.composition.scored,false);
  assert.ok(scoring.global.score10>=0&&scoring.global.score10<=10);
  assert.equal(scoring.evidenceSources.some((item)=>item.sourceId==='barros-poblete-2025-chile'),true);
});
