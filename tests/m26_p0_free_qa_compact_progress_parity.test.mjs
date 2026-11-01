import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCanonicalTrainingCollections} from '../src/m26/domain/canonical-training-collections.js';
import {computeProgressSummary,buildPlanExecutionSummary,buildExerciseLongitudinalProgress} from '../src/m26/engagement/progress-engine.js';
import {buildAdherenceWindows} from '../src/m26/engagement/progress-continuity.js';
import {buildProgressHub} from '../src/m26/engagement/progress-hub.js';
const cid='00000000-0000-4000-8000-000000000001';
const S1='00000000-0000-4000-8000-000000000011';
const S2='00000000-0000-4000-8000-000000000012';
const E1='00000000-0000-4000-8000-000000000013';
const E2='00000000-0000-4000-8000-000000000014';
const NOW=new Date('2026-10-31T12:00:00Z');
function session(id){return {id,clientId:cid,status:'completada',revision:2,visibleToClient:true,
  title:'Entrenamiento de fuerza',blocks:[{id:'b1',type:'exercise',exerciseId:'squat',sets:1}]};}
function execution(id,sessionId,date,reps,loadKg){return {id,sessionId,clientId:cid,
  status:'completada',revision:2,completedAt:date,syncStatus:'clean',
  results:[{exerciseId:'squat',exerciseName:'Sentadilla',reps,loadKg,rpe:7}],
  feedback:{sessionRpe:7}};}
const e1=execution(E1,S1,'2026-10-27T11:00:00Z',8,40);
const e2=execution(E2,S2,'2026-10-30T11:00:00Z',10,45);
function canonical(type,body){return {entityType:type,entityId:body.id,clientId:cid,
  revision:body.revision,status:body.status,updatedAt:body.completedAt||'2026-10-30T11:00:00Z',
  body};}
function state(compact){
  const legacySessions=[session(S1),session(S2)].map(x=>compact?{id:x.id}:x);
  const legacyExecutions=[e1,e2].map(x=>compact?{id:x.id}:x);
  const collections=reconcileCanonicalTrainingCollections({
    sessions:legacySessions,sessionExecutions:legacyExecutions,
    appointments:[],trainingCycles:[],iriAssessments:[],checkins:[],
    wearableDailySummaries:[],m26Entities:[
      canonical('session_execution',e2),canonical('session',session(S2)),
      canonical('session_execution',e1),canonical('session',session(S1))]});
  return {collections,pendingOperations:[],conflicts:[],rejectedOperations:[]};
}
test('pre-click progress 7/28/90, volume, strength, adherence and longitudinal proof stay byte-equivalent',()=>{
  const full=state(false),refs=state(true);
  for(const days of [7,28,90]){
    const before=computeProgressSummary(full,cid,{now:NOW,days});
    const after=computeProgressSummary(refs,cid,{now:NOW,days});
    assert.deepEqual(after,before,'progress '+days+'d');
    assert.ok(before.completedSessions>=1,'fixture should exercise meaningful completed data');
    assert.deepEqual(buildPlanExecutionSummary(refs,cid,{now:NOW,days}),
      buildPlanExecutionSummary(full,cid,{now:NOW,days}));
  }
  assert.deepEqual(buildAdherenceWindows(refs,cid,{now:NOW,windows:[7,28,90]}),
    buildAdherenceWindows(full,cid,{now:NOW,windows:[7,28,90]}));
  assert.deepEqual(buildExerciseLongitudinalProgress(refs,cid),
    buildExerciseLongitudinalProgress(full,cid));
  assert.deepEqual(buildProgressHub(refs,cid,{now:NOW}),
    buildProgressHub(full,cid,{now:NOW}));
  assert.deepEqual(refs.collections.sessionExecutions.map(x=>x.results),
    full.collections.sessionExecutions.map(x=>x.results));
  assert.deepEqual(refs.collections.sessionExecutions.map(x=>x.feedback),
    full.collections.sessionExecutions.map(x=>x.feedback));
});
