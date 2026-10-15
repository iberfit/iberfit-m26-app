import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {findDestructiveSql} from '../scripts/data-safety/check_migration_safety.mjs';
const names=["20261015141500_m44_public_table_truncate_acl_guard.sql","20261015142500_m44_bootstrap_private_reports_http_fence_v1.sql","20261015143000_m44_report_command_only_write_boundary_v1.sql","20261015143500_m44_immutable_evolution_pdf_ledger_v1.sql","20261015150500_m44_service_ledger_read_acl_v1.sql","20261015151000_m44_privileged_assurance_fence_v1.sql"];
test('M44 candidate migrations pass production safety scanner with no exception',async()=>{
 for(const n of names){
  const sql=await readFile(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
  assert.deepEqual(findDestructiveSql(sql),[],n);
 }
});
test('M44 bootstrap projection is frozen static SQL, never dynamic function rewriting',async()=>{
 const s=await readFile(new URL('../supabase/migrations/20261015142500_m44_bootstrap_private_reports_http_fence_v1.sql',import.meta.url),'utf8');
 assert.match(s,/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26/);
 assert.match(s,/m44_bootstrap_baseline_changed_review_required/);
 assert.match(s,/M44_REPORT_BOOTSTRAP_PRIVATE_PROJECTION_V1/);
 assert.doesNotMatch(s,/\bEXECUTE\s+replace\(/i);
 assert.doesNotMatch(s,/\bDO\s+\$/i);
});
