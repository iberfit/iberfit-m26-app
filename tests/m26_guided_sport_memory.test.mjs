import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExercisePerformanceMemory,projectExercisePerformanceForRole} from '../src/m26/engagement/exercise-performance-engine-core.js';
import {exerciseMemorySetText,latestExerciseMemoryReference} from '../src/m26/workflows/session-ui.js';
const client='client-a',exercise='run';
function stateFor(rows){
 return {collections:{sessionExecutions:rows}};
}
function record(id,results,extra={}){
 return {id,clientId:client,status:'completed',syncStatus:'clean',completedAt:'2026-11-20T12:00:00Z',results,...extra};
}
test('confirmed endurance history preserves measured units and excludes unconfirmed and other clients',()=>{
 const state=stateFor([
  record('run-1',[{exerciseId:exercise,setNumber:1,distanceKm:5,seconds:1650,paceMinPerKm:'5:30',rpe:7}]),
  record('run-2',[{exerciseId:exercise,setNumber:1,distanceKm:50}],{syncStatus:'pending'}),
  record('other',[{exerciseId:exercise,distanceKm:70}],{clientId:'client-b'})
 ]);
 const m=buildExercisePerformanceMemory(state,client,exercise);
 assert.equal(m.exposureCount,1);
 const set=m.latest.sets[0];
 assert.equal(set.distanceKm,5);assert.equal(set.paceMinPerKm,'5:30');
 assert.equal(set.distanceM,null);assert.equal(set.pacePer100M,null);
 assert.match(latestExerciseMemoryReference(m),/5 km · 5:30 min\/km/u);
 const shared=projectExercisePerformanceForRole(m,{role:'client',viewerClientId:client}).facts.latest.sets[0];
 assert.equal(shared.distanceKm,5);assert.equal(shared.paceMinPerKm,'5:30');
 assert.equal(shared.reps,null);assert.equal(shared.rir,null);assert.equal(shared.load.value,null);
 assert.throws(()=>projectExercisePerformanceForRole(m,{role:'client',viewerClientId:'client-b'}),/CROSS_SCOPE_FORBIDDEN/u);
});
test('swim pace remains per 100 m; absent, invalid and prescribed values never become observed metrics',()=>{
 const m=buildExercisePerformanceMemory(stateFor([record('swim-1',[
  {exerciseId:'swim',setNumber:1,distanceM:200,pacePer100M:'2:15',rir:0},
  {exerciseId:'swim',setNumber:2,distanceM:-1,distanceKm:'',pacePer100M:'0:00',paceMinPerKm:'5:99',plannedDistanceM:400,plannedPacePer100M:'2:10'}
 ])]),client,'swim');
 const [first,last]=m.latest.sets;
 assert.match(exerciseMemorySetText(first),/200 m · 2:15 min\/100 m/u);
 assert.equal(last.distanceM,null);assert.equal(last.distanceKm,null);
 assert.equal(last.pacePer100M,null);assert.equal(last.paceMinPerKm,null);
 assert.equal(latestExerciseMemoryReference(m),'Serie confirmada');
 const shared=projectExercisePerformanceForRole(m,{role:'client',viewerClientId:client}).facts.latest.sets;
 assert.equal(shared[0].rir,0);assert.equal(shared[1].rir,null);
 assert.equal(shared[1].distanceM,null);
});
