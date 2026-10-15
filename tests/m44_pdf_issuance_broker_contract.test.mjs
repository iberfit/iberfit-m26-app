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


test('M44 lost ACK after database finalization can never delete the issued immutable PDF',async()=>{
 const t=await source();
 assert.match(t,/let uploaded=false,finalizeStarted=false/);
 assert.match(t,/finalizeStarted=true;\s*const persisted=await callRpc<Finalized>/);
 assert.match(t,/if\(uploaded&&!finalizeStarted\)/);
 assert.doesNotMatch(t,/if\(uploaded\)await service\.storage\.from\(BUCKET\)\.remove/);
 assert.match(t,/issueRequestId/);
});


test('M44 latest PDF version is selected server-side but only released through user-scoped authorization',async()=>{
 const text=await source();
 const start=text.indexOf('async function latest(');
 const end=text.indexOf('Deno.serve(',start);
 assert.ok(start>0&&end>start);
 const method=text.slice(start,end);
 assert.match(method,/\.eq\('report_id',id\)/);
 assert.match(method,/\.eq\('status','issued'\)/);
 assert.match(method,/callRpc<Access>\(user,'iberfit_m44_authorize_evolution_report_pdf_v1'/);
 assert.match(method,/M44_PDF_ISSUANCE_NOT_AVAILABLE/);
 assert.match(text,/else if\(action==='latest'\)data=await latest/);
 assert.doesNotMatch(method,/service\.storage\.from\(BUCKET\)\.download/);
});
