import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPublicationCommand} from '../src/m26/workflows/publication-workflow.js';
const base='supabase/release-procedures/gx_connected360_document_bus_boundary_v1';
const sql=readFileSync(base+'.sql','utf8'),rollback=readFileSync(base+'.rollback.sql','utf8');
const guard=sql.slice(sql.indexOf('CREATE FUNCTION private.gx_document_generic_rejection_v1'),sql.indexOf('CREATE OR REPLACE FUNCTION public.iberfit_execute_command_v26'));
const publicBody=sql.split('CREATE OR REPLACE FUNCTION public.iberfit_execute_command_v26')[1].split('AS $f$')[1].split('$f$;')[0];
test('staged boundary pins the exact existing outer bus, not a historical bypass; no API grants or fence removal',()=>{
 for(const v of ['dda28c8b1b48944adf8fa4c1317224a9','pg_get_functiondef','proowner=','prosecdef','gx_document_canonical_closed_v1','gx_document_projected_closed_v1','gx_document_issuance_closed_v1','REVOKE ALL ON FUNCTION private.gx_document_bus_internal_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role','result:=private.gx_document_bus_internal_v1(command);'])assert.ok(sql.includes(v),v);
 assert.doesNotMatch(sql,/\bGRANT EXECUTE|\bDROP CONSTRAINT|\bALTER TABLE|\bINSERT INTO|\bDELETE FROM|\bUPDATE public\./);
 assert.doesNotMatch(sql,/return public\.iberfit_execute_command_v26_pre_/i);
});
test('generic evidence denied before receipt fast path; both ordinary and private routes call exact internal bus',()=>{
 assert.ok(publicBody.indexOf('gx_document_generic_rejection_v1')<publicBody.indexOf('gx_document_bus_internal_v1'));
 for(const v of ["p_command#>'{payload,patch}'","gx_document_has_external_v1(patch)","gx_document_has_external_v1(p_command->'payload')","gx_document_has_external_v1(p_command)","GX_DOCUMENT_AUTHORIZED_TRANSITION_REQUIRED"])assert.ok(guard.includes(v),v);
 assert.match(publicBody,/IF rejection IS NOT NULL THEN\s+RETURN jsonb_build_object\('kind','rejected'/);
});
test('only scoped report checks acquire existing lock and compare both stores; nonreports and invalid IDs delegate',()=>{
 for(const v of ["p_command->>'entityType' IS DISTINCT FROM 'report'","EXCEPTION WHEN invalid_text_representation THEN RETURN NULL",'auth.uid() IS NULL',"public.iberfit_current_role_v26(),'') NOT IN ('coach','admin')",'public.iberfit_can_access_client_v26(v_client_id)',"pg_try_advisory_xact_lock(hashtextextended('report:'||v_report_id::text,0))",'GX_DOCUMENT_COMMAND_BUSY','d.client_id=v_client_id','r.client_id=v_client_id','gx_document_has_external_v1(d.body)','gx_document_has_external_v1(r.content)'])assert.ok(guard.includes(v),v);
 assert.ok(guard.indexOf('public.iberfit_can_access_client_v26')<guard.indexOf('FROM public.domain_entities_v26'));
 assert.ok(guard.indexOf('pg_try_advisory_xact_lock')<guard.indexOf('FROM public.domain_entities_v26'));
});
test('existing UI withdrawal metadata is allowed without authorizing content edits',()=>{
 const command=buildPublicationCommand({entity:'report',action:'withdraw',record:{id:'10000000-0000-4000-8000-000000000001',clientId:'10000000-0000-4000-8000-000000000002',status:'publicado',revision:3},role:'coach',reason:'Solicitud del cliente',now:()=>new Date('2026-11-28T10:00:00Z')});
 assert.equal(command.type,'INFORME_RETIRAR');
 assert.deepEqual(Object.keys(command.payload.patch).sort(),['reason','status','visibleToClient','withdrawnAt']);
 for(const v of ["ARRAY['status','withdrawnAt','visibleToClient','reason']","patch->>'status'=terminal_status","patch->'visibleToClient'='false'::jsonb","length(patch->>'reason')<=1000","terminal_status:='anulado'"])assert.ok(guard.includes(v),v);
 assert.doesNotMatch(guard,/IF[^\n]*CASE[^\n]*THEN/);
});
test('rollback must retain closed fences, refuse material and restore exact old wrapper without overwriting drift',()=>{
 assert.equal(rollback.split('$body$')[1],publicBody);
 for(const v of ['GX_DOCUMENT_BUS_ROLLBACK_REQUIRES_CLOSED_FENCE','GX_DOCUMENT_BUS_WRAPPER_ROLLBACK_DRIFT','GX_DOCUMENT_BUS_TRANSITION_ROLLBACK_DRIFT','dda28c8b1b48944adf8fa4c1317224a9','result:=public.iberfit_execute_command_v26(command);','DROP FUNCTION private.gx_document_bus_internal_v1(jsonb) RESTRICT'])assert.ok(rollback.includes(v),v);
 assert.doesNotMatch(rollback,/\bDELETE FROM|\bDROP TABLE|\bCASCADE/);
});
test('new isolated fixture exercises exact helper/wrapper using synthetic bus and leaves V3.1 fixture intact',()=>{
 const harness=readFileSync('scripts/data-safety/gx_document_consent_isolated_pg17.sh','utf8');
 const fixture=readFileSync('qa/sql/connected360-document/bus_boundary.sql','utf8');
 for(const v of ['forged input denied','direct publication denied','existing receipt cannot bypass guard','direct internal call denied','ordinary UI withdrawal metadata allowed','withdrawal cannot erase evidence','ordinary report delegates','GX_DOCUMENT_BUS_BOUNDARY_PG17_OK'])assert.ok(fixture.includes(v),v);
 assert.ok(harness.includes("extra=extra.replace(extra_marker,boundary[boundary.index(start):boundary.rindex('COMMIT;')])"));
 assert.ok(harness.includes('fixture=fixture.replace(final_rollback,extra+'));
});
