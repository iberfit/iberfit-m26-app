-- Additional synthetic test after bus_boundary.sql, inside its rollback-only
-- transaction. Exact new storage triggers, with the existing synthetic bus.
-- Restore the authorized private draft before installing the extra guards.
UPDATE public.domain_entities_v26 d SET status='borrador',revision=1,
 body=jsonb_set(s.body,'{evidence}',(s.body->'evidence')-(-1)) FROM gx_test.scenarios s WHERE d.entity_id=s.report_id;
UPDATE public.reports r SET status='borrador',audience='coach',revision=1,
 content=jsonb_set(s.body,'{evidence}',(s.body->'evidence')-(-1)) FROM gx_test.scenarios s WHERE r.id=s.report_id;
SELECT gx_test.assert(bool_and(private.gx_document_draft_sha_v1(r)=s.draft_sha),'storage exact original draft restored') FROM public.reports r JOIN gx_test.scenarios s ON r.id=s.report_id;
-- Exercise the canonical upsert shape used by the hosted RC29 persistence,
-- not just a plain UPDATE (which skips the BEFORE INSERT trigger).
CREATE UNIQUE INDEX gx_test_canonical_identity ON public.domain_entities_v26(entity_type,entity_id);
DO $fixture$ DECLARE d text; a text:='result:=public.iberfit_execute_command_v26(command);'; b text:=' INSERT INTO public.command_receipts_v26 VALUES'; old_write text; new_write text; BEGIN
 d:=pg_get_functiondef('private.gx_document_apply_transition_v1(uuid,uuid,integer,uuid,text,boolean)'::regprocedure);
 IF length(d)-length(replace(d,a,''))<>length(a) THEN RAISE EXCEPTION 'synthetic transition anchor drift'; END IF;
 EXECUTE replace(d,a,'result:=private.gx_document_bus_internal_v1(command);');
 d:=pg_get_functiondef('private.gx_document_bus_internal_v1(jsonb)'::regprocedure);
 IF length(d)-length(replace(d,b,''))<>length(b) THEN RAISE EXCEPTION 'synthetic persistence anchor drift'; END IF;
 -- Match the second status/revision UPDATE performed by rc29 after M44's
 -- canonical AFTER trigger. It must not change the content or the audience.
 old_write:=$old$ UPDATE public.domain_entities_v26 SET status=target,revision=rev+1,
 body=body||coalesce(p_command->'payload'->'patch','{}'::jsonb)||jsonb_build_object('status',target,'revision',rev+1)
 WHERE entity_type='report' AND entity_id=report AND client_id=client AND revision=rev;$old$;
 new_write:=$new$ INSERT INTO public.domain_entities_v26(entity_type,entity_id,client_id,status,revision,body)
 SELECT entity_type,entity_id,client_id,target,rev+1,body||coalesce(p_command->'payload'->'patch','{}'::jsonb)||jsonb_build_object('status',target,'revision',rev+1)
 FROM public.domain_entities_v26 WHERE entity_type='report' AND entity_id=report AND client_id=client AND revision=rev
 ON CONFLICT(entity_type,entity_id) DO UPDATE SET client_id=excluded.client_id,status=excluded.status,revision=excluded.revision,body=excluded.body;$new$;
 IF length(d)-length(replace(d,old_write,''))<>length(old_write) THEN RAISE EXCEPTION 'synthetic upsert anchor drift'; END IF;
 d:=replace(d,old_write,new_write);
 EXECUTE replace(d,b,' UPDATE public.reports SET status=target::public.publication_status,revision=rev+1 WHERE id=report AND client_id=client;'||chr(10)||b);
END $fixture$;
\ir storage_boundary_generated.sql
SELECT gx_test.assert(NOT has_table_privilege('authenticated','private.gx_document_write_permit_v1','INSERT') AND NOT has_table_privilege('service_role','private.gx_document_write_permit_v1','INSERT'),'no API permit insertion');
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
SELECT gx_test.expect_error(format('UPDATE public.domain_entities_v26 SET status=''aprobado'',revision=2,body=%L::jsonb||''{"status":"aprobado","revision":2}''::jsonb WHERE entity_id=%L',body,report_id),'42501','valid material without private transaction permit denied') FROM gx_test.scenarios;
-- Even a genuine accepted request cannot authorize a raw projection write.
SELECT gx_test.expect_error(format('UPDATE public.reports SET status=''aprobado'',revision=2,content=%L::jsonb WHERE id=%L',body,report_id),'23514','projection without matching canonical denied') FROM gx_test.scenarios;
SELECT set_config('gx_test.bus_fault','ack',true);
SELECT gx_test.expect_error(format('SELECT private.gx_document_apply_transition_v1(%L,%L,1,%L,''approve'',false)',report_id,request_id,gen_random_uuid()),'40001','failed command rolls back permit and storage') FROM gx_test.scenarios;
SELECT gx_test.assert(NOT EXISTS(SELECT 1 FROM private.gx_document_write_permit_v1) AND (SELECT count(*) FROM public.reports WHERE id IN (SELECT report_id FROM gx_test.scenarios) AND status='borrador' AND revision=1)=2,'failure left no permit or partial approval');
SELECT set_config('gx_test.bus_fault','',true);
SELECT gx_test.assert(private.gx_document_apply_transition_v1(report_id,request_id,1,gen_random_uuid(),'approve',false)->>'status'='aprobado','authorized storage approval including second update') FROM gx_test.scenarios;
SELECT gx_test.assert(NOT EXISTS(SELECT 1 FROM private.gx_document_write_permit_v1),'permit consumed after approval');
SELECT gx_test.expect_error(format('UPDATE public.domain_entities_v26 SET status=''publicado'',revision=3,body=body||''{"status":"publicado","revision":3}''::jsonb WHERE entity_id=%L',report_id),'42501','direct publish with correct revision denied') FROM gx_test.scenarios;
SELECT gx_test.assert(private.gx_document_apply_transition_v1(report_id,request_id,2,gen_random_uuid(),'publish',true)->>'status'='publicado','authorized storage publication including second update') FROM gx_test.scenarios;
SELECT gx_test.assert(NOT EXISTS(SELECT 1 FROM private.gx_document_write_permit_v1),'permit consumed after publication');
SELECT gx_test.expect_error(format('UPDATE public.reports SET content=content||''{"coachComment":"synthetic"}''::jsonb WHERE id=%L',report_id),'23514','private projection field denied') FROM gx_test.scenarios;
SELECT gx_test.expect_error(format('UPDATE public.reports SET content=jsonb_set(content,''{evidence}'',''[]''::jsonb) WHERE id=%L',report_id),'23514','projection lineage removal denied') FROM gx_test.scenarios;
SELECT gx_test.expect_error(format('UPDATE public.domain_entities_v26 SET entity_type=''planning'' WHERE entity_id=%L',report_id),'23514','canonical reclassification denied') FROM gx_test.scenarios;
SELECT gx_test.assert((SELECT count(*) FROM public.reports WHERE status='publicado' AND audience='cliente')=2,'both authorized reports persisted');
-- Retire unchanged material after the owner withdraws. This tests the
-- trigger's terminal path; the hosted M26 command is not executed here.
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SELECT gx_test.assert(private.gx_document_request_decide_v1(request_id,1,gen_random_uuid(),'withdrawn',draft_sha,evidence_sha)->>'decision'='withdrawn','withdraw before retirement') FROM gx_test.scenarios WHERE provider='health_connect';
SELECT gx_test.expect_error(format('UPDATE public.domain_entities_v26 SET status=''retirado'',revision=4,body=body||''{"status":"retirado","revision":4}''::jsonb WHERE entity_id=%L',report_id),'42501','owner cannot retire via canonical write') FROM gx_test.scenarios WHERE provider='health_connect';
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
UPDATE public.domain_entities_v26 SET status='retirado',revision=4,body=body||'{"status":"retirado","revision":4,"reason":"Synthetic withdrawal"}'::jsonb WHERE entity_id=(SELECT report_id FROM gx_test.scenarios WHERE provider='health_connect');
UPDATE public.reports SET revision=4,status='retirado' WHERE id=(SELECT report_id FROM gx_test.scenarios WHERE provider='health_connect');
SELECT gx_test.assert(EXISTS(SELECT 1 FROM public.reports r JOIN gx_test.scenarios s ON r.id=s.report_id WHERE s.provider='health_connect' AND r.status='retirado' AND r.audience='coach' AND private.gx_document_has_external_v1(r.content)),'retirement retains lineage after withdrawal');
\echo GX_DOCUMENT_STORAGE_BOUNDARY_PG17_OK
