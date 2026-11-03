import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaCoachHistoryLatencyProbe} from '../qa/coach-iri-document-privileged/qa-privileged-history-latency.mjs';
const HOST='https://gjztkdwfmunnzhtvxrsu.supabase.co';
function request(rpc,section='m26Entities',origin=HOST,method='POST'){
  return {url:()=>origin+'/rest/v1/rpc/'+rpc,method:()=>method,
    postDataJSON:()=>({p_client_id:'private-client-do-not-log',p_section:section,
      p_secret:'private-token-do-not-log'})};
}
test('bounded QA-only Coach history timing keeps only safe section and duration aggregates',()=>{
  let ms=100;
  const probe=createQaCoachHistoryLatencyProbe({now:()=>ms});
  const first=request('iberfit_bootstrap_v26_core_u37_qa');
  const history=request('iberfit_privileged_history_page_u38_qa','domainEvents');
  probe.start(first);ms+=25;probe.start(history);ms+=100;
  probe.finish(first,200);ms+=50;probe.finish(history,200);
  probe.setPhase('second');
  const next=request('iberfit_privileged_history_page_u38_qa','sessionExecutions');
  probe.start(next);ms+=1800;probe.finish(next,503);
  const result=probe.snapshot();
  assert.equal(result.observed,3);
  assert.equal(result.maxConcurrent,2);
  assert.deepEqual(result.rows.map(row=>[row.phase,row.endpoint,row.section,row.requests,row.completed,row.httpFailures]),[
    ['first','core','core',1,1,0],
    ['first','history','domainEvents',1,1,0],
    ['second','history','sessionExecutions',1,1,1],
  ]);
  assert.equal(result.rows[2].p95Ms,1800);
  assert.equal(result.rows[1].wallMs,150);
  assert.doesNotMatch(JSON.stringify(result),/private-client|private-token|\.supabase\.co|p_secret|p_client_id/u);
});
test('only approved QA endpoints are sampled; failures and in-flight requests remain distinguishable',()=>{
  let ms=0;const probe=createQaCoachHistoryLatencyProbe({now:()=>ms});
  probe.start(request('iberfit_privileged_history_page_u38_qa','domainEvents','https://pjhmrhejsoofmouedavw.supabase.co'));
  probe.start(request('iberfit_privileged_history_page_u38_qa','domainEvents',HOST,'GET'));
  probe.start(request('other_rpc'));
  const unknown=request('iberfit_privileged_history_page_u38_qa','not-allowed');
  probe.start(unknown);ms+=33;probe.fail(unknown);
  const inFlight=request('iberfit_privileged_history_page_u38_qa','m26Entities');
  probe.start(inFlight);
  const result=probe.snapshot();
  assert.equal(result.observed,2);
  assert.equal(result.rows.find(r=>r.section==='unknown').networkFailures,1);
  assert.equal(result.rows.find(r=>r.section==='m26Entities').inFlight,1);
  assert.throws(()=>probe.setPhase('third'),/QA_HISTORY_PHASE_INVALID/u);
});
