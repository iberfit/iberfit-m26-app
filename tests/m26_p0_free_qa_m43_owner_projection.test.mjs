import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 assertQaM43OwnerProjection,readQaM43OwnerProjection,
} from '../scripts/remote-gates/qa_m43_owner_projection.mjs';
const clientId='12345678-1234-4123-8123-123456789abc';
const entityId='12345678-1234-4123-8123-123456789abd';
const schema='iberfit.qa.m43.owner-projection.v1';
const session={schema,canonicalVisible:true,legacyVisible:false,
 canonical:{entityType:'session',entityId,clientId,status:'disponible',revision:3}};
const options={entityType:'session',entityId,clientId};
test('owner session transport returns only canonical enablement metadata',()=>{
 assert.deepEqual(assertQaM43OwnerProjection(session,options),{
   canonicalVisible:true,legacyVisible:false,canonical:session.canonical});
 for(const bad of [null,[],{}, {...session,schema:'wrong'},
  {...session,legacyVisible:'false'}, {...session,canonicalVisible:'true'},
  {...session,extra:'data'}, {...session,canonical:null},
  {...session,canonical:{...session.canonical,entityId:clientId}},
  {...session,canonical:{...session.canonical,clientId:entityId}},
  {...session,canonical:{...session.canonical,revision:'3'}},
  {...session,canonical:{...session.canonical,status:''}},
  {...session,canonical:{...session.canonical,body:{private:true}}},
 ])assert.throws(()=>assertQaM43OwnerProjection(bad,options),
  /M43_QA_OWNER_PROJECTION_INVALID/u);
 assert.deepEqual(assertQaM43OwnerProjection(
   {...session,canonicalVisible:false,canonical:null},options),
   {canonicalVisible:false,legacyVisible:false,canonical:null});
});
test('planning never returns body or canonical entity, even when visible',()=>{
 assert.deepEqual(assertQaM43OwnerProjection({
   schema,canonicalVisible:false,legacyVisible:false,canonical:null},
   {...options,entityType:'planning'}),
   {canonicalVisible:false,legacyVisible:false,canonical:null});
 for(const invalid of [
  {...session,canonicalVisible:true},
  {...session,canonicalVisible:false,canonical:{secret:'x'}},
 ])assert.throws(()=>assertQaM43OwnerProjection(
  invalid,{...options,entityType:'planning'}),
  /M43_QA_OWNER_PROJECTION_INVALID/u);
});
test('one authenticated RPC under original actor, no caching, invalid inputs fail before network',async()=>{
 const actor={token:'opaque-test-jwt'},calls=[];
 const rpc=async(name,received,payload)=>{calls.push([name,received,payload]);return session;};
 const received=await readQaM43OwnerProjection({rpc,session:actor,...options});
 assert.equal(received.canonical?.revision,3);
 assert.deepEqual(calls,[['iberfit_qa_m43_owner_projection_v1',actor,
   {p_entity_type:'session',p_entity_id:entityId}]]);
 for(const bad of [
  {rpc,session:actor,entityType:'report',entityId,clientId},
  {rpc,session:actor,entityType:'session',entityId:'bad-id',clientId},
  {rpc,session:null,...options},
  {rpc,session:{token:''},...options},
  {rpc,session:actor,...options,clientId:'bad-id'},
 ])await assert.rejects(readQaM43OwnerProjection(bad),
  /M43_QA_OWNER_PROJECTION_INPUT_INVALID/u);
 assert.equal(calls.length,1);
 await assert.rejects(readQaM43OwnerProjection({rpc:async()=>({}),
   session:actor,...options}),/M43_QA_OWNER_PROJECTION_INVALID/u);
});
test('SQL QA-only invoker, original bootstrap, ownership, no DML, reversible',()=>{
 const sql=readFileSync(
 'supabase/qa-migrations/20261117211000_p0_free_qa_m43_owner_projection_v1.sql','utf8');
 const rollback=readFileSync(
 'supabase/qa-rollbacks/20261117211000_p0_free_qa_m43_owner_projection_v1_rollback.sql','utf8');
 for(const expected of [
  'STABLE SECURITY INVOKER','public.iberfit_bootstrap_v26()',
  "auth.uid() IS NULL","auth.jwt()->>'email'",
  "v_env->>'environment' IS DISTINCT FROM 'QA'",
  "v_env->>'realDataAllowed' IS DISTINCT FROM 'false'",
  "v_env->>'productionBlocked' IS DISTINCT FROM 'true'",
  "v_snapshot#>>'{canary,scope}' IS DISTINCT FROM 'allowlist'",
  "v_record->>'clientId' IS DISTINCT FROM v_client_id::text",
  "p_entity_type NOT IN ('planning','session')",
  "v_kind := CASE WHEN p_entity_type='planning' THEN 'trainingCycles' ELSE 'sessions' END",
  'FROM PUBLIC, anon','TO authenticated',
 ])assert.ok(sql.includes(expected),'OWNER_PROJECTION_SQL_MISSING:'+expected);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO|FROM|public\.)/iu);
 assert.match(rollback,/DROP FUNCTION public\.iberfit_qa_m43_owner_projection_v1/u);
 assert.match(rollback,/IS DISTINCT FROM 'QA'/u);
});
test('M43 preserves serialized baseline A/B, recovery and final historical audit, replaces exactly 4 owner snapshots',()=>{
 const writer=readFileSync('scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs','utf8');
 assert.match(writer,/let a=await bootstrap\(clientA\);\s*let b=await bootstrap\(clientB\);\s*const coachRole=await rpc\('iberfit_current_role_v26'/u);
 assert.match(writer,/const observed=await bootstrap\(clientA\)/u);
 assert.match(writer,/const finalA=await bootstrap\(clientA\);\s*const finalForeign=await foreignVisibility\(clientB,'session_execution',execution\.id\);/u);
 assert.match(writer,/CLIENT_HTTP_THREE_SPORT_METRICS/u);
 assert.match(writer,/UNPUBLISHED_SECOND_CYCLE_HIDDEN/u);
 assert.match(writer,/GUIDED_ATOMIC_ENABLEMENT_/u);
 assert.match(writer,/RUNNING_INTERACTIVE_ATOMIC_ENABLEMENT/u);
 assert.equal((writer.match(/ownerProjection\(clientA,/gu)||[]).length,4);
 assert.equal((writer.match(/foreignVisibility\(clientB,/gu)||[]).length,4);
 assert.doesNotMatch(writer,/\b(?:clientVisible|uiClient|runningClient)\b/u);
});
