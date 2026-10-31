import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const prefix='20261031024500_p0_qa_client_legacy_execution_projection';
const forward=readFileSync('supabase/qa-migrations/'+prefix+'.sql','utf8');
const rollback=readFileSync('supabase/qa-rollbacks/'+prefix+'.rollback.sql','utf8');
const fn=s=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26_rc29()'));
const original='public.iberfit_m43_client_safe_execution_v1(to_jsonb(e))';
const optimized="public.iberfit_m43_client_safe_execution_v1(jsonb_build_object('id',e.id,'revision',e.revision))";

test('Guard install and rollback against non-QA database and source drift',()=>{
 for(const s of [forward,rollback]){
  for(const term of ["IS DISTINCT FROM 'QA'","IBERFIT_FREE_QA_ONLY","IBERFIT_FREE_SOURCE_DRIFT",
    "SECURITY DEFINER","SET search_path TO ''", "if auth.uid() is null"])assert.ok(s.includes(term),term);
  assert.match(s,/md5\(pg_get_functiondef/);
 }
 assert.ok(forward.includes('a5c997a2c263357a99caacd90524291c'));
 assert.ok(rollback.includes('c21234c41d83aab26ff512efcc206a9b'));
});
test('Exactly one equivalent projection change; Coach/Admin and all data preserved',()=>{
 const before=fn(rollback),after=fn(forward);
 assert.equal(before.split(original).length,2);
 assert.equal(after.split(optimized).length,2);
 assert.equal(before.replace(original,optimized),after);
 assert.ok(after.includes("when v_role='cliente' then "+optimized));
 assert.ok(after.includes("else to_jsonb(e) end"));
});
test('No destructive SQL, DML, ACL changes or data migration',()=>{
 for(const s of [forward,rollback]){
  assert.doesNotMatch(s,/\b(?:TRUNCATE|DELETE FROM|DROP TABLE|INSERT INTO|UPDATE public\.|GRANT|REVOKE|BYPASSRLS)\b/iu);
  assert.doesNotMatch(s,/\b(?:SET ROLE|DISABLE ROW LEVEL SECURITY)\b/iu);
 }
});
