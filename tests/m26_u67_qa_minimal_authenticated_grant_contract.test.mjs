import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/qa-migrations/20261105_u67_u60_authenticated_certification_only_qa.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261105_u67_u60_authenticated_certification_only_qa.rollback.sql',import.meta.url),'utf8');
const grantStatements=(source)=>[...source.replace(/^[ 	]*--[^\n]*/gm,'').matchAll(/^[ 	]*GRANT[ 	]+[\s\S]*?;/gm)].map(m=>m[0].trim());
const expectedGrantStatements=[
  'GRANT EXECUTE ON FUNCTION public.iberfit_occurrence_api_u60_v1(text,jsonb)\n  TO authenticated;',
  'GRANT EXECUTE ON FUNCTION public.iberfit_occurrence_detail_v1(uuid,uuid)\n  TO authenticated;',
];
test('U67 target QA only and canonical U60 prereqs',()=>{
 assert.match(sql,/gjztkdwfmunnzhtvxrsu/);
 assert.match(sql,/20261104150000/);
 assert.match(sql,/20261105003645/);
 assert.match(sql,/u60_dated_execution_update_receipt/);
 assert.match(sql,/U67_QA_ONLY_PRE_GRANT_SECURITY_GATE_FAILED/);
});
test('U67 authorizes precisely two closed-stage public functions to authenticated',()=>{
 const grants=[...sql.matchAll(/^GRANT EXECUTE ON FUNCTION\s+([^\n]+)\n\s+TO authenticated;/gm)].map(x=>x[1]);
 assert.deepEqual(grants,[
   'public.iberfit_occurrence_api_u60_v1(text,jsonb)',
   'public.iberfit_occurrence_detail_v1(uuid,uuid)',
 ]);
 assert.deepEqual(grantStatements(sql),expectedGrantStatements);
 // The word public. is a schema prefix, not a grant to the PUBLIC role.
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION private\./);
 assert.match(sql,/has_function_privilege\('service_role'/);
 assert.match(sql,/has_function_privilege\('anon'/);
});
test('U67 rejects rogue grants to anon, service_role, or PUBLIC without confusing public schema',()=>{
 for(const role of ['anon','service_role','PUBLIC']){
   const altered=sql+'\nGRANT EXECUTE ON FUNCTION public.iberfit_occurrence_api_u60_v1(text,jsonb) TO '+role+';';
   assert.notDeepEqual(grantStatements(altered),expectedGrantStatements,role);
 }
});
test('U67 rollback only removes new grants and never affects records',()=>{
 assert.match(rollback,/REVOKE EXECUTE ON FUNCTION public\.iberfit_occurrence_api_u60_v1/);
 assert.match(rollback,/REVOKE EXECUTE ON FUNCTION public\.iberfit_occurrence_detail_v1/);
 assert.doesNotMatch(rollback,/\b(?:DROP|DELETE|UPDATE|TRUNCATE|INSERT)\b/gi);
 assert.equal((rollback.match(/REVOKE EXECUTE/g)||[]).length,2);
});
