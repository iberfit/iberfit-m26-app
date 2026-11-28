import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const base='supabase/release-procedures/gx_connected360_document_bootstrap_boundary_v1';
const sql=read(base+'.sql'),undo=read(base+'.rollback.sql');
test('guard all actual authenticated bootstrap roots with exact environment hashes; retain closed fences',()=>{
 for(const x of ['e460264e965db3688709101bc30e10fa','aedea9df3d4986496626e10318628c41','e1ff01e23ee9d40e818a2dba320c3ae1']){assert.ok(sql.includes(x));assert.ok(undo.includes(x));}
 for(const x of ["WHEN 'QA'","WHEN 'PRODUCTION'",'gx_document_bootstrap_filter_v1(v_payload)','gx_document_bootstrap_filter_v1(private.iberfit_bootstrap_v26_full_core_internal_u37_qa())','gx_document_issuance_closed_v1'])assert.ok(sql.includes(x),x);
 assert.doesNotMatch(sql,/DROP CONSTRAINT|GRANT EXECUTE|DELETE FROM/);assert.doesNotMatch(undo,/CASCADE|DELETE FROM/);
});
test('exact scope, revision, private coach and client-safe projection; revision map hidden',()=>{
 for(const x of ["role_name<>'coach'",'d.body=body','d.revision::text=p_row','r.revision::text IS DISTINCT FROM','gx_document_read_scope_v1(v_report_id,v_client_id,r.content,true)','body=expected',"r.status::text='publicado'",'remoteRevisions','ANY(blocked)','GX_DOCUMENT_BOOTSTRAP_ENVELOPE_INVALID'])assert.ok(sql.includes(x),x);
 assert.ok(read('qa/sql/connected360-document/bootstrap_boundary_after_withdraw.sql').includes('withdrawn Coach canonical and revision hidden'));
});
