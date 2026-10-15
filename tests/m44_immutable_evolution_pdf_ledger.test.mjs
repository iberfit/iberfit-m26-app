import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=()=>readFile(new URL('../supabase/migrations/20261015143500_m44_immutable_evolution_pdf_ledger_v1.sql',import.meta.url),'utf8');

test('M44 PDF ledger is immutable, private and tied to a report revision',async()=>{
 const source=await sql();
 for(const value of ['ENABLE ROW LEVEL SECURITY','REVOKE ALL ON public.iberfit_evolution_report_issuances_v1','source_sha256','artifact_sha256','issue_request_id uuid NOT NULL UNIQUE','UNIQUE(report_id,report_revision)','storage.buckets','public=false'])
   assert.ok(source.includes(value),value);
 assert.match(source,/CREATE TABLE IF NOT EXISTS public\.iberfit_evolution_report_issuances_v1/);
 assert.match(source,/artifact_size_bytes BETWEEN 1024 AND 20971520/);
});
test('M44 PDF API requires authenticated ownership, published consent and immutable source sha256',async()=>{
 const source=await sql();
 assert.match(source,/v_report.status<>'publicado'/);
 assert.match(source,/v_report.audience<>'cliente'/);
 assert.match(source,/is_assigned_coach\(v_report.client_id\)/);
 assert.match(source,/public\.iberfit_client_id\(\) IS DISTINCT FROM v_issue.client_id/);
 assert.match(source,/M44_PDF_FINALIZE_STALE_SOURCE/);
 assert.match(source,/storage\.objects/);
 assert.match(source,/M44_PDF_FINALIZE_ARTIFACT_PATH_INVALID/);
 assert.match(source,/M44_PDF_ISSUANCE_REQUEST_COLLISION/);
 assert.match(source,/M44_PDF_OPEN_SCOPE_FORBIDDEN/);
 assert.match(source,/M44_PDF_WITHDRAW_SCOPE_FORBIDDEN/);
});
test('M44 PDF client source is a published projection with zero private Coach notes',async()=>{
 const source=await sql();
 const publicPayload=source.slice(source.indexOf('v_source:=jsonb_build_object('),source.indexOf('v_source_hash:='));
 for(const field of ['summary','conclusions','recommendations','evidence','activitySeries'])
   assert.ok(publicPayload.includes("'"+field+"'"),field);
 for(const secret of ['coachComment','m44DraftFingerprint','createdBy','evidenceSignature'])
   assert.ok(!publicPayload.includes("'"+secret+"'"),secret);
});


test('M44 only trusted broker may finalize PDFs, with actor-scoped server-derived source hash',async()=>{
 const source=await sql();
 assert.match(source,/M44_PDF_FINALIZE_SERVICE_ONLY/);
 assert.match(source,/current_setting\('request\.jwt\.claim\.role',true\)/);
 assert.match(source,/p_actor_user_id uuid/);
 assert.match(source,/GRANT EXECUTE ON FUNCTION public\.iberfit_m44_finalize_evolution_report_issue_v1\([\s\S]*?\) TO service_role/);
 const finalizeGrant=source.split('\n').filter(line=>line.startsWith('GRANT EXECUTE ON FUNCTION public.iberfit_m44_finalize_evolution_report_issue_v1('));
 assert.equal(finalizeGrant.length,1);
 assert.ok(finalizeGrant[0].endsWith(' TO service_role;'));
 assert.equal(finalizeGrant.some(line=>line.endsWith(' TO authenticated;')),false);
 assert.match(source,/v_source_hash:=encode\(sha256\(convert_to\(v_source::text,'UTF8'\)\),'hex'\)/);
 assert.match(source,/client_assignments a/);
});
