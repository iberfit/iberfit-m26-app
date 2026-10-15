import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('M44 Edge service can read issue ledger while anonymous and authenticated remain denied',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261015150500_m44_service_ledger_read_acl_v1.sql',import.meta.url),'utf8');
 assert.match(sql,/REVOKE ALL ON public\.iberfit_evolution_report_issuances_v1 FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT SELECT ON public\.iberfit_evolution_report_issuances_v1 TO service_role/);
 assert.match(sql,/has_table_privilege\('service_role'/);
 assert.match(sql,/has_table_privilege\('authenticated'/);
 assert.match(sql,/has_table_privilege\('anon'/);
 assert.match(sql,/rolbypassrls/);
 assert.doesNotMatch(sql,/GRANT (INSERT|UPDATE|DELETE|TRUNCATE)/);
});
