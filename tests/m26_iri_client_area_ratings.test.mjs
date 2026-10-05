import test from 'node:test';
import assert from 'node:assert/strict';
import {clientIriAreaRatings} from '../src/m26/workflows/iri-client-area-ratings.js';

test('client IRI area ratings stay descriptive for field protocols',()=>{
  const draft={
    mobility:{
      ankle:{leftBest:8,rightBest:8,pain:'No'},
      posteriorChain:{leftBest:7,rightBest:8},
      assistedSquat:{depth:'Completa',knees:'Buena alineación',trunk:'Ligeramente curvado.'},
    },
    strength:{
      squat60:{repetitions:35},
      push:{variant:'knees',repetitions:8},
      trxRow:{repetitions:6,handleHeightCm:100},
      core:{frontPlankSeconds:34},
    },
    cardio:{
      protocol:'treadmill-3min-field',
      valid:true,
      deltaOneMinute:40,
      deltaTwoMinute:50,
      rpe:5,
      speedKmh:8,
      inclinePercent:2,
      recoveryMode:'standing-passive',
    },
  };
  const ratings=clientIriAreaRatings(draft,{domainScores:{}});
  assert.equal(ratings.movement.score,9);
  assert.equal(ratings.strength.score,6);
  assert.equal(ratings.recovery.score,8.5);
  assert.equal(ratings.movement.basis,'valoracion-iberfit');
  assert.equal(ratings.strength.basis,'valoracion-iberfit');
  assert.equal(ratings.recovery.basis,'valoracion-iberfit');
});

test('compatible normalized scores take precedence over descriptive ratings',()=>{
  const ratings=clientIriAreaRatings({
    mobility:{ankle:{leftBest:8,rightBest:8,pain:'No'}},
  },{
    domainScores:{mobility:{score10:7.4}},
  });
  assert.equal(ratings.movement.score,7.5);
  assert.equal(ratings.movement.basis,'baremo-compatible');
});

test('missing or invalid domains do not manufacture ratings',()=>{
  const ratings=clientIriAreaRatings({
    mobility:{skipped:true},
    strength:{skipped:true},
    cardio:{valid:false,deltaOneMinute:50},
  },{domainScores:{}});
  assert.equal(ratings.movement,null);
  assert.equal(ratings.strength,null);
  assert.equal(ratings.recovery,null);
});
