import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=()=>readFile(new URL('../supabase/migrations/20261015151000_m44_privileged_assurance_fence_v1.sql',import.meta.url),'utf8');
test('M44 authenticates every privileged backend report RPC against existing verified session',async()=>{
 const s=await sql();
 assert.match(s,/iberfit_privileged_assurance_context_v65d\(\)/);
 assert.match(s,/M44_PRIVILEGED_ASSURANCE_REQUIRED/);
 assert.match(s,/auth\.uid\(\)/);
 for(const fn of ['create_report_draft','prepare_evolution_report_issue','withdraw_evolution_report_pdf']){
  assert.match(s,new RegExp('CREATE FUNCTION public\\.iberfit_m44_'+fn+'_v1\\('));
 }
 assert.match(s,/public\.iberfit_m44_require_privileged_assurance_v1\(\)/g);
 assert.match(s,/REVOKE ALL ON FUNCTION public\.iberfit_m44_withdraw_evolution_report_pdf_impl_v1/);
 assert.match(s,/has_function_privilege\('authenticated'/);
});
test('M44 Edge forwards only previously approved Origin for session-bound assurance',async()=>{
 const source=await readFile(new URL('../supabase/functions/iberfit-evolution-report-emission-v1/index.ts',import.meta.url),'utf8');
 assert.match(source,/if\(!appOrigin\|\|!allowed\.has\(origin\)\)/);
 assert.match(source,/global:\{headers:\{Authorization:auth,Origin:origin\}\}/);
 assert.match(source,/const \{user,service\}=clients\(bearer,origin\)/);
});
