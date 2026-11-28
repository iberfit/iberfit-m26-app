import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const base='supabase/release-procedures/gx_connected360_document_apply_transition_v1';
const sql=read(base+'.sql'),rollback=read(base+'.rollback.sql');
test('staged caller is private; no grants, direct DML or fence removal; pin existing bus and projection',()=>{
 assert.match(sql,/VOLATILE SECURITY INVOKER SET search_path TO ''/);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.gx_document_apply_transition_v1\(uuid,uuid,integer,uuid,text,boolean\) FROM PUBLIC,anon,authenticated,service_role/);
 assert.doesNotMatch(sql,/\bGRANT EXECUTE|\bALTER TABLE|\bINSERT INTO|\bUPDATE public\.|\bDELETE FROM|\bDROP CONSTRAINT/);
 for(const check of ['dda28c8b1b48944adf8fa4c1317224a9','d1ee7050ad8b4a0a1a47d4a52fa62cae','trg_m44_report_client_safe_projection']) assert.ok(sql.includes(check),check);
 assert.match(rollback,/DROP FUNCTION private\.gx_document_apply_transition_v1\(uuid,uuid,integer,uuid,text,boolean\) RESTRICT/);
});
test('original Coach, session, assurance, scope and explicit publication preview are required',()=>{
 for(const check of ["auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'",'private.m26_v49_live_session() IS DISTINCT FROM true',"public.iberfit_current_role_v26() IS DISTINCT FROM 'coach'", "a.role::text='admin'",'public.iberfit_require_privileged_assurance_v65d()',"context->>'organizationId' IS DISTINCT FROM q.organization_id::text",'coach_id=actor',"p_action='publish' AND p_preview_confirmed IS DISTINCT FROM true",'public.is_assigned_coach(q.client_id)']) assert.ok(sql.includes(check),check);
});
test('both transitions use existing bus under report/source/request locks; browser supplies no patch or subject',()=>{
 for(const check of ['pg_try_advisory_xact_lock(hashtextextended','pg_try_advisory_xact_lock(1781042601','command:=private.gx_document_prepare_approval_v1','gx_document_approved_current_v1','gx_document_publication_lock_v1','result:=public.iberfit_execute_command_v26(command)',"'previewConfirmed',true,'targetClientId',q.client_id",'GX_DOCUMENT_TRANSITION_RELOAD_REQUIRED']) assert.ok(sql.includes(check),check);
 assert.ok(sql.indexOf('gx_document_publication_lock_v1')<sql.indexOf('result:=public.iberfit_execute_command_v26(command)'));
 assert.doesNotMatch(sql,/p_body jsonb|p_patch jsonb|p_client uuid|p_evidence/);
 assert.match(sql,/required_revision:=q.report_revision::bigint;\s*IF p_action='publish' THEN required_revision:=required_revision\+1; END IF;\s*IF p_expected_revision::bigint IS DISTINCT FROM required_revision/);
 assert.doesNotMatch(sql,/IF p_expected_revision::bigint IS DISTINCT FROM [^\n;]*CASE/);
});
test('ACK alone is insufficient; exact canonical receipt and readback are required and exceptions roll back',()=>{
 for(const check of ["result->>'kind' IS DISTINCT FROM 'ack'", "result->>'operationId' IS DISTINCT FROM p_operation::text", "result->>'remoteRevision' IS DISTINCT FROM next_revision::text", "result->'duplicate' IS DISTINCT FROM 'false'::jsonb",'receipt.actor_user_id IS DISTINCT FROM actor','receipt.entity_id IS DISTINCT FROM p_report','receipt.client_id IS DISTINCT FROM q.client_id','receipt.command_type IS DISTINCT FROM expected_type','receipt.base_revision IS DISTINCT FROM p_expected_revision::bigint','receipt.remote_revision IS DISTINCT FROM next_revision','GX_DOCUMENT_TRANSITION_RECEIPT_INVALID','GX_DOCUMENT_TRANSITION_READBACK_INVALID','gx_document_published_pair_current_v1(p_report,q.client_id,r.content) IS DISTINCT FROM true'])assert.ok(sql.includes(check),check);
 assert.ok(sql.indexOf('GX_DOCUMENT_TRANSITION_RECEIPT_INVALID')<sql.indexOf("RETURN jsonb_build_object('schema','iberfit.connected360.document-transition.v1'"));
});
test('PG17 scenario uses actual wrapper and projection with clearly synthetic bus, forces rollback on ACK, receipt and readback faults',()=>{
 const fixture=read('qa/sql/connected360-document/private_read.sql'),harness=read('scripts/data-safety/gx_document_consent_isolated_pg17.sh');
 for(const check of ['exact original draft restored',"ARRAY['ack','receipt','projection']",'invalid transition receipt rolled back','invalid transition projection rolled back','invalid transition canonical rolled back','transaction approval with exact receipt and readback','publish requires explicit preview','transaction publication with exact receipt and readback','GX_DOCUMENT_TRANSITION_ADAPTER_PG17_OK','synthetic adapter'])assert.ok(fixture.includes(check),check);
 assert.match(harness,/prepare_approval','CREATE FUNCTION private\.gx_document_prepare_approval_v1/);
 assert.match(harness,/apply_transition','CREATE FUNCTION private\.gx_document_apply_transition_v1/);
 assert.match(fixture,/ROLLBACK;\s*\\echo GX_DOCUMENT_PRIVATE_READ_PG17_OK/);
});
