-- M44 premium evolution: immutable published-report PDF ledger.
-- WIP: never deploy until the exact PDF engine and QA negative-role tests exist.
-- Use the same issued-artifact governance contract as IRI, not the IRI table.
-- M44_ISSUANCE_REQUIRES_REPORT_LIFECYCLE: declarative fail-closed verification; no arbitrary DO/EXECUTE.
SELECT 1 / (CASE WHEN to_regprocedure('public.iberfit_m44_report_public_projection_v1()') IS NOT NULL
 AND to_regprocedure('public.iberfit_m44_create_report_draft_v1(uuid,uuid,jsonb)') IS NOT NULL THEN 1 ELSE 0 END) AS m44_issuance_requires_report_lifecycle;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('iberfit-evolution-issued-reports','iberfit-evolution-issued-reports',false,
  20971520,ARRAY['application/pdf']::text[])
ON CONFLICT(id) DO NOTHING;

-- M44_PRIVATE_PDF_BUCKET_NOT_VERIFIED: declarative fail-closed verification; no arbitrary DO/EXECUTE.
SELECT 1 / (CASE WHEN EXISTS (
 SELECT 1 FROM storage.buckets
 WHERE id='iberfit-evolution-issued-reports'
   AND public=false AND file_size_limit<=20971520
   AND allowed_mime_types @> ARRAY['application/pdf']::text[]
) THEN 1 ELSE 0 END) AS m44_private_pdf_bucket_not_verified;

-- IBERFIT-TABLE-ACCESS: public.iberfit_evolution_report_issuances_v1 :: sealed official evolution PDF ledger; only service_role may access storage provenance, while user-scoped SECURITY DEFINER RPCs enforce per-client scope and verified privileged assurance.
-- IBERFIT-POLICY: public.iberfit_evolution_report_issuances_v1 = service-role-only
CREATE TABLE IF NOT EXISTS public.iberfit_evolution_report_issuances_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE RESTRICT,
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK (version>0),
 report_revision bigint NOT NULL CHECK (report_revision>=2),
 issue_request_id uuid NOT NULL UNIQUE,
 template_version text NOT NULL CHECK (length(template_version) BETWEEN 8 AND 100),
 engine_version text NOT NULL CHECK (length(engine_version) BETWEEN 8 AND 100),
 source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot)='object'),
 source_sha256 text NOT NULL CHECK (source_sha256~'^[0-9a-f]{64}$'),
 artifact_bucket text NOT NULL DEFAULT 'iberfit-evolution-issued-reports'
   CHECK (artifact_bucket='iberfit-evolution-issued-reports'),
 artifact_path text NOT NULL UNIQUE CHECK(length(artifact_path) BETWEEN 50 AND 500),
 artifact_sha256 text NOT NULL CHECK (artifact_sha256~'^[0-9a-f]{64}$'),
 artifact_size_bytes bigint NOT NULL CHECK (artifact_size_bytes BETWEEN 1024 AND 20971520),
 status text NOT NULL DEFAULT 'issued' CHECK (status in ('issued','withdrawn')),
 issued_by uuid NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 withdrawn_by uuid,
 withdrawn_at timestamptz,
 withdrawn_reason text,
 CONSTRAINT m44_pdf_issue_version_unique UNIQUE(report_id,version),
 CONSTRAINT m44_pdf_issue_revision_unique UNIQUE(report_id,report_revision),
 CONSTRAINT m44_pdf_withdrawal_consistency CHECK (
   (status='issued' AND withdrawn_at IS NULL AND withdrawn_by IS NULL)
   OR (status='withdrawn' AND withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL
       AND length(btrim(withdrawn_reason)) BETWEEN 3 AND 500)
 )
);
CREATE INDEX IF NOT EXISTS idx_m44_issue_client ON public.iberfit_evolution_report_issuances_v1(client_id,issued_at DESC);
ALTER TABLE public.iberfit_evolution_report_issuances_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iberfit_evolution_report_issuances_v1 FROM PUBLIC,anon,authenticated;
-- Explicit least-privilege Edge and finalizer access; DELETE remains forbidden.
GRANT SELECT, INSERT, UPDATE ON TABLE public.iberfit_evolution_report_issuances_v1 TO service_role;

-- This source is the ONLY payload that a renderer may sign and archive.
-- Read from the redacted published projection, not raw private domain bodies.

-- Internal-only source builder shared by user-scoped preparation and the
-- trusted Edge finalizer. Never include private Coach notes.
CREATE OR REPLACE FUNCTION public.iberfit_m44_private_issued_source_v1(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_report public.reports%rowtype;
 v_client_name text;
 v_source jsonb;
BEGIN
 SELECT * INTO v_report FROM public.reports WHERE id=p_report_id;
 IF NOT FOUND OR v_report.status<>'publicado' OR v_report.audience<>'cliente'
 THEN RAISE EXCEPTION 'M44_PDF_SOURCE_NOT_PUBLISHED' USING errcode='42501';END IF;
 SELECT name INTO v_client_name FROM public.clients WHERE id=v_report.client_id;
 v_source:=jsonb_build_object(
   'reportId',v_report.id,'clientId',v_report.client_id,
   'revision',v_report.revision,'title',v_report.title,
   'clientName',coalesce(nullif(v_client_name,''),'Cliente IBERFIT'),
   'periodStart',v_report.content->>'periodStart',
   'periodEnd',v_report.content->>'periodEnd',
   'reportType',v_report.content->>'reportType',
   'summary',v_report.content->>'summary',
   'conclusions',v_report.content->>'conclusions',
   'recommendations',v_report.content->>'recommendations',
   'evidence',coalesce((
      select jsonb_agg(jsonb_build_object(
        'label',item->>'label','text',item->>'text',
        'source',item->>'source','quality',left(coalesce(item->>'quality',''),120)
      ) order by ord)
      from jsonb_array_elements(coalesce(v_report.content->'evidence','[]'::jsonb))
      with ordinality as evidence(item,ord)
    ),'[]'::jsonb),
   'activitySeries',coalesce((
      select jsonb_agg(jsonb_build_object(
        'from',item->>'from','to',item->>'to','count',item->'count'
      ) order by ord)
      from jsonb_array_elements(coalesce(v_report.content->'activitySeries','[]'::jsonb))
      with ordinality as series(item,ord)
    ),'[]'::jsonb)
 );

 RETURN v_source;
END $fn$;
REVOKE ALL ON FUNCTION public.iberfit_m44_private_issued_source_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_private_issued_source_v1(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.iberfit_m44_prepare_evolution_report_issue_v1(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor uuid:=auth.uid();
 v_role text:=public.iberfit_current_role_v26();
 v_report public.reports%rowtype;
 v_client_name text;
 v_source jsonb;
 v_source_hash text;
BEGIN
 IF v_actor IS NULL OR coalesce(v_role,'') NOT IN ('coach','admin') OR p_report_id IS NULL
 THEN RAISE EXCEPTION 'M44_PDF_ISSUE_NOT_AUTHORIZED' USING errcode='42501';END IF;
 SELECT * INTO v_report FROM public.reports WHERE id=p_report_id;
 IF NOT FOUND OR v_report.status<>'publicado' OR v_report.audience<>'cliente'
    OR NOT coalesce(public.iberfit_can_access_client_v26(v_report.client_id),false)
    OR NOT coalesce(public.iberfit_canary_enabled_v26(v_report.client_id),false)
    OR (v_role='coach' AND NOT coalesce(public.is_assigned_coach(v_report.client_id),false))
 THEN RAISE EXCEPTION 'M44_PDF_ISSUE_SCOPE_OR_PUBLICATION_FORBIDDEN' USING errcode='42501';END IF;
 IF jsonb_typeof(v_report.content) IS DISTINCT FROM 'object'
    OR coalesce(v_report.content->>'visibleToClient','')<>'true'
    OR v_report.revision<2
 THEN RAISE EXCEPTION 'M44_PDF_ISSUE_CONTENT_NOT_CERTIFIED' USING errcode='22023';END IF;
 v_source:=public.iberfit_m44_private_issued_source_v1(v_report.id);
 IF coalesce(v_source->>'periodStart','')='' OR coalesce(v_source->>'periodEnd','')=''
   OR jsonb_typeof(v_source->'evidence')<>'array'
   OR jsonb_array_length(v_source->'evidence')<1
 THEN RAISE EXCEPTION 'M44_PDF_ISSUE_SOURCE_INCOMPLETE' USING errcode='22023';END IF;
 v_source_hash:=encode(sha256(convert_to(v_source::text,'UTF8')),'hex');
 RETURN jsonb_build_object('ok',true,'reportId',v_report.id,
   'clientId',v_report.client_id,'sourceRevision',v_report.revision,
   'sourceSnapshot',v_source,'sourceSha256',v_source_hash,
   'artifactBucket','iberfit-evolution-issued-reports');
END $fn$;

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
 IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
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

CREATE OR REPLACE FUNCTION public.iberfit_m44_authorize_evolution_report_pdf_v1(p_issuance_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor uuid:=auth.uid();v_role text:=public.iberfit_current_role_v26();
 v_issue public.iberfit_evolution_report_issuances_v1%rowtype;
 v_report public.reports%rowtype;
 v_manager boolean;
BEGIN
 IF v_actor IS NULL OR p_issuance_id IS NULL THEN
   RAISE EXCEPTION 'M44_PDF_OPEN_NOT_AUTHORIZED' USING errcode='42501';END IF;
 SELECT * INTO v_issue FROM public.iberfit_evolution_report_issuances_v1 WHERE id=p_issuance_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'M44_PDF_OPEN_NOT_FOUND' USING errcode='22023';END IF;
 SELECT * INTO v_report FROM public.reports WHERE id=v_issue.report_id AND client_id=v_issue.client_id;
 v_manager:=coalesce(v_role,'') IN ('coach','admin')
   AND coalesce(public.iberfit_can_access_client_v26(v_issue.client_id),false)
   AND (v_role<>'coach' OR coalesce(public.is_assigned_coach(v_issue.client_id),false));
 IF NOT v_manager THEN
   IF v_role<>'cliente' OR public.iberfit_client_id() IS DISTINCT FROM v_issue.client_id
     OR v_issue.status<>'issued' OR v_report.status<>'publicado'
     OR v_report.audience<>'cliente'
   THEN RAISE EXCEPTION 'M44_PDF_OPEN_SCOPE_FORBIDDEN' USING errcode='42501';END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'issuanceId',v_issue.id,'reportId',v_issue.report_id,
  'version',v_issue.version,'artifactBucket',v_issue.artifact_bucket,
  'artifactPath',v_issue.artifact_path,'artifactSha256',v_issue.artifact_sha256,
  'artifactSizeBytes',v_issue.artifact_size_bytes,'withdrawn',v_issue.status='withdrawn');
END $fn$;

CREATE OR REPLACE FUNCTION public.iberfit_m44_withdraw_evolution_report_pdf_v1(
 p_issuance_id uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor uuid:=auth.uid();v_role text:=public.iberfit_current_role_v26();
 v_issue public.iberfit_evolution_report_issuances_v1%rowtype;
BEGIN
 IF v_actor IS NULL OR coalesce(v_role,'') NOT IN ('coach','admin')
   OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500
 THEN RAISE EXCEPTION 'M44_PDF_WITHDRAW_INVALID_ROLE_OR_REASON' USING errcode='42501';END IF;
 SELECT * INTO v_issue FROM public.iberfit_evolution_report_issuances_v1
   WHERE id=p_issuance_id FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(public.iberfit_can_access_client_v26(v_issue.client_id),false)
   OR (v_role='coach' AND NOT coalesce(public.is_assigned_coach(v_issue.client_id),false))
 THEN RAISE EXCEPTION 'M44_PDF_WITHDRAW_SCOPE_FORBIDDEN' USING errcode='42501';END IF;
 IF v_issue.status='withdrawn' THEN
  RETURN jsonb_build_object('ok',true,'kind','already-withdrawn','issuanceId',v_issue.id);
 END IF;
 UPDATE public.iberfit_evolution_report_issuances_v1
 SET status='withdrawn',withdrawn_at=now(),withdrawn_by=v_actor,withdrawn_reason=btrim(p_reason)
 WHERE id=p_issuance_id;
 RETURN jsonb_build_object('ok',true,'kind','withdrawn','issuanceId',v_issue.id);
END $fn$;

REVOKE ALL ON FUNCTION public.iberfit_m44_prepare_evolution_report_issue_v1(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.iberfit_m44_withdraw_evolution_report_pdf_v1(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_prepare_evolution_report_issue_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_withdraw_evolution_report_pdf_v1(uuid,text) TO authenticated;
