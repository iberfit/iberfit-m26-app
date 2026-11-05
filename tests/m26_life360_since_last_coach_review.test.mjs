import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTrainingSinceLastCoachReview} from '../src/m26/intelligence/next-session-prep.js';
import {renderCoachSinceLastReview} from '../src/m26/modules/route-render.js';

const NOW=new Date('2026-11-05T16:00:00Z');
function decision(clientId,reviewedAt,id='review1'){
  return {entityType:'action_outcome',entityId:id,clientId,status:'cerrado',
    reviewedAt,updatedAt:'2026-11-05T14:00:00Z',
    outcomeStatus:'stable',outcomeSummary:'Review completed'};
}
function execution(id,clientId,completedAt,options={}){
  return {id,clientId,status:'completed',syncStatus:'clean',
    ...(completedAt?{completedAt}:{}),...options};
}
test('Life360 counts actual owner-scoped confirmed executions only after reviewed day',()=>{
  const state={collections:{
    m26Entities:[decision('client-A','2026-11-01'),decision('client-B','2026-11-04','foreign-review')],
    sessionExecutions:[
      execution('before','client-A','2026-10-31T15:00:00Z'),
      execution('same-day','client-A','2026-11-01T16:00:00Z'),
      execution('santiago-night','client-A','2026-11-02T02:30:00Z'),
      execution('after','client-A','2026-11-02T16:00:00Z'),
      execution('last','client-A','2026-11-04T15:00:00Z'),
      execution('foreign','client-B','2026-11-03T15:00:00Z'),
      execution('future','client-A','2026-11-09T15:00:00Z'),
      execution('created-only','client-A',null,{createdAt:'2026-11-03T15:00:00Z'}),
      execution('unconfirmed','client-A','2026-11-03T15:00:00Z',{syncStatus:'pending'}),
    ],
  },pendingOperations:[],conflicts:[],rejectedOperations:[]};
  const report=buildTrainingSinceLastCoachReview(state,'client-A',{now:NOW});
  assert.equal(report.available,true);
  assert.equal(report.reviewedAt,'2026-11-01');
  assert.equal(report.confirmedSessions,2);
  assert.equal(report.latestSessionAt,'2026-11-04');
  assert.equal(report.semantics,'coach-review-followup-not-initial-iri');
  const html=renderCoachSinceLastReview(report);
  assert.match(html,/2 sesiones confirmadas/u);
  assert.match(html,/IRI inicial permanece separado/u);
  assert.doesNotMatch(html,/foreign|unconfirmed|created-only/u);
  assert.equal(buildTrainingSinceLastCoachReview(state,'client-C',{now:NOW}).available,false);
});
test('Life360 rejects future, stale and missing confirmed reviews without fake zeros',()=>{
  const base={collections:{sessionExecutions:[execution('done','c1','2026-11-04T15:00:00Z')],
    m26Entities:[]}};
  const without=buildTrainingSinceLastCoachReview(base,'c1',{now:NOW});
  assert.equal(without.available,false);
  assert.equal(without.confirmedSessions,null);
  assert.equal(renderCoachSinceLastReview(without),'');
  const future={collections:{...base.collections,
    m26Entities:[decision('c1','2026-11-09')]}};
  assert.equal(buildTrainingSinceLastCoachReview(future,'c1',{now:NOW}).available,false);
  const stale={collections:{...base.collections,
    m26Entities:[decision('c1','2024-01-02')]}};
  assert.equal(buildTrainingSinceLastCoachReview(stale,'c1',{now:NOW}).reason,'review-out-of-range');
});
test('Life360 escapes untrusted dates in the professional review surface',()=>{
  const html=renderCoachSinceLastReview({available:true,
    confirmedSessions:1,reviewedAt:'<svg onload=evil>',latestSessionAt:'2026-11-04'});
  assert.doesNotMatch(html,/<svg/u);
  assert.match(html,/&lt;svg/u);
  assert.match(html,/1 sesión confirmada/u);
});
