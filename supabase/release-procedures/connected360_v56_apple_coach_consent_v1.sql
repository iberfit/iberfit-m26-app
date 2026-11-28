-- Candidate only, after V49 and V53-V55. Separate Apple consent, existing ledger.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF to_regprocedure('private.m26_v53_apple_exercise_source_state(uuid,uuid,boolean)') IS NULL
 OR to_regprocedure('public.m26_wearable_v55_apple_owner_history_v1(timestamptz,uuid)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.m26_wearable_coach_consent_v49'::regclass AND conname='m26_v49_consent_provider_purpose_check' AND convalidated)
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='private.m26_wearable_coach_consent_v49'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r(role_name) CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) a(action) WHERE has_table_privilege(r.role_name,'private.m26_wearable_coach_consent_v49',a.action))
 OR NOT EXISTS(SELECT 1 FROM public.m26_wearable_v46_release_control_prod WHERE id=true AND apple_exercise_enabled=false)
 THEN RAISE EXCEPTION 'M26_V56_PREREQUISITES_REQUIRED'; END IF;
END $guard$;
CREATE FUNCTION private.m26_v56_set_apple_coach_consent(
 p_coach uuid,p_assignment uuid,p_expected_revision integer,p_allow boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_owner uuid:=auth.uid();
 v_client uuid:=private.m26_v53_apple_client_context();
 v_enabled boolean;
 v_a public.client_assignments%rowtype;
 v_b public.iberfit_coach_client_assignments%rowtype;
 v_old private.m26_wearable_coach_consent_v49%rowtype;
 v_auth jsonb;
 v_context jsonb;
 v_day date:=(pg_catalog.now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
 IF v_owner IS NULL OR v_client IS NULL OR p_coach IS NULL OR p_coach=v_owner
    OR p_allow IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>=2147483647 OR (p_allow AND p_assignment IS NULL) OR (NOT p_allow AND p_assignment IS NOT NULL)
    OR NOT private.m26_v49_live_session()
    OR NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.user_id=v_owner AND p.client_id=v_client AND p.role::text='client') THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V56_CONSENT_FORBIDDEN';
 END IF;
 IF p_allow THEN
   SELECT enabled AND apple_exercise_enabled INTO v_enabled FROM public.m26_wearable_v46_release_control_prod WHERE id=true FOR SHARE;
   IF v_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'M26_V56_APPLE_DISABLED' USING ERRCODE='42501'; END IF;
 END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
   'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint)) THEN
   RAISE EXCEPTION USING ERRCODE='55P03',MESSAGE='M26_V56_RETRY';
 END IF;
 IF private.m26_v53_apple_client_context() IS DISTINCT FROM v_client THEN RAISE EXCEPTION 'M26_V56_CLIENT_CHANGED' USING ERRCODE='42501'; END IF;
 IF p_allow THEN
   v_context:=public.iberfit_application_context_v14();
   IF v_context->>'membershipStatus' IS DISTINCT FROM 'active'
      OR NOT EXISTS(SELECT 1 FROM private.m26_v49_eligible_assignments(v_client,(v_context->>'organizationId')::uuid,v_day) e
        WHERE e.coach_id=p_coach AND e.assignment_id=p_assignment) THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V56_ASSIGNMENT_REQUIRED';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM public.m26_wearable_v46_release_control_prod WHERE id=true AND enabled=true)
      OR NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.user_id=p_coach AND p.role::text='coach') THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V56_CONSENT_FORBIDDEN';
   END IF;
   SELECT * INTO v_a FROM public.client_assignments a
    WHERE a.client_id=v_client AND a.coach_user_id=p_coach AND a.active FOR SHARE;
   SELECT * INTO v_b FROM public.iberfit_coach_client_assignments b
    WHERE b.id=p_assignment AND b.client_id=v_client::text AND b.coach_user_id=p_coach
      AND b.organization_id=(v_context->>'organizationId')::uuid AND b.status='active' AND b.starts_at<=v_day AND (b.ends_at IS NULL OR b.ends_at>=v_day) FOR SHARE;
   IF v_a.client_id IS NULL OR v_b.id IS NULL OR NOT EXISTS(SELECT 1 FROM private.m26_v49_eligible_assignments(v_client,(v_context->>'organizationId')::uuid,v_day) e WHERE e.coach_id=p_coach AND e.assignment_id=v_b.id AND e.assignment_revision=v_b.revision AND e.legacy_created_at=v_a.created_at) THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V56_ASSIGNMENT_REQUIRED';
   END IF;
   v_auth:=private.m26_v53_apple_exercise_source_state(v_owner,v_client,v_enabled);
   IF (v_auth->>'authorized') IS DISTINCT FROM 'true'
      OR v_auth->'scopes' IS DISTINCT FROM '["exerciseSessions"]'::jsonb THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V56_SOURCE_CONSENT_REQUIRED';
   END IF;
 END IF;
 SELECT * INTO v_old FROM private.m26_wearable_coach_consent_v49 g
   WHERE g.owner_user_id=v_owner AND g.client_id=v_client AND g.coach_user_id=p_coach AND g.provider='apple_health' FOR UPDATE;
 IF coalesce(v_old.consent_revision,0)<>p_expected_revision THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='M26_V56_CONSENT_STALE';
 END IF;
 IF NOT p_allow THEN
   IF v_old.consent_revision IS NULL OR v_old.revoked_at IS NOT NULL THEN
     RETURN pg_catalog.jsonb_build_object('ok',true,'provider','apple_health','shared',false,'revision',coalesce(v_old.consent_revision,0));
   END IF;
   UPDATE private.m26_wearable_coach_consent_v49 SET revoked_at=pg_catalog.now(),consent_revision=consent_revision+1
    WHERE owner_user_id=v_owner AND client_id=v_client AND coach_user_id=p_coach AND provider='apple_health';
 ELSE
   INSERT INTO private.m26_wearable_coach_consent_v49(owner_user_id,client_id,coach_user_id,assignment_id,
     assignment_revision,legacy_assignment_created_at,source_grant_id,source_cursor,consent_revision,provider,purpose)
   VALUES(v_owner,v_client,p_coach,v_b.id,v_b.revision,v_a.created_at,(v_auth->>'grantId')::uuid,
     (v_auth->>'revocationCursor')::bigint,p_expected_revision+1,'apple_health','coaching-apple-exercise-days-v1')
   ON CONFLICT(owner_user_id,client_id,coach_user_id,provider) DO UPDATE SET
     assignment_id=excluded.assignment_id,assignment_revision=excluded.assignment_revision,
     legacy_assignment_created_at=excluded.legacy_assignment_created_at,source_grant_id=excluded.source_grant_id,
     source_cursor=excluded.source_cursor,consent_revision=excluded.consent_revision,
     granted_at=pg_catalog.now(),revoked_at=NULL;
 END IF;
 RETURN pg_catalog.jsonb_build_object('ok',true,'provider','apple_health','shared',p_allow,'revision',p_expected_revision+1);
END;
$f$;
CREATE FUNCTION private.m26_v56_my_apple_coach_recipients()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_owner uuid:=auth.uid();
 v_client uuid:=private.m26_v53_apple_client_context();
 v_context jsonb;
 v_auth jsonb;
 v_enabled boolean;
 v_day date:=(pg_catalog.now() AT TIME ZONE 'America/Santiago')::date;
 v_rows jsonb;
BEGIN
 IF v_owner IS NULL OR v_client IS NULL OR NOT private.m26_v49_live_session()
   OR NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.user_id=v_owner AND p.client_id=v_client AND p.role::text='client') THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V56_CONSENT_FORBIDDEN';
 END IF;
 SELECT enabled AND apple_exercise_enabled INTO v_enabled FROM public.m26_wearable_v46_release_control_prod WHERE id=true FOR SHARE;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint)) THEN RAISE EXCEPTION 'M26_V56_RETRY' USING ERRCODE='55P03'; END IF;
 IF private.m26_v53_apple_client_context() IS DISTINCT FROM v_client THEN RAISE EXCEPTION 'M26_V56_CLIENT_CHANGED' USING ERRCODE='42501'; END IF;
 v_context:=public.iberfit_application_context_v14();
 v_auth:=private.m26_v53_apple_exercise_source_state(v_owner,v_client,v_enabled);
 v_enabled:=coalesce(v_context->>'membershipStatus'='active',false)
   AND EXISTS(SELECT 1 FROM public.m26_wearable_v46_release_control_prod WHERE id=true AND enabled=true)
   AND coalesce(v_auth->>'authorized'='true',false)
   AND coalesce((v_auth->'scopes')?'exerciseSessions',false);
 -- BEGIN RECIPIENT PROJECTION
 WITH eligible AS (
   SELECT e.* FROM private.m26_v49_eligible_assignments(v_client,(v_context->>'organizationId')::uuid,v_day) e
   WHERE v_enabled AND e.coach_id<>v_owner
 ), decisions AS (
   SELECT g.* FROM private.m26_wearable_coach_consent_v49 g
   WHERE g.owner_user_id=v_owner AND g.client_id=v_client AND g.provider='apple_health'
 ), recipients AS (
   SELECT coalesce(e.coach_id,g.coach_user_id) AS coach_id,e.assignment_id,
     coalesce(nullif(pg_catalog.btrim(pg_catalog.left(pg_catalog.regexp_replace(p.display_name,'[[:cntrl:]]','','g'),160)),''),'Entrenador') AS display_name,
     e.coach_id IS NOT NULL AS eligible,
     g.consent_revision IS NOT NULL AND g.revoked_at IS NULL AS recorded,
     coalesce(e.coach_id IS NOT NULL AND g.revoked_at IS NULL
       AND g.assignment_id=e.assignment_id AND g.assignment_revision=e.assignment_revision
       AND g.legacy_assignment_created_at=e.legacy_created_at
       AND g.source_grant_id=(v_auth->>'grantId')::uuid
       AND g.source_cursor=(v_auth->>'revocationCursor')::bigint,false) AS effective,
     coalesce(g.consent_revision,0) AS revision
   FROM eligible e FULL JOIN decisions g ON g.coach_user_id=e.coach_id
   LEFT JOIN public.user_profiles p ON p.user_id=coalesce(e.coach_id,g.coach_user_id)
   WHERE e.coach_id IS NOT NULL OR (g.consent_revision IS NOT NULL AND g.revoked_at IS NULL)
 ), bounded AS (
   SELECT * FROM recipients ORDER BY recorded DESC,coach_id LIMIT 21
 )
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'coachId',coach_id,'assignmentId',assignment_id,'displayName',display_name,
   'eligible',eligible,'recorded',recorded,'effective',effective,'revision',revision)
   ORDER BY recorded DESC,coach_id),'[]'::jsonb) INTO v_rows FROM bounded;
 -- END RECIPIENT PROJECTION
 IF pg_catalog.jsonb_array_length(v_rows)>20 THEN
   RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='M26_V56_RECIPIENT_LIMIT';
 END IF;
 RETURN pg_catalog.jsonb_build_object('ok',true,'schema','iberfit.connected360.apple-coach-recipients.v1','provider','apple_health',
   'clientId',v_client,'purpose','coaching-apple-exercise-days-v1','recipients',v_rows);
END;
$f$;
CREATE FUNCTION private.m26_v56_apple_coach_exercise_days(p_client uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_coach uuid:=auth.uid();
 v_owner uuid;
 v_g private.m26_wearable_coach_consent_v49%rowtype;
 v_context jsonb; v_enabled boolean; v_auth jsonb;
 v_day date:=(pg_catalog.now() AT TIME ZONE 'America/Santiago')::date;
 v_rows jsonb;
BEGIN
 IF v_coach IS NULL OR p_client IS NULL OR NOT private.m26_v49_live_session()
    OR public.iberfit_current_role_v26() IS DISTINCT FROM 'coach' THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V56_COACH_FORBIDDEN';
 END IF;
 PERFORM public.iberfit_require_privileged_assurance_v65d();
 v_context:=public.iberfit_application_context_v14();
 IF v_context->>'membershipStatus' IS DISTINCT FROM 'active'
    OR NOT coalesce((v_context->'roles')?'coach',false)
    OR coalesce((v_context->'roles')?'admin',false)
    THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V56_COACH_FORBIDDEN';
 END IF;
 SELECT enabled AND apple_exercise_enabled INTO v_enabled FROM public.m26_wearable_v46_release_control_prod WHERE id=true FOR SHARE;
 IF v_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'M26_V56_APPLE_DISABLED' USING ERRCODE='42501'; END IF;
 -- Resolve the owner from the current profile, never a caller-provided ID.
 SELECT min(p.user_id::text)::uuid INTO v_owner FROM public.user_profiles p
  WHERE p.client_id=p_client AND p.role::text='client'
  HAVING count(*)=1;
 IF v_owner IS NULL OR NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
   'iberfit:wfence:v1:'||v_owner::text||':'||p_client::text,0::bigint)) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V56_COACH_UNAVAILABLE';
 END IF;
 -- Recheck the actor and owner after the fence; mixed roles fail closed.
 IF NOT private.m26_v49_live_session() OR public.iberfit_current_role_v26() IS DISTINCT FROM 'coach'
 OR NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.user_id=v_owner AND p.client_id=p_client AND p.role::text='client')
 OR EXISTS(SELECT 1 FROM public.user_application_roles r WHERE r.user_id=v_owner AND r.active AND r.role::text IN ('coach','admin'))
 THEN RAISE EXCEPTION 'M26_V56_COACH_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 v_context:=public.iberfit_application_context_v14();
 IF v_context->>'membershipStatus' IS DISTINCT FROM 'active' OR NOT coalesce((v_context->'roles')?'coach',false) OR coalesce((v_context->'roles')?'admin',false)
 THEN RAISE EXCEPTION 'M26_V56_COACH_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 v_auth:=private.m26_v53_apple_exercise_source_state(v_owner,p_client,v_enabled);
 IF v_auth->>'authorized' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'M26_V56_COACH_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 -- Recheck both live assignment models and the exact source generation.
 SELECT g.* INTO v_g FROM private.m26_wearable_coach_consent_v49 g
 JOIN public.client_assignments a ON a.client_id=g.client_id AND a.coach_user_id=g.coach_user_id
   AND a.active AND a.created_at=g.legacy_assignment_created_at
 JOIN public.iberfit_coach_client_assignments b ON b.id=g.assignment_id AND b.revision=g.assignment_revision
   AND b.client_id=g.client_id::text AND b.coach_user_id=g.coach_user_id
   AND b.organization_id=(v_context->>'organizationId')::uuid AND b.status='active'
   AND b.starts_at<=v_day AND (b.ends_at IS NULL OR b.ends_at>=v_day)
 JOIN public.m26_wearable_authorization_sources_v3 s ON s.owner_user_id=g.owner_user_id AND s.client_id=g.client_id
   AND s.provider='apple_health' AND s.grant_id=g.source_grant_id AND s.revocation_cursor=g.source_cursor
   AND s.scopes=ARRAY['exerciseSessions']::text[]
 WHERE g.owner_user_id=v_owner AND g.client_id=p_client AND g.coach_user_id=v_coach AND g.revoked_at IS NULL AND g.provider='apple_health' AND g.purpose='coaching-apple-exercise-days-v1'
   AND g.source_grant_id=(v_auth->>'grantId')::uuid AND g.source_cursor=(v_auth->>'revocationCursor')::bigint
   AND EXISTS(SELECT 1 FROM private.m26_v49_eligible_assignments(p_client,(v_context->>'organizationId')::uuid,v_day) e WHERE e.coach_id=v_coach AND e.assignment_id=g.assignment_id)
   AND g.source_cursor>=coalesce((SELECT max(e.id) FROM public.m26_wearable_revocation_events_v2 e
       WHERE e.owner_user_id=g.owner_user_id AND e.client_id=g.client_id AND e.provider IN('apple_health','*')),0)
 FOR SHARE OF a,b,g,s;
 IF v_g.owner_user_id IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V56_COACH_UNAVAILABLE';
 END IF;
 -- BEGIN MINIMAL PROJECTION
 WITH observed AS (
   SELECT DISTINCT (w.observed_started_at AT TIME ZONE 'America/Santiago')::date AS day,w.sport
   FROM public.m26_wearable_exercise_evidence_v46 w
   WHERE w.owner_user_id=v_owner AND w.client_id=p_client AND w.provider='apple_health'
     AND w.grant_id=v_g.source_grant_id AND w.revocation_cursor=v_g.source_cursor AND w.link_status='unlinked'
     AND w.observed_started_at>=((v_day-6)::timestamp AT TIME ZONE 'America/Santiago')
     AND w.observed_ended_at<=pg_catalog.now()
 ), by_day AS (
   SELECT day,pg_catalog.jsonb_agg(sport ORDER BY sport) sports FROM observed
   WHERE day BETWEEN v_day-6 AND v_day GROUP BY day
 )
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('date',day,'sports',sports) ORDER BY day DESC),'[]'::jsonb)
 INTO v_rows FROM by_day;
 -- END MINIMAL PROJECTION
 RETURN pg_catalog.jsonb_build_object('ok',true,'schema','iberfit.connected360.apple-coach-exercise-days.v1',
   'clientId',p_client,'provider','apple_health','coverage','partial','periodStart',v_day-6,'periodEnd',v_day,'days',v_rows);
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v56_set_apple_coach_consent(uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.m26_v56_set_apple_coach_consent(uuid,uuid,integer,boolean) TO authenticated;
CREATE FUNCTION public.m26_wearable_v56_set_apple_coach_consent_v1(p_coach uuid,p_assignment uuid,p_expected_revision integer,p_allow boolean) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v56_set_apple_coach_consent(p_coach,p_assignment,p_expected_revision,p_allow) $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v56_set_apple_coach_consent_v1(uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v56_set_apple_coach_consent_v1(uuid,uuid,integer,boolean) TO authenticated;
REVOKE ALL ON FUNCTION private.m26_v56_my_apple_coach_recipients() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.m26_v56_my_apple_coach_recipients() TO authenticated;
CREATE FUNCTION public.m26_wearable_v56_my_apple_coach_recipients_v1() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v56_my_apple_coach_recipients() $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v56_my_apple_coach_recipients_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v56_my_apple_coach_recipients_v1() TO authenticated;
REVOKE ALL ON FUNCTION private.m26_v56_apple_coach_exercise_days(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.m26_v56_apple_coach_exercise_days(uuid) TO authenticated;
CREATE FUNCTION public.m26_wearable_v56_apple_coach_exercise_days_v1(p_client uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v56_apple_coach_exercise_days(p_client) $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v56_apple_coach_exercise_days_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v56_apple_coach_exercise_days_v1(uuid) TO authenticated;
COMMIT;
