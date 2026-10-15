-- IBERFIT M44: service-only PDF finalization with modern Supabase sb_secret_ keys.
-- PostgREST uses SET LOCAL ROLE for both verified modern secrets and legacy service JWTs.
-- request.jwt.claim.role is not guaranteed for a non-JWT secret key.
-- Inside SECURITY DEFINER, current_user is the function owner; inspect the
-- PostgreSQL role GUC set by PostgREST instead. Never infer from client input.
-- Privileged Coach/Admin WebAuthn proof is still required during user-scoped prepare;
-- this internal finalizer is executable solely as service_role and checks the
-- actor's role/assignment, locked source revision and stored object checksum.
-- No grants to anon or authenticated; preserve append-only historical ledger.
SELECT 1 / (CASE WHEN to_regprocedure('public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)') IS NOT NULL THEN 1 ELSE 0 END)
  AS m44_finalize_prerequisite_missing;

CREATE OR REPLACE FUNCTION public.iberfit_m44_finalize_evolution_report_issue_v1(
 p_report_id uuid,p_issue_request_id uuid,p_source_revision bigint,
 p_source_sha256 text,p_artifact_path text,p_artifact_sha256 text,
 p_artifact_size_bytes bigint,p_template_version text,p_engine_version text,
 p_actor_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor uuid:=p_actor_user_id;
 v_role text;
 v_report public.reports%rowtype;
 v_source jsonb;
 v_source_hash text;
 v_prev public.iberfit_evolution_report_issuances_v1%rowtype;
 v_issue_id uuid:=gen_random_uuid();
 v_version integer;
BEGIN
 IF coalesce(current_setting('role',true),'')<>'service_role'
    OR v_actor IS NULL
 THEN RAISE EXCEPTION 'M44_PDF_FINALIZE_SERVICE_ONLY' USING errcode='42501';END IF;
 SELECT role::text INTO v_role FROM public.user_profiles WHERE user_id=v_actor;
 IF coalesce(v_role,'') NOT IN ('coach','admin')
 OR p_report_id IS NULL OR p_issue_request_id IS NULL
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[0-9a-f]{64}$'
 OR p_artifact_sha256 IS NULL OR p_artifact_sha256 !~ '^[0-9a-f]{64}$'
 OR p_artifact_size_bytes NOT BETWEEN 1024 AND 20971520
 OR length(coalesce(p_template_version,'')) NOT BETWEEN 8 AND 100
 OR length(coalesce(p_engine_version,'')) NOT BETWEEN 8 AND 100
 THEN RAISE EXCEPTION 'M44_PDF_FINALIZE_INVALID_INPUT' USING errcode='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('m44:issue:'||p_report_id::text,0));
 SELECT * INTO v_report FROM public.reports WHERE id=p_report_id FOR UPDATE;
 IF NOT FOUND OR v_report.status<>'publicado' OR v_report.audience<>'cliente'
 OR (v_role='coach' AND NOT EXISTS(
     SELECT 1 FROM public.client_assignments a
     WHERE a.client_id=v_report.client_id AND a.coach_user_id=v_actor AND a.active
   ))
 THEN RAISE EXCEPTION 'M44_PDF_FINALIZE_NOT_PUBLISHED_OR_SCOPE' USING errcode='42501'; END IF;
 v_source:=public.iberfit_m44_private_issued_source_v1(p_report_id);
 v_source_hash:=encode(sha256(convert_to(v_source::text,'UTF8')),'hex');
 IF v_report.revision IS DISTINCT FROM p_source_revision
 OR v_source_hash IS DISTINCT FROM p_source_sha256
 THEN RAISE EXCEPTION 'M44_PDF_FINALIZE_STALE_SOURCE' USING errcode='40001';END IF;
 IF p_artifact_path IS DISTINCT FROM
    (v_report.client_id::text||'/'||p_report_id::text||'/'||p_issue_request_id::text||'/report.pdf')
 THEN RAISE EXCEPTION 'M44_PDF_FINALIZE_ARTIFACT_PATH_INVALID' USING errcode='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='iberfit-evolution-issued-reports'
   AND name=p_artifact_path)
 THEN RAISE EXCEPTION 'M44_PDF_FINALIZE_STORAGE_OBJECT_MISSING' USING errcode='22023';END IF;
 SELECT * INTO v_prev FROM public.iberfit_evolution_report_issuances_v1
 WHERE issue_request_id=p_issue_request_id OR (report_id=p_report_id AND report_revision=p_source_revision)
 ORDER BY issued_at DESC LIMIT 1;
 IF FOUND THEN
   IF v_prev.report_id IS DISTINCT FROM p_report_id OR v_prev.report_revision IS DISTINCT FROM p_source_revision
      OR v_prev.source_sha256 IS DISTINCT FROM p_source_sha256
   THEN RAISE EXCEPTION 'M44_PDF_ISSUANCE_REQUEST_COLLISION' USING errcode='23505';END IF;
   RETURN jsonb_build_object('ok',true,'kind','already-issued','issuanceId',v_prev.id,
     'version',v_prev.version,'artifactPath',v_prev.artifact_path,
     'artifactSha256',v_prev.artifact_sha256,'withdrawn',v_prev.status='withdrawn');
 END IF;
 SELECT coalesce(max(version),0)+1 INTO v_version
 FROM public.iberfit_evolution_report_issuances_v1 WHERE report_id=p_report_id;
 INSERT INTO public.iberfit_evolution_report_issuances_v1(
    id,report_id,client_id,version,report_revision,issue_request_id,
    template_version,engine_version,source_snapshot,source_sha256,
    artifact_path,artifact_sha256,artifact_size_bytes,issued_by
 ) VALUES (
    v_issue_id,p_report_id,v_report.client_id,v_version,p_source_revision,p_issue_request_id,
    p_template_version,p_engine_version,v_source,p_source_sha256,
    p_artifact_path,p_artifact_sha256,p_artifact_size_bytes,v_actor
 );
 INSERT INTO public.domain_events_v26(
   operation_id,command_type,entity_type,entity_id,client_id,
   actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,details
 ) VALUES (
   p_issue_request_id,'INFORME_PDF_EMITIR_M44','report',p_report_id,v_report.client_id,
   v_actor,v_role,'applied','publicado','publicado',p_source_revision,p_source_revision,
   jsonb_build_object('issuanceId',v_issue_id,'artifactSha256',p_artifact_sha256,
     'sourceSha256',p_source_sha256,'version',v_version)
 );
 RETURN jsonb_build_object('ok',true,'kind','issued','issuanceId',v_issue_id,
   'version',v_version,'artifactPath',p_artifact_path,'artifactSha256',p_artifact_sha256);
END $fn$;

REVOKE ALL ON FUNCTION public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid) TO service_role;

-- Fail closed when the trusted SQL entrypoint is exposed to other API roles.
SELECT 1 / (CASE WHEN
  has_function_privilege('service_role','public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)','EXECUTE')
  THEN 1 ELSE 0 END) AS m44_finalize_service_only_acl_guard;
