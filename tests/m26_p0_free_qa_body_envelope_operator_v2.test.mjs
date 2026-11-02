import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const files=["supabase/qa-migrations/20261102051000_p0_free_qa_client_body_envelope_dedup_v2.sql","supabase/qa-rollbacks/20261102051000_p0_free_qa_client_body_envelope_dedup_v2.rollback.sql","supabase/qa-rollouts/20261102051000_p0_free_qa_client_body_envelope_dedup_v2.enable.sql"];
const docs=files.map(p=>readFileSync(p,'utf8'));
const extract=sql=>sql.match(/v_patch text := \$p0_patch\$([\s\S]*?)\$p0_patch\$;/u)?.[1];
test('all V2 scripts share identical patch and guard against the original QA source',()=>{
 const [mig,undo,on]=docs;
 const [a,b,c]=docs.map(extract);
 assert.ok(a&&b&&c);
 assert.equal(a,b);assert.equal(a,c);
 for(const s of docs){
  assert.match(s,/aedea9df3d4986496626e10318628c41/u);
  assert.match(s,/P0_QA_PROJECT_ONLY/u);
  assert.match(s,/public\.iberfit_bootstrap_v26\(\)/u);
 }
 assert.match(mig,/P0_BODY_META_FLAG_MUST_BE_OFF/u);
 assert.match(undo,/P0_BODY_META_DISABLE_FLAG_FIRST/u);
 assert.match(on,/P0_QA_SOURCE_DRIFT_OR_PATCH_NOT_APPLIED/u);
 assert.match(on,/free_client_completed_history_demand_qa/u);
});
test('use PostgreSQL JSONB minus text-array to eliminate parser ambiguity',()=>{
 const p=extract(docs[0]);
 const safe="(item->'body') - ARRAY['id','clientId','status','revision','updatedAt']::text[]";
 assert.ok(p.includes(safe));
 assert.doesNotMatch(p,/item->'body'-'id'/u);
 assert.match(p,/WITH ORDINALITY/u);
 assert.match(p,/CASE WHEN item->>'entityType' IN \('planning','session','session_execution'\)/u);
 assert.match(p,/__iberfitQaClientBodyMetaV1/u);
 for(const f of ['results','feedback','blocks'])assert.ok(!safe.includes(f));
});
test('SQL body comparison gates exact matching five fields and no auth bypass',()=>{
 const p=extract(docs[0]);
 for(const name of ['entityId','clientId','status','revision','updatedAt']){
  assert.ok(p.includes("item->'body'->>'"+(name==='entityId'?'id':name)+"'"));
 }
 assert.ok(p.includes("lower(u.email)='qa.rc74.client-a@iberfit.cl'"));
 assert.ok(p.includes("u.id=auth.uid()"));
 assert.ok(p.includes("s.key='environment'"));
 assert.ok(p.includes("s.key='free_client_body_envelope_compact_v1'"));
 assert.doesNotMatch(p,/GRANT|ALTER\s+TABLE|DISABLE\s+ROW\s+LEVEL\s+SECURITY/iu);
});
