import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expandQaClientCanonicalBodyEnvelope} from '../src/m26/production-state.js';

const UUID='10000000-0000-4000-8000-000000000001';
const ENTITY_ID='20000000-0000-4000-8000-000000000002';
const STATUS='completado',AT='2026-10-31T12:00:00.000Z';
const MARK='__iberfitQaClientBodyMetaV1';
const data=()=>({
 entityType:'session_execution',entityId:ENTITY_ID,clientId:UUID,status:STATUS,
 revision:3,updatedAt:AT,
 body:{id:ENTITY_ID,clientId:UUID,status:STATUS,revision:3,updatedAt:AT,
  sessionId:'30000000-0000-4000-8000-000000000003',
  results:[{distanceKm:6.5,pace:'5:30',sets:[{load:21,reps:8}]}],
  feedback:{effort:'moderate'}},
});
const envelope=(entity=data())=>({
 environment:'QA',canary:{active:true,scope:'allowlist'},
 user:{role:'cliente',id:'40000000-0000-4000-8000-000000000004',clientId:UUID},
 data:{m26Entities:[entity],sessionExecutions:[{id:ENTITY_ID}],remoteRevisions:{}},
});
const compact=entity=>{
 const b={...entity.body};
 for(const k of ['id','clientId','status','revision','updatedAt'])delete b[k];
 return {...entity,body:b,[MARK]:1};
};
test('exact reconstruction of canonical session/execution/planning JSON and results',()=>{
 const original=data();
 for(const type of ['session_execution','session','planning']){
  const full={...original,entityType:type};
  const before=envelope(full),after=envelope(compact(full));
  assert.deepEqual(expandQaClientCanonicalBodyEnvelope(after),before);
  const parsed=expandQaClientCanonicalBodyEnvelope(after);
  assert.equal(parsed.data.m26Entities[0].body.results[0].distanceKm,6.5);
  assert.deepEqual(parsed.data.m26Entities[0].body.feedback,{effort:'moderate'});
  assert.equal(JSON.stringify(after).includes(MARK),true);
  assert.equal(JSON.stringify(parsed).includes(MARK),false);
 }
});
test('default path returns original reference without mutation',()=>{
 const v=envelope();
 assert.equal(expandQaClientCanonicalBodyEnvelope(v),v);
});
test('fail-closed outside QA Client and stale owner; never accept conflicting body',()=>{
 const original=envelope(compact(data()));
 const wrong=[
  {...original,environment:'PROD'},
  {...original,user:{...original.user,role:'admin'}},
  {...original,canary:{...original.canary,active:false}},
  {...original,canary:{...original.canary,scope:'public'}},
  {...original,user:{...original.user,clientId:ENTITY_ID}},
  {...original,data:{...original.data,m26Entities:[{...compact(data()),[MARK]:true}]}},
  {...original,data:{...original.data,m26Entities:[{...compact(data()),body:{...compact(data()).body,id:ENTITY_ID}}]}},
  {...original,data:{...original.data,m26Entities:[{...compact(data()),revision:-1}]}},
  {...original,data:{...original.data,m26Entities:[{...compact(data()),entityType:'private_note'}]}},
 ];
 for(const fixture of wrong)assert.throws(()=>expandQaClientCanonicalBodyEnvelope(fixture),
  /M26_QA_BODY_META_(?:SCOPE_FORBIDDEN|OWNER_REQUIRED|INVALID)/u);
});
test('mixed unmarked entities are preserved and compacted ones restored',()=>{
 const marked=compact(data()),unmarked={entityType:'habit',body:{status:'active'}};
 const v=envelope(marked);v.data.m26Entities.push(unmarked);
 const r=expandQaClientCanonicalBodyEnvelope(v);
 assert.deepEqual(r.data.m26Entities,[data(),unmarked]);
 assert.deepEqual(v.data.m26Entities,[marked,unmarked]);
});
test('wire must be expanded only after size and identity verification and before state projection',()=>{
 const source=readFileSync('src/m26/production-state.js','utf8');
 const pos1=source.indexOf('const envelope=assertProductionSnapshot(rawSnapshot)');
 const pos2=source.indexOf('expandQaClientCanonicalBodyEnvelope(envelope)');
 const pos3=source.indexOf('const rawCollections = reconcileCanonicalTrainingCollections(');
 assert.ok(pos1>=0&&pos2>pos1&&pos3>pos2);
});
test('migration and rollback must be QA-only, hash guarded and default-off',()=>{
 const m=readFileSync('supabase/qa-migrations/20261102015500_p0_free_qa_client_body_envelope_dedup_v1.sql','utf8');
 const r=readFileSync('supabase/qa-rollbacks/20261102015500_p0_free_qa_client_body_envelope_dedup_v1.rollback.sql','utf8');
 assert.ok(m.includes("md5(v_source) <> 'aedea9df3d4986496626e10318628c41'"));
 assert.ok(m.includes('P0_BODY_META_FLAG_MUST_BE_OFF'));
 assert.ok(m.includes("qa.rc74.client-a@iberfit.cl"));
 assert.ok(m.includes("WITH ORDINALITY"));
 assert.ok(r.includes("md5(v_previous)<>'aedea9df3d4986496626e10318628c41'"));
 assert.ok(r.includes('P0_BODY_META_DISABLE_FLAG_FIRST'));
 assert.doesNotMatch(m,/GRANT\s+|ALTER\s+TABLE|DROP\s+TABLE/iu);
});

test('QA live history probe records marker shape without storing private values',()=>{
 const body=readFileSync('qa/p0-free-history/live-client-a-cases.mjs','utf8');
 assert.match(body,/canonicalBodyMeta=\{eligible:compactedBodies\.length,invalid:invalidBodies\.length\}/u);
 assert.match(body,/canonicalBodyMeta\.invalid/u);
 assert.match(body,/M26_QA_BODY_META_EXPECT_ACTIVE/u);
 assert.match(body,/compact\.sessions\.resolved/u);
 assert.match(body,/compact\.executions\.resolved/u);
 assert.match(body,/chromiumNetworkBodyBytes/u);
 assert.doesNotMatch(body,/console\.log\(.*compactedBodies/u);
});

test('feature enable script is guarded by exact outer source and prior Client history flags',()=>{
 const sql=readFileSync('supabase/qa-rollouts/20261102015500_p0_free_qa_client_body_envelope_dedup_v1.enable.sql','utf8');
 assert.match(sql,/P0_QA_SOURCE_DRIFT_OR_PATCH_NOT_APPLIED/u);
 assert.match(sql,/free_client_completed_history_demand_qa/u);
 assert.match(sql,/free_client_compact_legacy_refs_qa/u);
 assert.match(sql,/free_client_hide_qa_fixture_checkin_revisions_v1/u);
 assert.match(sql,/md5\(v_original\)/u);
 assert.ok(sql.includes('public.iberfit_bootstrap_v26()'));
 assert.doesNotMatch(sql,/ALTER\s+TABLE|GRANT\s+/iu);
});
