import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=()=>readFile(new URL('../supabase/functions/iberfit-evolution-report-emission-v1/index.ts',import.meta.url),'utf8');
test('M44 server emits its own PDF from the authorized published source, never browser content',async()=>{
 const t=await source();
 assert.match(t,/callRpc<Prepared>\(user,'iberfit_m44_prepare_evolution_report_issue_v1'/);
 assert.match(t,/renderEvolutionReportPdf\(/);
 assert.doesNotMatch(t,/body\.pdf|body\.pdfBytes|body\.sourceSnapshot|body\.clientName/);
 assert.match(t,/M44_PDF_SOURCE_AUTHORIZATION_INVALID/);
 assert.match(t,/upsert:false/);
 assert.match(t,/download\(path\)/);
 assert.match(t,/M44_PDF_STORAGE_CHECKSUM_MISMATCH/);
 assert.match(t,/callRpc<Finalized>\(service,'iberfit_m44_finalize_evolution_report_issue_v1'/);
 assert.match(t,/p_actor_user_id:actor/);
});
test('M44 broker enforces strict origin, JWT, no-store, per-request idempotency and short URLs',async()=>{
 const t=await source();
 for(const claim of ["auth.getUser(","Access-Control-Allow-Origin","Cache-Control","no-store",
 "M44_PDF_ORIGIN_FORBIDDEN","M44_PDF_ISSUE_REPLAY_COLLISION","already-issued","expiresIn:120",
 "M44_PDF_WITHDRAW_REASON_INVALID","M44_PDF_ISSUANCE_NOT_AVAILABLE"])
 assert.ok(t.includes(claim),claim);
});
