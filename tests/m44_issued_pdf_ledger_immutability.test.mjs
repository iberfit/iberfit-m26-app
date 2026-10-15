import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('M44 PDF issue ledger is append-only and allows only one audited withdrawal transition',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261015145500_m44_pdf_immutable_ledger_write_guard_v1.sql',import.meta.url),'utf8');
 assert.match(sql,/BEFORE UPDATE OR DELETE ON public\.iberfit_evolution_report_issuances_v1/);
 assert.match(sql,/M44_PDF_ISSUED_LEDGER_DELETE_FORBIDDEN/);
 assert.match(sql,/OLD.status<>'issued' OR NEW.status<>'withdrawn'/);
 assert.match(sql,/M44_PDF_ISSUED_LEDGER_ARTIFACT_MUTATION_FORBIDDEN/);
 assert.match(sql,/to_jsonb\(NEW\)-'status'-'withdrawn_at'-'withdrawn_by'-'withdrawn_reason'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
});

test('M44 ledger trigger remains protected by non-destructive CREATE OR REPLACE',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261015145500_m44_pdf_immutable_ledger_write_guard_v1.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE OR REPLACE TRIGGER trg_m44_issued_pdf_immutable/);
 assert.doesNotMatch(sql,/DROP TRIGGER/);
});
