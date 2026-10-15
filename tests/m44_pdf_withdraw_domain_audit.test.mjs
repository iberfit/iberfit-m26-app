import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=()=>readFile(new URL('../supabase/migrations/20261015150000_m44_pdf_withdraw_domain_audit_v1.sql',import.meta.url),'utf8');
test('M44 withdrawn PDF is both ledger updated and audited as a single canonical transaction',async()=>{
 const text=await sql();
 assert.match(text,/FOR UPDATE/);
 assert.match(text,/IF v_issue.status='withdrawn'/);
 assert.match(text,/UPDATE public.iberfit_evolution_report_issuances_v1/);
 assert.match(text,/INSERT INTO public.domain_events_v26/);
 assert.match(text,/'INFORME_PDF_RETIRAR_M44'/);
 assert.match(text,/'issued','withdrawn'/);
 assert.match(text,/v_issue.report_revision,v_issue.report_revision/);
 assert.match(text,/gen_random_uuid\(\)/);
 const update=text.indexOf('UPDATE public.iberfit_evolution_report_issuances_v1');
 const event=text.indexOf('INSERT INTO public.domain_events_v26');
 const result=text.indexOf("'kind','withdrawn'");
 assert.ok(update>0&&event>update&&result>event);
});
