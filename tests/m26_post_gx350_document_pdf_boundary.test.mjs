import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base='supabase/release-procedures/gx_connected360_document_';
const read=p=>readFileSync(p,'utf8');
const sql=read(base+'pdf_boundary_v1.sql'), undo=read(base+'pdf_boundary_v1.rollback.sql');
const fields=(s,tag)=>Array.from(s.matchAll(new RegExp('\\$'+tag+'\\$([\\s\\S]*?)\\$'+tag+'\\$','g')),m=>m[1]);
const pairs=fields(sql,'anchor').map((a,i)=>[a,fields(sql,'replacement')[i]]);
test('all five exact transforms reverse and check original definition fingerprints',()=>{
 assert.equal(pairs.length,5);
 assert.deepEqual(fields(undo,'anchor'),pairs.map(p=>p[1]));
 assert.deepEqual(fields(undo,'replacement'),pairs.map(p=>p[0]));
 for(const digest of ['61b5ec624800951afd06bfbe2e635490','fc964fabfd797e0a5cd1a8ed3aeb9aee','eb121f1c28f23159cff090bdf0a07590','be55660cd727affe245c5d7b9f8719f4','e7956fc7a0bb237082f10743e6492f36']){assert.ok(sql.includes(digest));assert.ok(undo.includes(digest));}
});
test('existing read-boundary wrappers use parenthesized CASE expressions and exact prior anchors',()=>{
 const prior=fields(read(base+'read_boundaries_v1.sql'),'a');
 assert.equal(pairs[0][0],prior[1]);assert.equal(pairs[1][0],prior[3]);
 for(const [a,b] of pairs.slice(0,2)){assert.ok(a.startsWith('(CASE WHEN'));assert.ok(b.endsWith(' END)'));}
});
test('new PDF gate requires exact current source, revision, published pair and other evidence',()=>{
 for(const value of ["p_source->>'revision' IS DISTINCT FROM p_revision::text",'r.revision=p_revision',"r.status::text='publicado'",'gx_document_publication_current_v1(p_report,p_client,p_source) IS DISTINCT FROM true','gx_document_published_pair_current_v1(p_report,p_client,p_source) IS DISTINCT FROM true','gx_document_other_evidence_current_v1(p_client,p_source) IS DISTINCT FROM true','iberfit_m44_private_issued_source_v1(p_report) IS NOT DISTINCT FROM p_source'])assert.ok(sql.includes(value),value);
});
test('finalizer checks trusted service actor, original Coach, no mixed admin, locks consent before current source recheck',()=>{
 const part=sql.split('CREATE FUNCTION private.gx_document_pdf_service_lock_v1')[1].split('REVOKE ALL ON FUNCTION')[0];
 for(const value of ["current_setting('role',true) IS DISTINCT FROM 'service_role'","r.created_by=p_actor","p.role::text='coach'","a.role::text='admin'",'gx_document_publication_lock_v1(p_report,p_client,p_source)','gx_document_pdf_snapshot_current_v1(p_report,p_client,p_revision,p_source)'])assert.ok(part.includes(value),value);
 assert.ok(part.indexOf('gx_document_publication_lock_v1')<part.indexOf('RETURN private.gx_document_pdf_snapshot_current_v1'));
 const [before,after]=pairs[4];assert.ok(before.includes('GX_DOCUMENT_FINALIZE_EXTERNAL_CLOSED'));assert.ok(after.includes('GX_DOCUMENT_FINALIZE_EXTERNAL_STALE'));
 assert.ok(after.includes('M44_PDF_SOURCE_EVIDENCE_STALE'));
 const original=read('supabase/migrations/20261015214000_m44_pdf_privileged_invoker_guard_v1.sql');const anchor=fields(read(base+'finalize_closed_v1.sql'),'anchor')[0];const patched=original.replace(anchor,after+anchor);
 assert.ok(patched.indexOf('GX_DOCUMENT_FINALIZE_EXTERNAL_STALE')<patched.indexOf("'already-issued'"));
 assert.ok(patched.indexOf('GX_DOCUMENT_FINALIZE_EXTERNAL_STALE')<patched.indexOf('INSERT INTO public.iberfit_evolution_report_issuances_v1'));
});
test('opening and history check external issuance status and current source without modifying ordinary paths',()=>{
 for(const i of [1,3]){assert.ok(pairs[i][1].includes("i.status='issued'"));assert.ok(pairs[i][1].includes('gx_document_pdf_user_current_v1(i.report_id,i.client_id,i.report_revision,i.source_snapshot) IS TRUE'));}
 assert.ok(pairs[2][1].includes('ELSE private.iberfit_gx_report_body_current_v1(p_client,body)'));
});
test('new stage keeps all fences and no API grant or ledger deletion',()=>{
 for(const name of ['gx_document_canonical_closed_v1','gx_document_projected_closed_v1','gx_document_issuance_closed_v1']){assert.ok(sql.includes(name));assert.ok(undo.includes(name));}
 assert.doesNotMatch(sql,/DROP CONSTRAINT|GRANT EXECUTE|DELETE FROM/);assert.doesNotMatch(undo,/CASCADE|DELETE FROM/);
 for(const prior of ['read_boundaries_v1.rollback.sql','storage_boundary_v1.rollback.sql'])assert.ok(read(base+prior).includes('GX_DOCUMENT_ROLLBACK_REQUIRES_PDF_BOUNDARY_ROLLBACK'));
});
test('PG17 synthetic fixture verifies current, stale, forged, foreign, service and withdrawn evidence',()=>{
 const fixture=read('qa/sql/connected360-document/pdf_boundary.sql');for(const x of ['current original Coach PDF','stale issuance revision denied','forged snapshot denied','owner current PDF','foreign owner PDF denied','non-service finalization denied','service original Coach proof','service foreign actor denied','withdrawn owner PDF denied','withdrawn service replay denied','GX_DOCUMENT_PDF_BOUNDARY_PG17_OK'])assert.ok(fixture.includes(x),x);
 assert.ok(read('scripts/data-safety/gx_document_consent_isolated_pg17.sh').includes('pdf_boundary_generated.sql'));
});
