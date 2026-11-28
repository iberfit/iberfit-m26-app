-- Staged write guard; retain all three closed CHECK constraints and existing
-- GX326 write guards. No RPC is enabled by this installer.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$ BEGIN
 IF to_regprocedure('private.gx_document_bus_internal_v1(jsonb)') IS NULL
 OR to_regprocedure('private.gx_document_apply_transition_v1(uuid,uuid,integer,uuid,text,boolean)') IS NULL
 OR to_regprocedure('private.gx_document_accepted_material_matches_v1(uuid,uuid,jsonb)') IS NULL
 OR to_regprocedure('private.gx_document_generic_rejection_v1(jsonb)') IS NULL
 OR to_regclass('private.gx_document_write_permit_v1') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolbypassrls OR rolsuper))
 OR (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.domain_entities_v26'::regclass AND tgname='trg_m44_report_private_body_guard' AND tgenabled='O')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.domain_entities_v26'::regclass AND tgname='trg_m44_report_client_safe_projection' AND tgenabled='O')
 THEN RAISE EXCEPTION 'GX_DOCUMENT_STORAGE_PREREQUISITES'; END IF;
END $preflight$;
-- Transaction-local capability, not a browser-writable GUC. Insert only
-- after preparation has acquired the source, report and decision locks;
-- delete before the validated RPC returns. An exception rolls it back.
CREATE TABLE private.gx_document_write_permit_v1 (
 transaction_id xid8 PRIMARY KEY,
 report_id uuid NOT NULL,
 client_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 operation_id uuid NOT NULL,
 target_status text NOT NULL CHECK(target_status IN ('aprobado','publicado')),
 revision bigint NOT NULL CHECK(revision>1),
 material_sha256 text NOT NULL CHECK(material_sha256 ~ '^[0-9a-f]{64}$')
);
ALTER TABLE private.gx_document_write_permit_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.gx_document_write_permit_v1 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.gx_document_write_permit_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.gx_document_write_permitted_v1(p_report uuid,p_client uuid,p_status text,p_revision bigint,p_body jsonb)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT EXISTS(SELECT 1 FROM private.gx_document_write_permit_v1 w
 JOIN private.gx_connected360_document_request_v1 q ON q.id=w.request_id AND q.report_id=w.report_id AND q.client_id=w.client_id AND q.coach_id=w.actor_id AND q.publication_sha256=w.material_sha256
 WHERE w.transaction_id=pg_current_xact_id_if_assigned() AND w.report_id=p_report AND w.client_id=p_client AND w.actor_id=auth.uid()
 AND w.target_status=p_status AND w.revision=p_revision
 AND w.material_sha256=private.gx_document_publication_material_sha_v1(p_report,p_client,p_body)
 AND private.gx_document_accepted_material_matches_v1(p_report,p_client,p_body) IS TRUE)
$f$;
REVOKE ALL ON FUNCTION private.gx_document_write_permitted_v1(uuid,uuid,text,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Terminal operations must remain possible even after source/consent withdrawal.
-- Only the unchanged authorized material can be retained, never re-published.
CREATE FUNCTION private.gx_document_terminal_actor_v1(p_client uuid,p_status text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
BEGIN
 IF auth.uid() IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
 OR private.m26_v49_live_session() IS DISTINCT FROM true
 OR NOT coalesce(public.iberfit_can_access_client_v26(p_client),false)
 OR (public.iberfit_current_role_v26()='admin' OR (p_status='retirado' AND public.iberfit_current_role_v26()='coach' AND coalesce(public.is_assigned_coach(p_client),false))) IS NOT TRUE
 THEN RETURN false; END IF;
 PERFORM public.iberfit_require_privileged_assurance_v65d();
 RETURN true;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_terminal_actor_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.gx_document_canonical_write_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE marked boolean; old_marked boolean:=false; old_sha text; new_sha text; prior public.domain_entities_v26%rowtype;
BEGIN
 marked:=NEW.entity_type='report' AND private.gx_document_has_external_v1(NEW.body);
 IF TG_OP='UPDATE' THEN
  prior:=OLD;
 ELSIF marked THEN
  -- RC29 persists with INSERT ON CONFLICT DO UPDATE. PostgreSQL runs BEFORE
  -- INSERT before conflict resolution. Lock the existing canonical row so
  -- this can only proceed to its conflict UPDATE, never create a marked row.
  SELECT * INTO prior FROM public.domain_entities_v26 WHERE entity_type=NEW.entity_type AND entity_id=NEW.entity_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_CANONICAL_WRITE_DENIED' USING ERRCODE='23514'; END IF;
 END IF;
 old_marked:=coalesce(prior.entity_type='report' AND private.gx_document_has_external_v1(prior.body),false);
 IF NOT marked AND NOT old_marked THEN RETURN NEW; END IF;
 IF NOT marked OR NEW.entity_type IS DISTINCT FROM prior.entity_type OR NEW.entity_id IS DISTINCT FROM prior.entity_id OR NEW.client_id IS DISTINCT FROM prior.client_id
 OR NEW.revision IS DISTINCT FROM prior.revision+1 OR NEW.body->>'id' IS DISTINCT FROM NEW.entity_id::text
 OR NEW.body->>'clientId' IS DISTINCT FROM NEW.client_id::text OR NEW.body->>'status' IS DISTINCT FROM NEW.status::text
 OR NEW.body->>'revision' IS DISTINCT FROM NEW.revision::text OR NEW.body->'visibleToClient' IS DISTINCT FROM 'false'::jsonb
 OR current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
 THEN RAISE EXCEPTION 'GX_DOCUMENT_CANONICAL_WRITE_DENIED' USING ERRCODE='23514'; END IF;
 new_sha:=private.gx_document_publication_material_sha_v1(NEW.entity_id,NEW.client_id,NEW.body);
 IF old_marked THEN
  old_sha:=private.gx_document_publication_material_sha_v1(prior.entity_id,prior.client_id,prior.body);
  IF old_sha IS NULL OR new_sha IS DISTINCT FROM old_sha THEN RAISE EXCEPTION 'GX_DOCUMENT_CANONICAL_MATERIAL_CHANGED' USING ERRCODE='23514'; END IF;
 END IF;
 IF old_marked AND ((prior.status::text='publicado' AND NEW.status::text='retirado') OR (prior.status::text='aprobado' AND NEW.status::text='anulado')) THEN
  IF private.gx_document_terminal_actor_v1(NEW.client_id,NEW.status::text) IS NOT TRUE
   OR NEW.body-ARRAY['status','revision','updatedAt','retiredAt','retiredBy','retireReason','closedAt','closedBy','closeReason','withdrawnAt','reason','visibleToClient']::text[]
    IS DISTINCT FROM prior.body-ARRAY['status','revision','updatedAt','retiredAt','retiredBy','retireReason','closedAt','closedBy','closeReason','withdrawnAt','reason','visibleToClient']::text[]
  THEN RAISE EXCEPTION 'GX_DOCUMENT_CANONICAL_TERMINAL_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NOT ((NOT old_marked AND prior.status::text='borrador' AND NEW.status::text='aprobado') OR (old_marked AND prior.status::text='aprobado' AND NEW.status::text='publicado'))
 OR private.gx_document_write_permitted_v1(NEW.entity_id,NEW.client_id,NEW.status::text,NEW.revision,NEW.body) IS NOT TRUE
 THEN RAISE EXCEPTION 'GX_DOCUMENT_CANONICAL_PERMIT_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_canonical_write_v1() FROM PUBLIC,anon,authenticated,service_role;
-- Runs after the existing M44 BEFORE privacy guard (alphabetical order).
CREATE TRIGGER zz_gx_document_canonical_write_v1 BEFORE INSERT OR UPDATE ON public.domain_entities_v26 FOR EACH ROW EXECUTE FUNCTION private.gx_document_canonical_write_v1();
CREATE FUNCTION private.gx_document_projected_write_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE marked boolean; old_marked boolean:=false; d public.domain_entities_v26%rowtype; canonical_status text; new_sha text; old_sha text;
BEGIN
 marked:=private.gx_document_has_external_v1(NEW.content);
 IF TG_OP='UPDATE' THEN old_marked:=private.gx_document_has_external_v1(OLD.content); END IF;
 IF NOT marked AND NOT old_marked THEN RETURN NEW; END IF;
 IF TG_OP<>'UPDATE' OR NOT marked OR NEW.id IS DISTINCT FROM OLD.id OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
 OR NEW.report_type IS DISTINCT FROM 'weekly' OR NEW.report_type IS DISTINCT FROM OLD.report_type OR NEW.title IS DISTINCT FROM OLD.title
 OR NEW.title IS DISTINCT FROM NEW.content->>'title' OR NEW.summary IS DISTINCT FROM NEW.content->>'summary'
 OR (NEW.revision IN (OLD.revision,OLD.revision+1)) IS NOT TRUE
 OR current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
 THEN RAISE EXCEPTION 'GX_DOCUMENT_PROJECTED_WRITE_DENIED' USING ERRCODE='23514'; END IF;
 -- Canonical AFTER projection sees the updated canonical row. The legacy
 -- persistence routine subsequently updates report status/revision again;
 -- permit only the same content and status on this second update.
 SELECT * INTO d FROM public.domain_entities_v26 WHERE entity_type='report' AND entity_id=NEW.id AND client_id=NEW.client_id;
 IF NOT FOUND OR d.revision IS DISTINCT FROM NEW.revision OR d.body->'visibleToClient' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'GX_DOCUMENT_PROJECTED_CANONICAL_MISMATCH' USING ERRCODE='23514'; END IF;
 canonical_status:=d.status::text;
 IF canonical_status='anulado' THEN canonical_status:='retirado'; END IF;
 new_sha:=private.gx_document_publication_material_sha_v1(NEW.id,NEW.client_id,NEW.content);
 IF new_sha IS NULL OR canonical_status IS DISTINCT FROM NEW.status::text
 OR private.gx_document_publication_material_sha_v1(NEW.id,NEW.client_id,d.body) IS DISTINCT FROM new_sha
 THEN RAISE EXCEPTION 'GX_DOCUMENT_PROJECTED_CANONICAL_MISMATCH' USING ERRCODE='23514'; END IF;
 IF old_marked THEN
  old_sha:=private.gx_document_publication_material_sha_v1(OLD.id,OLD.client_id,OLD.content);
  IF old_sha IS DISTINCT FROM new_sha THEN RAISE EXCEPTION 'GX_DOCUMENT_PROJECTED_MATERIAL_CHANGED' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status::text='publicado' THEN
  IF NEW.audience IS DISTINCT FROM 'cliente' OR NEW.content->'visibleToClient' IS DISTINCT FROM 'true'::jsonb OR NEW.content->>'format' IS DISTINCT FROM 'a4-premium'
  OR NEW.content-ARRAY['id','clientId','reportType','title','summary','conclusions','recommendations','periodStart','periodEnd','evidence','activitySeries','format','visibleToClient']::text[]<>'{}'::jsonb
  THEN RAISE EXCEPTION 'GX_DOCUMENT_PROJECTED_PRIVATE_FIELDS' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.audience IS DISTINCT FROM 'coach' OR NEW.content IS DISTINCT FROM d.body THEN RAISE EXCEPTION 'GX_DOCUMENT_PROJECTED_PRIVATE_MISMATCH' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.revision=OLD.revision AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.content IS DISTINCT FROM OLD.content OR NEW.audience IS DISTINCT FROM OLD.audience)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_PROJECTED_REPLAY_CHANGED' USING ERRCODE='23514'; END IF;
 IF NEW.status::text='retirado' AND old_marked AND ((OLD.status::text='publicado' AND d.status::text='retirado') OR (OLD.status::text='aprobado' AND d.status::text='anulado') OR (OLD.status::text='retirado' AND NEW.revision=OLD.revision)) THEN
  IF private.gx_document_terminal_actor_v1(NEW.client_id,d.status::text) IS NOT TRUE THEN RAISE EXCEPTION 'GX_DOCUMENT_PROJECTED_TERMINAL_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF private.gx_document_write_permitted_v1(NEW.id,NEW.client_id,NEW.status::text,NEW.revision,NEW.content) IS NOT TRUE
 THEN RAISE EXCEPTION 'GX_DOCUMENT_PROJECTED_PERMIT_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_projected_write_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_gx_document_projected_write_v1 BEFORE INSERT OR UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION private.gx_document_projected_write_v1();
-- Patch only the exact internal handoff; preserve the already certified
-- preparation, locking, receipt and readback code. No permission survives
-- a successful RPC; failures roll back the entire statement.
DO $install$
DECLARE d text; entry constant text:='result:=private.gx_document_bus_internal_v1(command);'; finish constant text:='RETURN jsonb_build_object(''schema'',''iberfit.connected360.document-transition.v1''';
BEGIN
 d:=pg_get_functiondef('private.gx_document_apply_transition_v1(uuid,uuid,integer,uuid,text,boolean)'::regprocedure);
 IF length(d)-length(replace(d,entry,''))<>length(entry) OR length(d)-length(replace(d,finish,''))<>length(finish) THEN RAISE EXCEPTION 'GX_DOCUMENT_STORAGE_TRANSITION_DRIFT'; END IF;
 d:=replace(d,entry,$patch$INSERT INTO private.gx_document_write_permit_v1(transaction_id,report_id,client_id,request_id,actor_id,operation_id,target_status,revision,material_sha256)
 VALUES(pg_current_xact_id(),p_report,q.client_id,q.id,actor,p_operation,target_status,next_revision,q.publication_sha256);
 result:=private.gx_document_bus_internal_v1(command);$patch$);
 d:=replace(d,finish,$patch$DELETE FROM private.gx_document_write_permit_v1 WHERE transaction_id=pg_current_xact_id() AND operation_id=p_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_STORAGE_PERMIT_MISSING' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('schema','iberfit.connected360.document-transition.v1'$patch$);
 EXECUTE d;
END $install$;
COMMIT;
