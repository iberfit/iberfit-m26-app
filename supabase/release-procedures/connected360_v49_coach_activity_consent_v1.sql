-- CANDIDATE ONLY; not a migration or an installed API. Requires restored PROD
-- schema, authenticated tests, approved consent notice and coordinated UI.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE TABLE private.m26_wearable_coach_consent_v49(
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  coach_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL,
  assignment_revision integer NOT NULL CHECK(assignment_revision>=1),
  legacy_assignment_created_at timestamptz NOT NULL,
  source_grant_id uuid NOT NULL,
  source_cursor bigint NOT NULL CHECK(source_cursor>=0),
  consent_revision integer NOT NULL CHECK(consent_revision>=1),
  purpose text NOT NULL CHECK(purpose='coaching-exercise-days-v1'),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY(owner_user_id,client_id,coach_user_id),
  CHECK(owner_user_id<>coach_user_id)
);
ALTER TABLE private.m26_wearable_coach_consent_v49 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.m26_wearable_coach_consent_v49 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.m26_wearable_coach_consent_v49 FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX m26_v49_coach_consent_recipient_idx
  ON private.m26_wearable_coach_consent_v49(client_id,coach_user_id) WHERE revoked_at IS NULL;

-- A deactivated/deleted assignment must never revive old permission on
-- reactivation, even if a legacy row is reused without a revision bump.
CREATE FUNCTION private.m26_v49_invalidate_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
BEGIN
  IF TG_TABLE_NAME='client_assignments' THEN
    IF TG_OP='UPDATE' THEN
      IF OLD.active IS NOT DISTINCT FROM NEW.active
         AND OLD.created_at IS NOT DISTINCT FROM NEW.created_at
         AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id
         AND OLD.coach_user_id IS NOT DISTINCT FROM NEW.coach_user_id THEN RETURN NEW; END IF;
    END IF;
    UPDATE private.m26_wearable_coach_consent_v49
      SET revoked_at=pg_catalog.now(),consent_revision=consent_revision+1
      WHERE client_id=OLD.client_id AND coach_user_id=OLD.coach_user_id AND revoked_at IS NULL;
  ELSE
    IF TG_OP='UPDATE' THEN
      IF OLD.id IS NOT DISTINCT FROM NEW.id
         AND OLD.revision IS NOT DISTINCT FROM NEW.revision
         AND OLD.status IS NOT DISTINCT FROM NEW.status
         AND OLD.starts_at IS NOT DISTINCT FROM NEW.starts_at
         AND OLD.ends_at IS NOT DISTINCT FROM NEW.ends_at
         AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
         AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id
         AND OLD.coach_user_id IS NOT DISTINCT FROM NEW.coach_user_id THEN RETURN NEW; END IF;
    END IF;
    UPDATE private.m26_wearable_coach_consent_v49
      SET revoked_at=pg_catalog.now(),consent_revision=consent_revision+1
      WHERE assignment_id=OLD.id AND revoked_at IS NULL;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v49_invalidate_assignment() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER m26_v49_invalidate_legacy_assignment AFTER UPDATE OR DELETE ON public.client_assignments
FOR EACH ROW EXECUTE FUNCTION private.m26_v49_invalidate_assignment();
CREATE TRIGGER m26_v49_invalidate_versioned_assignment AFTER UPDATE OR DELETE ON public.iberfit_coach_client_assignments
FOR EACH ROW EXECUTE FUNCTION private.m26_v49_invalidate_assignment();

CREATE FUNCTION private.m26_v49_live_session() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $f$
  SELECT EXISTS(SELECT 1 FROM auth.sessions s
    WHERE s.id::text=auth.jwt()->>'session_id' AND s.user_id=auth.uid()
      AND (s.not_after IS NULL OR s.not_after>pg_catalog.now()))
$f$;
REVOKE ALL ON FUNCTION private.m26_v49_live_session() FROM PUBLIC,anon,authenticated,service_role;

-- Only the owner makes the explicit decision; no admin/coach proxy.
-- Compare-and-set revision prevents a stale grant retry resurrecting consent.
CREATE FUNCTION private.m26_v49_set_coach_consent(
 p_coach uuid,p_assignment uuid,p_expected_revision integer,p_allow boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_owner uuid:=auth.uid();
 v_client uuid:=public.iberfit_client_id();
 v_a public.client_assignments%rowtype;
 v_b public.iberfit_coach_client_assignments%rowtype;
 v_old private.m26_wearable_coach_consent_v49%rowtype;
 v_auth jsonb;
 v_day date:=(pg_catalog.now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
 IF v_owner IS NULL OR v_client IS NULL OR p_coach IS NULL OR p_coach=v_owner
    OR p_allow IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
    OR NOT private.m26_v49_live_session()
    OR NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.user_id=v_owner AND p.client_id=v_client AND p.role::text='client') THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V49_CONSENT_FORBIDDEN';
 END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
   'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint)) THEN
   RAISE EXCEPTION USING ERRCODE='55P03',MESSAGE='M26_V49_RETRY';
 END IF;
 IF p_allow THEN
   IF NOT EXISTS(SELECT 1 FROM public.m26_wearable_v46_release_control_prod WHERE id=true AND enabled=true)
      OR NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.user_id=p_coach AND p.role::text='coach') THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V49_CONSENT_FORBIDDEN';
   END IF;
   SELECT * INTO v_a FROM public.client_assignments a
    WHERE a.client_id=v_client AND a.coach_user_id=p_coach AND a.active FOR SHARE;
   SELECT * INTO v_b FROM public.iberfit_coach_client_assignments b
    WHERE b.id=p_assignment AND b.client_id=v_client::text AND b.coach_user_id=p_coach
      AND b.status='active' AND b.starts_at<=v_day AND (b.ends_at IS NULL OR b.ends_at>=v_day) FOR SHARE;
   IF v_a.client_id IS NULL OR v_b.id IS NULL THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V49_ASSIGNMENT_REQUIRED';
   END IF;
   v_auth:=public.m26_wearable_authorization_status_v2('health_connect');
   IF (v_auth->>'authorized') IS DISTINCT FROM 'true'
      OR NOT coalesce((v_auth->'scopes')?'exerciseSessions',false) THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V49_SOURCE_CONSENT_REQUIRED';
   END IF;
 END IF;
 SELECT * INTO v_old FROM private.m26_wearable_coach_consent_v49 g
   WHERE g.owner_user_id=v_owner AND g.client_id=v_client AND g.coach_user_id=p_coach FOR UPDATE;
 IF coalesce(v_old.consent_revision,0)<>p_expected_revision THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='M26_V49_CONSENT_STALE';
 END IF;
 IF NOT p_allow THEN
   IF v_old.consent_revision IS NULL OR v_old.revoked_at IS NOT NULL THEN
     RETURN pg_catalog.jsonb_build_object('ok',true,'shared',false,'revision',coalesce(v_old.consent_revision,0));
   END IF;
   UPDATE private.m26_wearable_coach_consent_v49 SET revoked_at=pg_catalog.now(),consent_revision=consent_revision+1
    WHERE owner_user_id=v_owner AND client_id=v_client AND coach_user_id=p_coach;
 ELSE
   INSERT INTO private.m26_wearable_coach_consent_v49(owner_user_id,client_id,coach_user_id,assignment_id,
     assignment_revision,legacy_assignment_created_at,source_grant_id,source_cursor,consent_revision,purpose)
   VALUES(v_owner,v_client,p_coach,v_b.id,v_b.revision,v_a.created_at,(v_auth->>'grantId')::uuid,
     (v_auth->>'revocationCursor')::bigint,p_expected_revision+1,'coaching-exercise-days-v1')
   ON CONFLICT(owner_user_id,client_id,coach_user_id) DO UPDATE SET
     assignment_id=excluded.assignment_id,assignment_revision=excluded.assignment_revision,
     legacy_assignment_created_at=excluded.legacy_assignment_created_at,source_grant_id=excluded.source_grant_id,
     source_cursor=excluded.source_cursor,consent_revision=excluded.consent_revision,
     granted_at=pg_catalog.now(),revoked_at=NULL;
 END IF;
 RETURN pg_catalog.jsonb_build_object('ok',true,'shared',p_allow,'revision',p_expected_revision+1);
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v49_set_coach_consent(uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.m26_v49_set_coach_consent(uuid,uuid,integer,boolean) TO authenticated;
CREATE FUNCTION public.m26_wearable_v49_set_coach_consent_v1(p_coach uuid,p_assignment uuid,p_expected_revision integer,p_allow boolean)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v49_set_coach_consent(p_coach,p_assignment,p_expected_revision,p_allow) $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v49_set_coach_consent_v1(uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v49_set_coach_consent_v1(uuid,uuid,integer,boolean) TO authenticated;

-- Owner-only status for explicit grant/withdraw UI. No health records.
CREATE FUNCTION private.m26_v49_my_coach_consent_status(p_coach uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_owner uuid:=auth.uid(); v_client uuid:=public.iberfit_client_id(); v_g private.m26_wearable_coach_consent_v49%rowtype;
BEGIN
 IF v_owner IS NULL OR v_client IS NULL OR p_coach IS NULL OR NOT private.m26_v49_live_session()
   OR NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.user_id=v_owner AND p.client_id=v_client AND p.role::text='client') THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V49_CONSENT_FORBIDDEN';
 END IF;
 SELECT * INTO v_g FROM private.m26_wearable_coach_consent_v49 g
 WHERE g.owner_user_id=v_owner AND g.client_id=v_client AND g.coach_user_id=p_coach;
 -- "recorded" describes the decision, not effective source authorization.
 RETURN pg_catalog.jsonb_build_object('ok',true,'recorded',v_g.consent_revision IS NOT NULL AND v_g.revoked_at IS NULL,
  'revision',coalesce(v_g.consent_revision,0),'purpose','coaching-exercise-days-v1');
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v49_my_coach_consent_status(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.m26_v49_my_coach_consent_status(uuid) TO authenticated;
CREATE FUNCTION public.m26_wearable_v49_my_coach_consent_status_v1(p_coach uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v49_my_coach_consent_status(p_coach) $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v49_my_coach_consent_status_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v49_my_coach_consent_status_v1(uuid) TO authenticated;

-- Professional minimal context: distinct Chilean dates and sports only.
-- No source keys, HR, distance, routes or report publishing authority.
CREATE FUNCTION private.m26_v49_coach_exercise_days(p_client uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_coach uuid:=auth.uid();
 v_owner uuid;
 v_g private.m26_wearable_coach_consent_v49%rowtype;
 v_context jsonb;
 v_day date:=(pg_catalog.now() AT TIME ZONE 'America/Santiago')::date;
 v_rows jsonb;
BEGIN
 IF v_coach IS NULL OR p_client IS NULL OR NOT private.m26_v49_live_session()
    OR public.iberfit_current_role_v26() IS DISTINCT FROM 'coach' THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V49_COACH_FORBIDDEN';
 END IF;
 PERFORM public.iberfit_require_privileged_assurance_v65d();
 v_context:=public.iberfit_application_context_v14();
 IF v_context->>'membershipStatus' IS DISTINCT FROM 'active'
    OR NOT coalesce((v_context->'roles')?'coach',false)
    OR coalesce((v_context->'roles')?'admin',false)
    OR NOT EXISTS(SELECT 1 FROM public.m26_wearable_v46_release_control_prod WHERE id=true AND enabled=true) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V49_COACH_FORBIDDEN';
 END IF;
 -- Resolve the owner from the current profile, never a caller-provided ID.
 SELECT min(p.user_id::text)::uuid INTO v_owner FROM public.user_profiles p
  WHERE p.client_id=p_client AND p.role::text='client'
  HAVING count(*)=1;
 IF v_owner IS NULL OR NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
   'iberfit:wfence:v1:'||v_owner::text||':'||p_client::text,0::bigint)) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V49_COACH_UNAVAILABLE';
 END IF;
 -- Recheck both live assignment models and the exact source generation.
 SELECT g.* INTO v_g FROM private.m26_wearable_coach_consent_v49 g
 JOIN public.client_assignments a ON a.client_id=g.client_id AND a.coach_user_id=g.coach_user_id
   AND a.active AND a.created_at=g.legacy_assignment_created_at
 JOIN public.iberfit_coach_client_assignments b ON b.id=g.assignment_id AND b.revision=g.assignment_revision
   AND b.client_id=g.client_id::text AND b.coach_user_id=g.coach_user_id
   AND b.organization_id=(v_context->>'organizationId')::uuid AND b.status='active'
   AND b.starts_at<=v_day AND (b.ends_at IS NULL OR b.ends_at>=v_day)
 JOIN public.m26_wearable_authorization_sources_v3 s ON s.owner_user_id=g.owner_user_id AND s.client_id=g.client_id
   AND s.provider='health_connect' AND s.grant_id=g.source_grant_id AND s.revocation_cursor=g.source_cursor
   AND 'exerciseSessions'=ANY(s.scopes)
 WHERE g.owner_user_id=v_owner AND g.client_id=p_client AND g.coach_user_id=v_coach AND g.revoked_at IS NULL
   AND g.source_cursor>=coalesce((SELECT max(e.id) FROM public.m26_wearable_revocation_events_v2 e
       WHERE e.owner_user_id=g.owner_user_id AND e.client_id=g.client_id AND e.provider IN('health_connect','*')),0)
 FOR SHARE OF a,b,g,s;
 IF v_g.owner_user_id IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V49_COACH_UNAVAILABLE';
 END IF;
 -- BEGIN MINIMAL PROJECTION
 WITH observed AS (
   SELECT DISTINCT (w.observed_started_at AT TIME ZONE 'America/Santiago')::date AS day,w.sport
   FROM public.m26_wearable_exercise_evidence_v46 w
   WHERE w.owner_user_id=v_owner AND w.client_id=p_client AND w.provider='health_connect'
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
 RETURN pg_catalog.jsonb_build_object('ok',true,'schema','iberfit.connected360.coach-exercise-days.v1',
   'clientId',p_client,'provider','health_connect','coverage','partial','periodStart',v_day-6,'periodEnd',v_day,'days',v_rows);
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v49_coach_exercise_days(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.m26_v49_coach_exercise_days(uuid) TO authenticated;
CREATE FUNCTION public.m26_wearable_v49_coach_exercise_days_v1(p_client uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v49_coach_exercise_days(p_client) $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v49_coach_exercise_days_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v49_coach_exercise_days_v1(uuid) TO authenticated;
COMMIT;
