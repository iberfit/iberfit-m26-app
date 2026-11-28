-- CANDIDATE ONLY: Apple workouts, requires V48–V53 certified.
-- No enablement, biometric fields, device identity assertion or new storage.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.m26_wearable_v46_release_control_prod IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.m26_wearable_exercise_evidence_v46 IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
 IF to_regprocedure('private.m26_v53_apple_client_context()') IS NULL
 OR to_regprocedure('public.m26_wearable_v53_authorize_apple_exercise_v1(uuid,bigint,boolean)') IS NULL
 OR md5(pg_get_functiondef('public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure)) <> '5f8d8f5e93d9a09bc66d2af8f1a88bad'
 OR md5(pg_get_functiondef('public.m26_wearable_v46_import_prod_v1(uuid,jsonb)'::regprocedure)) <> '15fad17ae91a010ee73c047799eff06d'
 OR NOT EXISTS(SELECT 1 FROM public.m26_wearable_v46_release_control_prod WHERE id=true AND apple_exercise_enabled=false)
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.m26_wearable_exercise_evidence_v46'::regclass AND conname='m26_v51_apple_workout_minimal_check' AND convalidated)
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.m26_wearable_exercise_evidence_v46'::regclass AND conname='m26_v51_workout_active_seconds_check' AND convalidated)
 OR NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.m26_v46_workout_owner_source_uq') AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL AND pg_get_indexdef(i.indexrelid)='CREATE UNIQUE INDEX m26_v46_workout_owner_source_uq ON public.m26_wearable_exercise_evidence_v46 USING btree (owner_user_id, client_id, provider, source_record_key)')
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.m26_wearable_exercise_evidence_v46'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r(role_name) CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) a(action) WHERE has_table_privilege(r.role_name,'public.m26_wearable_exercise_evidence_v46',a.action))
 OR EXISTS(SELECT 1 FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='m26_wearable_exercise_evidence_v46' AND grantee IN ('anon','authenticated','PUBLIC'))
 THEN RAISE EXCEPTION 'M26_V54_PREREQUISITES_REQUIRED'; END IF;
END $guard$;
CREATE FUNCTION private.m26_v54_apple_workout_valid(r jsonb,acquired timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $valid$
 SELECT coalesce((CASE WHEN pg_catalog.jsonb_typeof(r)='object' THEN
 CASE WHEN (SELECT count(*) FROM pg_catalog.jsonb_object_keys(r))=6
 AND r ?& ARRAY['observationKey','sport','startedAt','endedAt','activeSeconds','distanceMeters']
 AND pg_catalog.jsonb_typeof(r->'observationKey')='string'
 AND r->>'observationKey' ~ '^[0-9a-f]{64}$'
 AND pg_catalog.jsonb_typeof(r->'sport')='string'
 AND r->>'sport' IN ('running','cycling','walking','strength','hiit','swimming','other')
 AND pg_catalog.jsonb_typeof(r->'startedAt')='string'
 AND pg_catalog.jsonb_typeof(r->'endedAt')='string'
 AND r->>'startedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{3})?Z$'
 AND r->>'endedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{3})?Z$'
 AND pg_catalog.pg_input_is_valid(r->>'startedAt','timestamp with time zone')
 AND pg_catalog.pg_input_is_valid(r->>'endedAt','timestamp with time zone')
 AND pg_catalog.jsonb_typeof(r->'activeSeconds')='number'
 AND pg_catalog.jsonb_typeof(r->'distanceMeters') IN ('number','null')
 THEN (r->>'startedAt')::timestamptz >= acquired-interval '31 days'
 AND (r->>'endedAt')::timestamptz <= acquired+interval '5 seconds'
 AND (r->>'endedAt')::timestamptz > (r->>'startedAt')::timestamptz
 AND (r->>'endedAt')::timestamptz-(r->>'startedAt')::timestamptz <= interval '24 hours'
 AND (r->>'activeSeconds')::numeric > 0
 AND (r->>'activeSeconds')::numeric <= extract(epoch FROM (r->>'endedAt')::timestamptz-(r->>'startedAt')::timestamptz)+1
 AND ((r->>'distanceMeters') IS NULL OR (r->>'distanceMeters')::numeric BETWEEN 0 AND 500000)
 ELSE false END ELSE false END),false)
$valid$;
REVOKE ALL ON FUNCTION private.m26_v54_apple_workout_valid(jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.m26_v54_import_apple_exercise(p_grant_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_owner uuid:=auth.uid(); v_client uuid:=private.m26_v53_apple_client_context();
 v_enabled boolean; v_cursor bigint; v_acquired timestamptz;
 v_rows jsonb; v_row jsonb; v_key text; v_start timestamptz; v_end timestamptz;
 v_active numeric; v_distance numeric; v_sport text;
 v_old public.m26_wearable_exercise_evidence_v46%rowtype;
 v_inserted integer:=0; v_updated integer:=0; v_unchanged integer:=0;
BEGIN
 SELECT enabled AND apple_exercise_enabled INTO v_enabled FROM public.m26_wearable_v46_release_control_prod WHERE id=true FOR SHARE;
 IF v_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V54_APPLE_DISABLED'; END IF;
 IF p_grant_id IS NULL OR p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object'
 OR pg_catalog.octet_length(p_payload::text)>24000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='M26_V54_PAYLOAD_INVALID'; END IF;
 IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_payload))<>3
 OR p_payload->>'schema' IS DISTINCT FROM 'iberfit.connected360.v54.apple.ingest.v1'
 OR pg_catalog.jsonb_typeof(p_payload->'acquiredAt') IS DISTINCT FROM 'string'
 OR pg_catalog.jsonb_typeof(p_payload->'exerciseEvidence') IS DISTINCT FROM 'array'
 OR p_payload->>'acquiredAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{3})?Z$'
 OR NOT pg_catalog.pg_input_is_valid(p_payload->>'acquiredAt','timestamp with time zone')
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='M26_V54_PAYLOAD_INVALID'; END IF;
 v_acquired:=(p_payload->>'acquiredAt')::timestamptz;
 v_rows:=p_payload->'exerciseEvidence';
 IF v_acquired NOT BETWEEN pg_catalog.now()-interval '20 minutes' AND pg_catalog.now()+interval '5 minutes'
 OR pg_catalog.jsonb_array_length(v_rows) NOT BETWEEN 1 AND 20
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='M26_V54_BATCH_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_rows) r(value) WHERE NOT private.m26_v54_apple_workout_valid(r.value,v_acquired))
 OR (SELECT count(DISTINCT r.value->>'observationKey') FROM pg_catalog.jsonb_array_elements(v_rows) r(value))<>pg_catalog.jsonb_array_length(v_rows)
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='M26_V54_WORKOUT_INVALID'; END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint))
 THEN RAISE EXCEPTION USING ERRCODE='55P03',MESSAGE='M26_V54_RETRY'; END IF;
 IF private.m26_v53_apple_client_context() IS DISTINCT FROM v_client THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V54_CLIENT_CHANGED'; END IF;
 SELECT coalesce(max(e.id),0) INTO v_cursor FROM public.m26_wearable_revocation_events_v2 e WHERE e.owner_user_id=v_owner AND e.client_id=v_client AND e.provider IN ('apple_health','*');
 PERFORM 1 FROM public.m26_wearable_authorization_sources_v3 a
 WHERE a.owner_user_id=v_owner AND a.client_id=v_client AND a.provider='apple_health'
 AND a.grant_id=p_grant_id AND a.revocation_cursor=v_cursor AND a.scopes=ARRAY['exerciseSessions']::text[] FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.m26_wearable_v46_consents_prod l WHERE l.owner_user_id=v_owner AND l.client_id=v_client AND l.provider='apple_health' AND l.grant_id=p_grant_id AND l.revocation_cursor=v_cursor AND l.scopes=ARRAY['exerciseSessions']::text[])
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V54_GRANT_STALE'; END IF;
 IF EXISTS(SELECT 1 FROM public.m26_wearable_connections_v44 c WHERE c.owner_user_id=v_owner AND c.client_id=v_client AND c.provider='apple_health' AND (c.status IN ('paused','revoked','disconnected') OR c.sync_enabled=false))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V54_APPLE_PAUSED'; END IF;
 FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(v_rows) LOOP
  v_key:=v_row->>'observationKey'; v_sport:=v_row->>'sport';
  v_start:=(v_row->>'startedAt')::timestamptz; v_end:=(v_row->>'endedAt')::timestamptz;
  v_active:=(v_row->>'activeSeconds')::numeric; v_distance:=(v_row->>'distanceMeters')::numeric;
  SELECT * INTO v_old FROM public.m26_wearable_exercise_evidence_v46
   WHERE owner_user_id=v_owner AND client_id=v_client AND provider='apple_health' AND source_record_key=v_key FOR UPDATE;
  IF FOUND THEN
   IF v_old.sport<>'other' AND v_sport='other' THEN v_sport:=v_old.sport; END IF;
   IF v_old.acquired_at>=v_acquired THEN
    IF v_old.acquired_at=v_acquired AND (v_old.sport IS DISTINCT FROM v_sport OR v_old.observed_started_at IS DISTINCT FROM v_start OR v_old.observed_ended_at IS DISTINCT FROM v_end OR v_old.active_seconds IS DISTINCT FROM v_active OR v_old.distance_meters IS DISTINCT FROM v_distance)
    THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='M26_V54_SAME_TIMESTAMP_CONFLICT'; END IF;
    v_unchanged:=v_unchanged+1;
   ELSE
    -- Advance acquisition high-water mark, including identical newer reads.
    UPDATE public.m26_wearable_exercise_evidence_v46 SET sport=v_sport,observed_started_at=v_start,observed_ended_at=v_end,active_seconds=v_active,distance_meters=v_distance,acquired_at=v_acquired,grant_id=p_grant_id,revocation_cursor=v_cursor,imported_at=pg_catalog.now() WHERE id=v_old.id;
    v_updated:=v_updated+1;
   END IF;
  ELSE
   INSERT INTO public.m26_wearable_exercise_evidence_v46(owner_user_id,client_id,provider,source_record_key,sport,observed_started_at,observed_ended_at,active_seconds,distance_meters,acquired_at,grant_id,revocation_cursor)
   VALUES(v_owner,v_client,'apple_health',v_key,v_sport,v_start,v_end,v_active,v_distance,v_acquired,p_grant_id,v_cursor);
   v_inserted:=v_inserted+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'provider','apple_health','persisted',true,'inserted',v_inserted,'updated',v_updated,'unchanged',v_unchanged,'sourceIdentityVerified',false,'automaticSyncCertified',false);
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v54_import_apple_exercise(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.m26_v54_import_apple_exercise(uuid,jsonb) TO authenticated;
CREATE FUNCTION public.m26_wearable_v54_import_apple_exercise_v1(p_grant_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v54_import_apple_exercise(p_grant_id,p_payload) $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v54_import_apple_exercise_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v54_import_apple_exercise_v1(uuid,jsonb) TO authenticated;
COMMIT;
