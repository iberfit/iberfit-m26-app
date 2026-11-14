-- IBERFIT M1 U72 production guarded reverse. ONLY after new starts
-- are frozen, all journals drained, no active/paused dated execution remains,
-- and both public U60 entrypoints have been revoked by the original
-- 20261112_m1_u60_prod_guarded_disable.sql. No deletion of training history.
BEGIN;
DO $m1_production_u72_rollback_preflight$
BEGIN

  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'PRODUCTION'
    OR (SELECT (value#>>'{}')::boolean FROM public.iberfit_system_settings WHERE key='real_data_allowed') IS DISTINCT FROM true
    OR (SELECT (value#>>'{}')::boolean FROM public.iberfit_system_settings WHERE key='production_blocked') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'M1_U72_PROD_ENVIRONMENT_DENIED' USING errcode='42501';
  END IF;
  IF has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR EXISTS (SELECT 1 FROM public.training_session_occurrences_v1 WHERE status='en_curso')
    OR EXISTS (SELECT 1 FROM public.domain_entities_v26 WHERE entity_type='session_execution' AND status='pausada')
    THEN RAISE EXCEPTION 'M1_U72_PROD_MUST_BE_CLOSED_AND_DRAINED' USING errcode='42501';
  END IF;
  IF md5(pg_get_functiondef('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)'::regprocedure))<>'1270cf1db8c9a162ccc5736207a258e1'
    THEN RAISE EXCEPTION 'M1_U72_CANDIDATE_U72_DRIFT'; END IF;
  IF md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))<>'944aaac897289954a9c589292d8faf87'
    THEN RAISE EXCEPTION 'M1_U72_CANDIDATE_GATEWAY_DRIFT'; END IF;
  IF md5(pg_get_functiondef('private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'::regprocedure))<>'dd1027122e0843b44529cf87dad746b5'
    THEN RAISE EXCEPTION 'M1_U72_CANDIDATE_DETAIL_DRIFT'; END IF;
  IF md5(pg_get_functiondef('private.iberfit_u60_dated_mirror_receipt_guard_v1()'::regprocedure))<>'65e675f56c67aa8f9ddc4b36f3a9a73d'
    THEN RAISE EXCEPTION 'M1_U72_CANDIDATE_RECEIPT_GUARD_DRIFT'; END IF;

  IF EXISTS(SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    WHERE p.oid='private.iberfit_u72_occurrence_pause_resume_v1(jsonb)'::regprocedure
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE')
  OR has_function_privilege('authenticated','private.iberfit_u72_occurrence_pause_resume_v1(jsonb)','EXECUTE')
  OR has_function_privilege('anon','private.iberfit_u72_occurrence_pause_resume_v1(jsonb)','EXECUTE')
  OR has_function_privilege('service_role','private.iberfit_u72_occurrence_pause_resume_v1(jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid IN (
     'private.iberfit_u72_occurrence_pause_resume_v1(jsonb)'::regprocedure,
     'public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure,
     'private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'::regprocedure,
     'private.iberfit_u60_dated_mirror_receipt_guard_v1()'::regprocedure)
     AND (NOT p.prosecdef OR pg_get_userbyid(p.proowner)<>'postgres'
       OR NOT (p.proconfig @> ARRAY['search_path=""']::text[]))) THEN
    RAISE EXCEPTION 'M1_U72_PROD_AUTH_ACL_DRIFT' USING errcode='42501';
  END IF;
END $m1_production_u72_rollback_preflight$;
DO $u72_materialization_required$ BEGIN RAISE EXCEPTION 'M1_U72_MATERIALIZATION_REQUIRED'; END $u72_materialization_required$;
DO $m1_production_u72_rollback_verify$
BEGIN
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'PRODUCTION'
  OR to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NOT NULL
  THEN RAISE EXCEPTION 'M1_U72_PROD_ROLLBACK_STATE_INVALID'; END IF;
  IF md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))<>'5914acf371015a6bbeeaf95f99e056e3'
    THEN RAISE EXCEPTION 'M1_U72_BASELINE_GATEWAY_DRIFT'; END IF;
  IF md5(pg_get_functiondef('private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'::regprocedure))<>'35862b8e4977fcf0c3d611937fe83126'
    THEN RAISE EXCEPTION 'M1_U72_BASELINE_DETAIL_DRIFT'; END IF;
  IF md5(pg_get_functiondef('private.iberfit_u60_dated_mirror_receipt_guard_v1()'::regprocedure))<>'f97d7df4fdd510b63ac1249352273927'
    THEN RAISE EXCEPTION 'M1_U72_BASELINE_RECEIPT_GUARD_DRIFT'; END IF;
END $m1_production_u72_rollback_verify$;
COMMIT;
