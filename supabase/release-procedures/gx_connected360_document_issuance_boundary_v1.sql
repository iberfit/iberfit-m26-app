-- Candidate only. Install AFTER document storage/PDF boundaries. Keep all
-- closed CHECKs and RPCs closed until hosted certification is authorized.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$ BEGIN
 IF to_regprocedure('private.gx_document_pdf_service_lock_v1(uuid,uuid,bigint,jsonb,uuid)') IS NULL
 OR to_regprocedure('private.gx_document_terminal_actor_v1(uuid,text)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.reports'::regclass AND tgname='zz_gx_document_projected_write_v1' AND tgenabled='O' AND tgfoid=to_regprocedure('private.gx_document_projected_write_v1()'))
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.domain_entities_v26'::regclass AND tgname='zz_gx_document_canonical_write_v1' AND tgenabled='O' AND tgfoid=to_regprocedure('private.gx_document_canonical_write_v1()'))
 OR md5(pg_get_functiondef('private.iberfit_gx_report_write_guard_v1()'::regprocedure)) IS DISTINCT FROM 'be9f09c1851b5cc3e618fef03aaaa757'
 OR md5(pg_get_functiondef('private.iberfit_gx_issuance_write_guard_v1()'::regprocedure)) IS DISTINCT FROM '4644f631db0575fffcb5c66198e217cf'
 OR (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) a(role_name) WHERE has_table_privilege(a.role_name,'public.iberfit_evolution_report_issuances_v1','INSERT,UPDATE,DELETE,TRUNCATE'))
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolbypassrls OR rolsuper))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_ISSUANCE_PREREQUISITES'; END IF;
END $preflight$;
-- New independent BEFORE guard; service can only use the trusted definer
-- finalizer, not write the table. Preserve the ledger and permit only its
-- existing terminal metadata transition, even after consent is withdrawn.
CREATE FUNCTION private.gx_document_issuance_write_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE marked boolean:=private.gx_document_has_external_v1(NEW.source_snapshot); old_marked boolean:=false;
BEGIN
 IF TG_OP='UPDATE' THEN old_marked:=private.gx_document_has_external_v1(OLD.source_snapshot); END IF;
 IF NOT marked AND NOT old_marked THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status IS DISTINCT FROM 'issued' OR NEW.source_sha256 IS DISTINCT FROM encode(sha256(convert_to(NEW.source_snapshot::text,'UTF8')),'hex')
  OR NEW.artifact_path IS DISTINCT FROM (NEW.client_id::text||'/'||NEW.report_id::text||'/'||NEW.issue_request_id::text||'/report.pdf')
  OR private.gx_document_pdf_service_lock_v1(NEW.report_id,NEW.client_id,NEW.report_revision,NEW.source_snapshot,NEW.issued_by) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'GX_DOCUMENT_ISSUANCE_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NOT marked OR NOT old_marked OR OLD.status IS DISTINCT FROM 'issued' OR NEW.status IS DISTINCT FROM 'withdrawn'
 OR NEW.withdrawn_by IS DISTINCT FROM auth.uid() OR NEW.withdrawn_at IS NULL OR length(btrim(coalesce(NEW.withdrawn_reason,''))) NOT BETWEEN 3 AND 500
 OR to_jsonb(NEW)-ARRAY['status','withdrawn_by','withdrawn_at','withdrawn_reason']::text[] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','withdrawn_by','withdrawn_at','withdrawn_reason']::text[]
 OR private.gx_document_terminal_actor_v1(OLD.client_id,'retirado') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'GX_DOCUMENT_ISSUANCE_IMMUTABLE' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_issuance_write_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_gx_document_issuance_write_v1 BEFORE INSERT OR UPDATE ON public.iberfit_evolution_report_issuances_v1 FOR EACH ROW EXECUTE FUNCTION private.gx_document_issuance_write_v1();
-- The original GX guards reject all external material. Route only that exact
-- reserved marker to the new independent guards. Ordinary/professional-only
-- material remains on the original path; other evidence is still revalidated.
DO $patch$
DECLARE d text; a text; b text;
BEGIN
 d:=pg_get_functiondef('private.iberfit_gx_report_write_guard_v1()'::regprocedure);
 a:=' IF NEW.status::text=''retirado'' THEN RETURN NEW; END IF;';
 b:=$p$ IF private.gx_document_has_external_v1(NEW.content) THEN
  IF NEW.status::text<>'retirado' AND (private.gx_document_other_evidence_current_v1(NEW.client_id,NEW.content) IS DISTINCT FROM true OR NEW.report_type IS DISTINCT FROM NEW.content->>'reportType')
  THEN RAISE EXCEPTION 'GX_REPORT_EVIDENCE_STALE_OR_FORGED' USING ERRCODE='40001'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.status::text='retirado' THEN RETURN NEW; END IF;$p$;
 IF length(d)-length(replace(d,a,''))<>length(a) THEN RAISE EXCEPTION 'GX_DOCUMENT_ISSUANCE_REPORT_ANCHOR_DRIFT'; END IF;
 EXECUTE replace(d,a,b);
 d:=pg_get_functiondef('private.iberfit_gx_issuance_write_guard_v1()'::regprocedure);
 a:=' IF NOT private.iberfit_gx_report_body_has_refs_v1(NEW.source_snapshot) THEN RETURN NEW; END IF;';
 b:=$p$ IF private.gx_document_has_external_v1(NEW.source_snapshot) THEN RETURN NEW; END IF;
 IF NOT private.iberfit_gx_report_body_has_refs_v1(NEW.source_snapshot) THEN RETURN NEW; END IF;$p$;
 IF length(d)-length(replace(d,a,''))<>length(a) THEN RAISE EXCEPTION 'GX_DOCUMENT_ISSUANCE_LEDGER_ANCHOR_DRIFT'; END IF;
 EXECUTE replace(d,a,b);
END $patch$;
COMMIT;
