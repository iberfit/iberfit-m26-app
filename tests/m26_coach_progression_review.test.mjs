import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExercisePerformanceMemory} from '../src/m26/engagement/exercise-performance-engine-core.js';
import {coachProgressionReview} from '../src/m26/workflows/coach-progression-review.js';

function memory(records){
 return buildExercisePerformanceMemory({collections:{sessionExecutions:records.map((row,i)=>({
  id:'ex-'+i,clientId:'c',status:'completed',syncStatus:'clean',
  completedAt:new Date(Date.UTC(2026,10,i+1)).toISOString(),
  results:[1,2].map(setNumber=>({exerciseId:'squat',setNumber,reps:row.reps,load:row.load??'20 kg',rpe:row.rpe,...row.extra}))
 }))}},'c','squat');
}
const strength={name_es:'Sentadilla',measurementProfile:'strength'};
test('strength decision support recognizes stable and worsening effort without changing prescription',()=>{
 const stable=memory([{reps:10,rpe:7},{reps:10,rpe:7}]);
 assert.equal(coachProgressionReview(stable,strength)?.kind,'maintain-review');
 const worse=memory([{reps:10,rpe:7},{reps:10,rpe:9}]);
 assert.equal(coachProgressionReview(worse,strength)?.kind,'recovery-review');
 assert.equal(worse.latest.sets[0].load.raw,'20 kg');
});
test('progress requires three comparable exposures and real effort',()=>{
 const two=memory([{reps:8,rpe:8},{reps:10,rpe:7}]);
 assert.equal(coachProgressionReview(two,strength),null);
 const three=memory([{reps:8,rpe:8},{reps:10,rpe:7.5},{reps:12,rpe:7}]);
 assert.equal(coachProgressionReview(three,strength)?.kind,'progress-review');
 assert.equal(coachProgressionReview(three,{name_es:'Running',measurementProfile:'endurance'}),null);
 const missing=memory([{reps:10,rpe:7},{reps:10,rpe:null}]);
 assert.equal(coachProgressionReview(missing,strength),null);
 const changed=memory([{reps:10,rpe:7},{reps:10,rpe:7,load:'25 kg'}]);
 assert.equal(coachProgressionReview(changed,strength),null);
 const changedUnits=memory([{reps:10,rpe:7},{reps:10,rpe:7,load:'20 lb'}]);
 assert.equal(coachProgressionReview(changedUnits,strength),null);
 const noLoad=memory([{reps:10,rpe:7,load:''},{reps:10,rpe:7,load:''}]);
 assert.equal(coachProgressionReview(noLoad,strength),null);
});
