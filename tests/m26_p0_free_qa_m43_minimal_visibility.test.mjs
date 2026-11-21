import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  assertQaM43MinimalVisibility,readQaM43MinimalVisibility,
} from '../scripts/remote-gates/qa_m43_minimal_bootstrap_visibility.mjs';
const id='12345678-1234-4123-8123-123456789abc';
const valid={schema:'iberfit.qa.m43.bootstrap-visibility.v1',
  canonicalVisible:false,legacyVisible:false};

test('QA minimal visibility validates exact boolean contract; no fabricated privacy success',()=>{
  assert.deepEqual(assertQaM43MinimalVisibility(valid),
    {canonicalVisible:false,legacyVisible:false});
  for(const bad of [
    null,{},[],{...valid,schema:'v2'}, {...valid,canonicalVisible:null},
    {...valid,legacyVisible:'false'}, {...valid,extra:true},
  ])assert.throws(()=>assertQaM43MinimalVisibility(bad),
    /M43_QA_MINIMAL_VISIBILITY_RESPONSE_INVALID/u);
  assert.deepEqual(assertQaM43MinimalVisibility({...valid,canonicalVisible:true}),
    {canonicalVisible:true,legacyVisible:false});
  assert.deepEqual(assertQaM43MinimalVisibility({...valid,legacyVisible:true}),
    {canonicalVisible:false,legacyVisible:true});
});

test('one authenticated minimal RPC preserves caller identity and rejects invalid inputs before network',async()=>{
  const actor={token:'opaque-test-marker'},calls=[];
  const rpc=async(name,session,payload)=>{
    calls.push([name,session,payload]);return valid;
  };
  assert.deepEqual(await readQaM43MinimalVisibility({rpc,session:actor,
    entityType:'session',entityId:id}),{canonicalVisible:false,legacyVisible:false});
  assert.deepEqual(await readQaM43MinimalVisibility({rpc,session:actor,
    entityType:'session_execution',entityId:id}),{canonicalVisible:false,legacyVisible:false});
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0],['iberfit_qa_m43_bootstrap_visibility_v1',
    actor,{p_entity_type:'session',p_entity_id:id}]);
  for(const bad of [
    {rpc,session:actor,entityType:'planning',entityId:id},
    {rpc,session:actor,entityType:'session',entityId:'not-a-uuid'},
    {rpc,session:null,entityType:'session',entityId:id},
  ])await assert.rejects(readQaM43MinimalVisibility(bad),
    /M43_QA_MINIMAL_VISIBILITY_INPUT_INVALID/u);
  assert.equal(calls.length,2);
});

test('only QA synthetic authenticated Client, invoker and canonical bootstrap: rollback guarded',()=>{
  const sql=readFileSync(
    'supabase/qa-migrations/20261117201500_p0_free_qa_m43_minimal_visibility_v1.sql','utf8');
  const rollback=readFileSync(
    'supabase/qa-rollbacks/20261117201500_p0_free_qa_m43_minimal_visibility_v1_rollback.sql','utf8');
  assert.match(sql,/STABLE SECURITY INVOKER/u);
  assert.doesNotMatch(sql,/SECURITY DEFINER/u);
  assert.match(sql,/v_snapshot := public\.iberfit_bootstrap_v26\(\)/u);
  assert.match(sql,/auth\.uid\(\) IS NULL/u);
  assert.match(sql,/auth\.jwt\(\)->>'email'/u);
  assert.match(sql,/v_environment->>'environment' IS DISTINCT FROM 'QA'/u);
  assert.match(sql,/realDataAllowed/u);
  assert.match(sql,/productionBlocked/u);
  assert.match(sql,/p_entity_type NOT IN \('session','session_execution'\)/u);
  assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon/u);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated/u);
  assert.match(sql,/jsonb_array_elements\(v_snapshot#>'\{data,m26Entities\}'\)/u);
  assert.match(sql,/jsonb_array_elements\(v_snapshot#>'\{data,sessions\}'\)/u);
  assert.match(sql,/jsonb_array_elements\(v_snapshot#>'\{data,sessionExecutions\}'\)/u);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO|FROM|public\.)/iu);
  assert.match(rollback,/DROP FUNCTION public\.iberfit_qa_m43_bootstrap_visibility_v1/u);
  assert.match(rollback,/IS DISTINCT FROM 'QA'/u);
});

test('M43 writer serializes complete A and B fixture bootstrap, retains four real canonical probes on B',()=>{
  const writer=readFileSync('scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs','utf8');
  assert.match(writer,/let a=await bootstrap\(clientA\);\s*let b=await bootstrap\(clientB\);\s*const coachRole=await rpc\('iberfit_current_role_v26'/u);
  assert.match(writer,/selectM43QaFixtureForSafeCapacity\(a,b/u);
  assert.match(writer,/const finalA=await bootstrap\(clientA\);\s*const finalForeign=await foreignVisibility\(clientB,'session_execution',execution\.id\);/u);
  for(const marker of [
    "'OTHER_CLIENT_CANNOT_SEE_SESSION'","'FOREIGN_CLIENT_HISTORY_PRIVATE'",
    "'INTERACTIVE_SESSION_FOREIGN_PRIVATE'","'RUNNING_INTERACTIVE_FOREIGN_PRIVATE'",
  ])assert.ok(writer.includes(marker),'M43_NEGATIVE_CHECK_LOST:'+marker);
  assert.equal((writer.match(/foreignVisibility\(clientB,/gu)||[]).length,4);
  assert.doesNotMatch(writer,/\b(?:finalB|otherVisible|uiOther|runningOther)\b/u);
});
