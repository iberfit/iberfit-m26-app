-- Candidate only: AFTER gx_reassessment_report_guard_v1.sql. No new RPC or privileges.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $change$
DECLARE
 fn regprocedure := 'public.iberfit_m44_create_report_draft_impl_v1(uuid,uuid,jsonb)'::regprocedure;
 body text := pg_get_functiondef(fn);
 original_acl aclitem[]; original_owner oid;
 a text; b text;
BEGIN
 IF md5(body) IS DISTINCT FROM '517816721e7d19851e34745ed0e83c55' OR
 md5(pg_get_functiondef('public.iberfit_m44_create_report_draft_v1(uuid,uuid,jsonb)'::regprocedure)) IS DISTINCT FROM '368e55c2ebafe992a7f4b1c298ec6296' THEN RAISE EXCEPTION 'GX_REASSESSMENT_DRAFT_BASELINE_DRIFT'; END IF;
 SELECT proacl,proowner INTO original_acl,original_owner FROM pg_proc WHERE oid=fn;
 IF original_owner IS DISTINCT FROM 'postgres'::regrole::oid OR original_acl::text IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r(role_name) WHERE has_function_privilege(r.role_name,fn,'EXECUTE')) THEN RAISE EXCEPTION 'GX_REASSESSMENT_DRAFT_ACL_DRIFT'; END IF;
 IF to_regprocedure('private.iberfit_gx_reassessment_body_current_v1(uuid,jsonb)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.reports'::regclass AND conname='gx_reassessment_type_consistency' AND convalidated)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.reports'::regclass AND tgname='gx326_report_evidence_guard' AND tgenabled='O')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND tgname='gx326_issuance_evidence_guard' AND tgenabled='O')
 THEN RAISE EXCEPTION 'GX_REASSESSMENT_DRAFT_PREREQUISITES_DRIFT'; END IF;
 a:=$old$if coalesce(v_type,'') not in ('post-session','weekly','monthly','quarterly','year-in-iberfit') then$old$;
 b:=$new$if coalesce(v_type,'') not in ('post-session','weekly','monthly','quarterly','year-in-iberfit','reassessment') then$new$;
 IF (length(body)-length(replace(body,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'GX_REASSESSMENT_DRAFT_ANCHOR_1'; END IF;
 body:=replace(body,a,b);
 a:=$old$  if v_type='post-session' then
    if v_source_type$old$;
 b:=$new$  if v_type='reassessment' then
    -- Independent professional follow-up, never IRI or a training execution.
    if v_role is distinct from 'coach'
       or auth.jwt()->>'role' is distinct from 'authenticated'
       or v_source_type is distinct from 'professional_followup'
       or p_draft->'sourceId' is distinct from 'null'::jsonb
       or p_draft->'assessmentId' is distinct from 'null'::jsonb
       or p_draft->'activitySeries' is distinct from '[]'::jsonb
       or p_draft->'reviewAccepted' is distinct from 'true'::jsonb
       or p_draft->'visibleToClient' is distinct from 'false'::jsonb
       or private.iberfit_gx_followup_can_coach_v1(p_client_id) is distinct from true
       or private.iberfit_gx_reassessment_body_current_v1(p_client_id,p_draft) is distinct from true then
      raise exception 'M44_REASSESSMENT_EVIDENCE_OR_SCOPE_INVALID' using errcode='42501';
    end if;
  elsif v_type='post-session' then
    if v_source_type$new$;
 IF (length(body)-length(replace(body,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'GX_REASSESSMENT_DRAFT_ANCHOR_2'; END IF;
 body:=replace(body,a,b);
 a:=$old$  -- Completion is authoritative only after$old$;
 b:=$new$  if v_type<>'reassessment' then
  -- Completion is authoritative only after$new$;
 IF (length(body)-length(replace(body,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'GX_REASSESSMENT_DRAFT_ANCHOR_3'; END IF;
 body:=replace(body,a,b);
 a:=$old$  perform pg_advisory_xact_lock(hashtextextended('m44:report:'$old$;
 b:=$new$  end if; -- Training-only completion and activity-series checks.

  perform pg_advisory_xact_lock(hashtextextended('m44:report:'$new$;
 IF (length(body)-length(replace(body,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'GX_REASSESSMENT_DRAFT_ANCHOR_4'; END IF;
 body:=replace(body,a,b);
 IF md5(body) IS DISTINCT FROM '609cdb73e08cb26aa1c57c340237abb0' THEN RAISE EXCEPTION 'GX_REASSESSMENT_DRAFT_TRANSFORM_DRIFT'; END IF;
 EXECUTE body;
 IF md5(pg_get_functiondef(fn)) IS DISTINCT FROM '609cdb73e08cb26aa1c57c340237abb0' OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=fn AND proacl IS NOT DISTINCT FROM original_acl AND proowner=original_owner) THEN RAISE EXCEPTION 'GX_REASSESSMENT_DRAFT_VERIFY_FAILED'; END IF;
END $change$;
COMMIT;
