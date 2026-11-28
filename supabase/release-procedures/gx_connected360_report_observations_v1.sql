-- Candidate, internal evidence projection only. NOT publication permission.
-- No browser grants, data writes, report flags or change to existing guards.
-- Prerequisite: installed and certified V49/V53 source generation contracts.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF to_regprocedure('private.m26_v49_live_session()') IS NULL
 OR to_regprocedure('private.m26_v53_apple_exercise_source_state(uuid,uuid,boolean)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='m26_wearable_v46_release_control_prod' AND column_name='apple_exercise_enabled')
 OR to_regprocedure('private.m26_gx_connected360_report_observations_snapshot_v1(uuid,uuid,text,uuid,bigint,date,date)') IS NOT NULL
 OR to_regprocedure('private.m26_gx_connected360_report_observations_v1(uuid,uuid,text,uuid,bigint,date,date)') IS NOT NULL
 THEN RAISE EXCEPTION 'GX_CONNECTED360_REPORT_PREREQUISITES'; END IF;
END $guard$;
-- Internal invoker. A future authenticated owner-decision/Coach wrapper MUST
-- independently establish live session, role, assignment and report scope.
-- This function is not a permission check or a source of publishable data.
CREATE FUNCTION private.m26_gx_connected360_report_observations_snapshot_v1(
 p_owner uuid,p_client uuid,p_provider text,p_grant uuid,p_cursor bigint,p_start date,p_end date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE
 v_enabled boolean; v_apple boolean; v_days jsonb; v_sports jsonb;
 v_today date:=(pg_catalog.now() AT TIME ZONE 'America/Santiago')::date;
 v_proof jsonb;
BEGIN
 IF p_owner IS NULL OR p_client IS NULL OR p_grant IS NULL OR p_cursor IS NULL OR p_cursor<0
 OR p_provider IS NULL OR p_provider NOT IN ('health_connect','apple_health')
 OR p_start IS NULL OR p_end IS NULL OR p_start>p_end OR p_end-p_start>6 OR p_end>=v_today
 THEN RAISE EXCEPTION 'GX_CONNECTED360_REPORT_SCOPE_INVALID' USING ERRCODE='22023'; END IF;
 -- No row locks or volatile source helpers: all reads use one statement snapshot.
 SELECT enabled,apple_exercise_enabled INTO v_enabled,v_apple
 FROM public.m26_wearable_v46_release_control_prod WHERE id=true;
 IF v_enabled IS DISTINCT FROM true OR (p_provider='apple_health' AND v_apple IS DISTINCT FROM true)
 THEN RAISE EXCEPTION 'GX_CONNECTED360_REPORT_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 -- Same grant/ledger/cursor rules as the V46 and V53 source contracts.
 -- Apple requires the exact exercise-only scope on both records.
 IF NOT EXISTS(SELECT 1 FROM public.m26_wearable_authorization_sources_v3 a
   WHERE a.owner_user_id=p_owner AND a.client_id=p_client AND a.provider=p_provider
   AND a.grant_id=p_grant AND a.revocation_cursor=p_cursor AND 'exerciseSessions'=ANY(a.scopes)
   AND (p_provider<>'apple_health' OR a.scopes=ARRAY['exerciseSessions']::text[]))
 OR NOT EXISTS(SELECT 1 FROM public.m26_wearable_v46_consents_prod l
   WHERE l.owner_user_id=p_owner AND l.client_id=p_client AND l.provider=p_provider
   AND l.grant_id=p_grant AND l.revocation_cursor=p_cursor AND 'exerciseSessions'=ANY(l.scopes)
   AND (p_provider<>'apple_health' OR l.scopes=ARRAY['exerciseSessions']::text[]))
 OR p_cursor IS DISTINCT FROM (SELECT coalesce(max(e.id),0) FROM public.m26_wearable_revocation_events_v2 e
   WHERE e.owner_user_id=p_owner AND e.client_id=p_client AND e.provider IN(p_provider,'*'))
 OR EXISTS(SELECT 1 FROM public.m26_wearable_connections_v44 c
   WHERE c.owner_user_id=p_owner AND c.client_id=p_client AND c.provider=p_provider
   AND (c.status IN ('paused','revoked','disconnected') OR c.sync_enabled=false))
 THEN RAISE EXCEPTION 'GX_CONNECTED360_REPORT_SOURCE_STALE' USING ERRCODE='42501'; END IF;
 -- Positive observations only. Deduplicate overlapping workouts by day/sport;
 -- normalize running variants exactly as the V49 professional view does.
 -- The closed Santiago window is fixed, not a rolling seven-day query.
 WITH observed AS (
  SELECT DISTINCT (w.observed_started_at AT TIME ZONE 'America/Santiago')::date AS day,
   CASE WHEN w.sport='interval_running' THEN 'running' ELSE w.sport END AS sport
  FROM public.m26_wearable_exercise_evidence_v46 w
  WHERE w.owner_user_id=p_owner AND w.client_id=p_client AND w.provider=p_provider
   AND w.grant_id=p_grant AND w.revocation_cursor=p_cursor AND w.link_status='unlinked'
   AND w.observed_started_at>=(p_start::timestamp AT TIME ZONE 'America/Santiago')
   AND w.observed_started_at<((p_end+1)::timestamp AT TIME ZONE 'America/Santiago')
   AND w.observed_ended_at<=pg_catalog.now()
   AND w.sport IN ('running','interval_running','cycling','walking','strength','hiit','swimming','other')
 ), days AS (
  SELECT day,pg_catalog.jsonb_agg(sport ORDER BY sport) AS sports FROM observed GROUP BY day
 ), disciplines AS (
  SELECT sport,count(*)::integer AS observed_days FROM observed GROUP BY sport
 )
 SELECT coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('date',day,'sports',sports) ORDER BY day) FROM days),'[]'::jsonb),
  coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('sport',sport,'observedDays',observed_days) ORDER BY sport) FROM disciplines),'[]'::jsonb)
 INTO v_days,v_sports;
 IF pg_catalog.jsonb_array_length(v_days)=0 THEN
  RAISE EXCEPTION 'GX_CONNECTED360_REPORT_NO_OBSERVATIONS' USING ERRCODE='22023'; END IF;
 -- Only the digest and aggregate counts leave this internal projection.
 -- IDs/grant/cursor and exact days are digest input, not PDF content.
 v_proof:=pg_catalog.jsonb_build_object('schema','iberfit.connected360.report-observations.v1',
  'ownerId',p_owner,'clientId',p_client,'provider',p_provider,'grantId',p_grant,'cursor',p_cursor,
  'periodStart',p_start,'periodEnd',p_end,'days',v_days);
 RETURN pg_catalog.jsonb_build_object('schema','iberfit.connected360.report-observations.v1',
  'provider',p_provider,'periodStart',p_start,'periodEnd',p_end,'coverage','observed-only',
  'observedDays',pg_catalog.jsonb_array_length(v_days),'disciplines',v_sports,
  'evidenceSha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_proof::text,'UTF8')),'hex'));
END $f$;
-- Write-time callers must hold the report row lock first. Lock the release
-- row and source generation before invoking exactly the same projection.
CREATE FUNCTION private.m26_gx_connected360_report_observations_v1(
 p_owner uuid,p_client uuid,p_provider text,p_grant uuid,p_cursor bigint,p_start date,p_end date
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
BEGIN
 IF p_owner IS NULL OR p_client IS NULL
 OR pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
 THEN RAISE EXCEPTION 'GX_CONNECTED360_REPORT_SCOPE_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.m26_wearable_v46_release_control_prod WHERE id=true FOR SHARE;
 IF NOT FOUND OR NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('iberfit:wfence:v1:'||p_owner::text||':'||p_client::text,0::bigint))
 THEN RAISE EXCEPTION 'GX_CONNECTED360_REPORT_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN private.m26_gx_connected360_report_observations_snapshot_v1(p_owner,p_client,p_provider,p_grant,p_cursor,p_start,p_end);
END $f$;
REVOKE ALL ON FUNCTION private.m26_gx_connected360_report_observations_v1(uuid,uuid,text,uuid,bigint,date,date) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.m26_gx_connected360_report_observations_snapshot_v1(uuid,uuid,text,uuid,bigint,date,date) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
