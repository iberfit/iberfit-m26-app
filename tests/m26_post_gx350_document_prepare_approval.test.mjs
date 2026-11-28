import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const path='supabase/release-procedures/gx_connected360_document_prepare_approval_v1';
const sql=read(path+'.sql'),rollback=read(path+'.rollback.sql');
test('internal only: no public grants, fence changes, writes, or execution of commands',()=>{
 assert.match(sql,/VOLATILE SECURITY INVOKER SET search_path TO ''/);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.gx_document_prepare_approval_v1\(uuid,uuid,integer,uuid\) FROM PUBLIC,anon,authenticated,service_role/);
 assert.doesNotMatch(sql,/\bGRANT EXECUTE|\bALTER TABLE|\bINSERT INTO|\bUPDATE public\.|\bDELETE FROM|PERFORM public\.iberfit_execute_command/);
 assert.match(rollback,/DROP FUNCTION private\.gx_document_prepare_approval_v1\(uuid,uuid,integer,uuid\) RESTRICT/);
});
test('only exact live original Coach, organization and revision; existing assurance',()=>{
 for(const s of ["public.iberfit_current_role_v26() IS DISTINCT FROM 'coach'",'private.m26_v49_live_session() IS DISTINCT FROM true',"a.role::text='admin'",'public.iberfit_require_privileged_assurance_v65d()',"context->>'organizationId' IS DISTINCT FROM q.organization_id::text",'coach_id=actor AND report_revision=p_expected_revision','public.is_assigned_coach(q.client_id)'])assert.ok(sql.includes(s),s);
});
test('canonical and projection must match exactly, both remain private',()=>{
 for(const s of ["d.status::text='borrador' AND d.revision=p_expected_revision FOR UPDATE NOWAIT", "status::text='borrador' AND audience='coach' AND report_type='weekly' FOR UPDATE NOWAIT",'canonical IS DISTINCT FROM r.content',"r.content->'visibleToClient' IS DISTINCT FROM 'false'::jsonb",'private.gx_document_draft_sha_v1(r) IS DISTINCT FROM q.draft_sha256'])assert.ok(sql.includes(s),s);
});
test('existing locked source proof and expected material, professional evidence independently validated',()=>{
 for(const s of ['private.gx_document_request_proof_v1(q)',"proof->>'evidenceSha256' IS DISTINCT FROM q.evidence_sha256",'private.gx_document_expected_publication_body_v1(r,q.id,proof)','private.gx_document_publication_material_sha_v1(r.id,r.client_id,body) IS DISTINCT FROM q.publication_sha256','private.gx_document_other_evidence_current_v1(r.client_id,body) IS DISTINCT FROM true'])assert.ok(sql.includes(s),s);
});
test('request lock precedes fresh accepted check, then command handoff; contention fails closed',()=>{
 const positions=['pg_try_advisory_xact_lock(hashtextextended','pg_try_advisory_xact_lock(1781042601','FOR UPDATE NOWAIT','proof:=private.gx_document_request_proof_v1','WHERE id=q.id FOR UPDATE','private.gx_document_accepted_material_matches_v1(r.id,r.client_id,body)','RETURN jsonb_build_object(\'operationId\''].map(s=>sql.indexOf(s));
 assert.ok(positions.every((p,i)=>p>=0&&(i===0||p>positions[i-1])));
 assert.match(sql,/EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'GX_DOCUMENT_APPROVAL_BUSY'/);
});
test('handoff uses existing approval command, not publication; only server-generated evidence patch',()=>{
 assert.match(sql,/'type','INFORME_APROBAR','entityType','report','entityId',r.id,'clientId',r.client_id,'baseRevision',r.revision,'conflictSensitive',true/);
 assert.match(sql,/'payload',jsonb_build_object\('patch',jsonb_build_object\('evidence',body->'evidence'\)\)/);
 assert.doesNotMatch(sql,/INFORME_PUBLICAR|p_body jsonb|p_evidence|p_client uuid/);
});
