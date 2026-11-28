import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const base='supabase/release-procedures/gx_connected360_document_';
const sql=read(base+'finalize_closed_v1.sql'),rollback=read(base+'finalize_closed_v1.rollback.sql');
const migration=read('supabase/migrations/20261015214000_m44_pdf_privileged_invoker_guard_v1.sql');
const guard=s=>s.split('$guard$')[1],anchor=s=>s.split('$anchor$')[1];
test('exact existing finalizer is transformed once before idempotent return and insert, preserving all other checks',()=>{
 const a=anchor(sql),g=guard(sql);assert.equal(migration.split(a).length,2);
 const candidate=migration.replace(a,g+a);assert.equal(candidate.replace(g+a,a),migration);
 assert.ok(candidate.indexOf('GX_DOCUMENT_FINALIZE_EXTERNAL_CLOSED')<candidate.indexOf("'already-issued'"));
 assert.ok(candidate.indexOf('M44_PDF_SOURCE_EVIDENCE_STALE')<candidate.indexOf("'already-issued'"));
 assert.ok(candidate.indexOf('M44_PDF_SOURCE_EVIDENCE_STALE')<candidate.indexOf('INSERT INTO public.iberfit_evolution_report_issuances_v1'));
 assert.match(g,/gx_document_has_external_v1\(v_report\.content\) OR private\.gx_document_has_external_v1\(v_source\)/);
 assert.match(g,/IF private\.iberfit_gx_report_body_has_refs_v1\(v_source\) THEN[\s\S]*pg_advisory_xact_lock\(1781042601[\s\S]*iberfit_gx_report_body_current_v1/);
});
test('install and reverse are exact, require three fences and retain service-only ACL',()=>{
 assert.equal(guard(sql),guard(rollback));assert.equal(anchor(sql),anchor(rollback));
 for(const s of [sql,rollback])assert.match(s,/e7956fc7a0bb237082f10743e6492f36/);
 assert.match(sql,/contype='c' AND convalidated/); assert.match(sql,/<>3/);
 assert.match(sql,/NOT has_function_privilege\('service_role'/);assert.match(sql,/OR has_function_privilege\('authenticated'/);assert.match(sql,/OR has_function_privilege\('anon'/);
 assert.doesNotMatch(sql,/GRANT EXECUTE|DROP CONSTRAINT|DELETE FROM/);
 assert.match(read(base+'closed_fence_v1.rollback.sql'),/GX_DOCUMENT_FINALIZE_EXTERNAL_CLOSED/);
});
test('isolated PG17 stage runs exact migration, checks stale retry, regular retry, no duplicate events and exact rollback',()=>{
 const f=read('qa/sql/connected360-document/finalize_closed.sql');
 assert.match(f,/\\ir .*20261015214000_m44_pdf_privileged_invoker_guard_v1.sql/);
 assert.match(f,/SET ROLE service_role/);assert.match(f,/GX_STALE_RETRY_UNEXPECTEDLY_ALLOWED/);assert.match(f,/ordinary retry unaffected/);assert.match(f,/no duplicated ledger\/events/);assert.match(f,/exact original finalizer restored/);assert.match(f,/fence retained/);
 const runner=read('scripts/data-safety/gx_document_consent_isolated_pg17.sh');assert.match(runner,/CREATE DATABASE gx_finalize_test/);assert.match(runner,/-d gx_finalize_test -f \/repo\/qa\/sql\/connected360-document\/finalize_closed.sql/);
});
