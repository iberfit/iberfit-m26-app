-- Connected 360 V47: read-only Android daily observations, separate from V46 general HR.
-- Backend-first rollout. Existing V44/V46 observations remain unmodified. No consent is created.
BEGIN;
-- Additive owner-scoped consent journal; existing V46 receipt CHECK remains untouched.
-- IBERFIT-TABLE-ACCESS: public.m26_wearable_v47_consents_prod :: client scope RPC only; no direct authenticated table CRUD
-- IBERFIT-POLICY: public.m26_wearable_v47_consents_prod = service-role-only
CREATE TABLE public.m26_wearable_v47_consents_prod(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'health_connect' CHECK(provider='health_connect'),
  grant_id uuid NOT NULL,
  revocation_cursor bigint NOT NULL CHECK(revocation_cursor>=0),
  scopes text[] NOT NULL CHECK(cardinality(scopes) BETWEEN 1 AND 3
    AND scopes <@ ARRAY['steps','sleepMinutes','restingHeartRate']::text[]),
  consent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX m26_wearable_v47_consents_current ON public.m26_wearable_v47_consents_prod
(owner_user_id,client_id,grant_id,revocation_cursor);
ALTER TABLE public.m26_wearable_v47_consents_prod ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m26_wearable_v47_consents_prod FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.m26_wearable_v47_consents_prod FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.m26_wearable_v47_consents_prod TO service_role;

CREATE OR REPLACE FUNCTION public.m26_wearable_v47_record_consents_internal_prod_v1(
  p_owner uuid,p_client uuid,p_grant uuid,p_cursor bigint,p_scopes text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $v47_consent$
DECLARE
  v_old text[];
  v_new text[];
BEGIN
  IF (SELECT auth.uid()) IS DISTINCT FROM p_owner
    OR public.iberfit_client_id() IS DISTINCT FROM p_client
    OR p_grant IS NULL OR p_cursor IS NULL OR p_cursor<0
    OR pg_catalog.cardinality(p_scopes) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION USING MESSAGE='M26_V47_CONSENT_OWNER_DENIED',ERRCODE='42501';
  END IF;
  SELECT coalesce(pg_catalog.array_agg(metric),'{}'::text[]) INTO v_old
    FROM pg_catalog.unnest(p_scopes) metric
    WHERE metric IN ('generalHeartRate','exerciseSessions');
  SELECT coalesce(pg_catalog.array_agg(metric),'{}'::text[]) INTO v_new
    FROM pg_catalog.unnest(p_scopes) metric
    WHERE metric IN ('steps','sleepMinutes','restingHeartRate');
  IF pg_catalog.cardinality(v_old)+pg_catalog.cardinality(v_new)
    <>pg_catalog.cardinality(p_scopes) THEN
    RAISE EXCEPTION USING MESSAGE='M26_V47_SCOPE_UNKNOWN',ERRCODE='42501';
  END IF;
  IF pg_catalog.cardinality(v_old)>0 THEN
    INSERT INTO public.m26_wearable_v46_consents_prod(
      owner_user_id,client_id,provider,grant_id,revocation_cursor,scopes
    ) VALUES(p_owner,p_client,'health_connect',p_grant,p_cursor,v_old);
  END IF;
  IF pg_catalog.cardinality(v_new)>0 THEN
    INSERT INTO public.m26_wearable_v47_consents_prod(
      owner_user_id,client_id,provider,grant_id,revocation_cursor,scopes
    ) VALUES(p_owner,p_client,'health_connect',p_grant,p_cursor,v_new);
  END IF;
END;
$v47_consent$;
REVOKE ALL ON FUNCTION public.m26_wearable_v47_record_consents_internal_prod_v1(uuid,uuid,uuid,bigint,text[])
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.m26_wearable_v47_authorize_prod_v1(p_expected_grant uuid, p_expected_cursor bigint, p_scopes text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_owner uuid := (select auth.uid());
  v_client uuid := public.iberfit_client_id();
  v_cursor bigint;
  v_grant public.m26_wearable_authorization_sources_v3%rowtype;
  v_union text[];
  v_requested text[];
  v_new_grant uuid;
BEGIN
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF NOT EXISTS (SELECT 1 FROM public.m26_wearable_v46_release_control_prod
    WHERE id=true AND enabled=true) THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PRODUCTION_DISABLED',ERRCODE='42501';
  END IF;
  IF v_owner IS NULL OR v_client IS NULL
    OR p_expected_cursor IS NULL
    OR p_expected_cursor < 0 OR p_scopes IS NULL
    OR pg_catalog.cardinality(p_scopes) < 1
    OR pg_catalog.cardinality(p_scopes) > 5
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_scopes) x
        WHERE x IS NULL OR x <> ALL(ARRAY['generalHeartRate','exerciseSessions','steps','sleepMinutes','restingHeartRate']::text[]))
  THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PROD_SCOPE_EXTENSION_INVALID',ERRCODE='42501';
  END IF;
  SELECT pg_catalog.array_agg(DISTINCT item ORDER BY item)
    INTO v_requested FROM pg_catalog.unnest(p_scopes) item;
  IF pg_catalog.cardinality(v_requested) <> pg_catalog.cardinality(p_scopes) THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PROD_SCOPE_DUPLICATE',ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint
  ));
  SELECT coalesce(pg_catalog.max(e.id),0) INTO v_cursor
  FROM public.m26_wearable_revocation_events_v2 e
  WHERE e.owner_user_id=v_owner AND e.client_id=v_client
    AND e.provider IN ('health_connect','*');
  SELECT a.* INTO v_grant
  FROM public.m26_wearable_authorization_sources_v3 a
  WHERE a.owner_user_id=v_owner AND a.client_id=v_client
    AND a.provider='health_connect'
  FOR UPDATE;
  IF v_cursor <> p_expected_cursor OR
    (v_grant.grant_id IS NOT NULL AND
      (v_grant.grant_id IS DISTINCT FROM p_expected_grant OR
       v_grant.revocation_cursor < v_cursor)) OR
    (v_grant.grant_id IS NULL AND p_expected_grant IS NOT NULL) THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PROD_SCOPE_GRANT_STALE',ERRCODE='42501';
  END IF;
  IF v_grant.grant_id IS NULL THEN
    v_new_grant:=gen_random_uuid();
    INSERT INTO public.m26_wearable_authorization_sources_v3(
      owner_user_id,client_id,provider,grant_id,revocation_cursor,scopes
    ) VALUES(v_owner,v_client,'health_connect',v_new_grant,v_cursor,v_requested);
    PERFORM public.m26_wearable_v47_record_consents_internal_prod_v1(v_owner,v_client,v_new_grant,v_cursor,v_requested);
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'provider','health_connect','grantId',v_new_grant,
      'revocationCursor',v_cursor,'scopes',pg_catalog.to_jsonb(v_requested),
      'alreadyAuthorized',false
    );
  END IF;
  SELECT pg_catalog.array_agg(DISTINCT item ORDER BY item)
    INTO v_union FROM pg_catalog.unnest(v_grant.scopes||v_requested) item;
  IF pg_catalog.cardinality(v_union) > 12 THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PROD_SCOPE_TOO_MANY',ERRCODE='42501';
  END IF;
  IF v_requested <@ v_grant.scopes THEN
    PERFORM public.m26_wearable_v47_record_consents_internal_prod_v1(v_owner,v_client,v_grant.grant_id,v_cursor,v_requested);
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'provider','health_connect','grantId',v_grant.grant_id,
      'revocationCursor',v_cursor,'scopes',pg_catalog.to_jsonb(v_grant.scopes),
      'alreadyAuthorized',true
    );
  END IF;
  UPDATE public.m26_wearable_authorization_sources_v3
  SET scopes=v_union,granted_at=pg_catalog.now()
  WHERE owner_user_id=v_owner AND client_id=v_client
    AND provider='health_connect' AND grant_id=p_expected_grant;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PROD_SCOPE_GRANT_STALE',ERRCODE='42501';
  END IF;
  -- Existing consent log permits only this canonical policy version.
  PERFORM public.m26_wearable_v47_record_consents_internal_prod_v1(v_owner,v_client,p_expected_grant,v_cursor,v_requested);
  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'provider','health_connect','grantId',p_expected_grant,
    'revocationCursor',v_cursor,'scopes',pg_catalog.to_jsonb(v_union),
    'alreadyAuthorized',false
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.m26_wearable_v47_authorize_prod_v1(uuid,bigint,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v47_authorize_prod_v1(uuid,bigint,text[]) TO authenticated;

-- IBERFIT-TABLE-ACCESS: public.m26_wearable_daily_health_v47 :: owner-only RPC, no direct browser CRUD
-- IBERFIT-POLICY: public.m26_wearable_daily_health_v47 = service-role-only
-- Release switch V46 remains the single opt-in safety gate. Only authenticated, 
-- owner-scoped functions may write; no browser table CRUD and FORCE RLS.
CREATE TABLE public.m26_wearable_daily_health_v47 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'health_connect' CHECK(provider='health_connect'),
  record_date date NOT NULL,
  aggregation_time_zone text NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_ended_at timestamptz NOT NULL,
  acquired_at timestamptz NOT NULL,
  steps integer CHECK(steps BETWEEN 0 AND 200000),
  sleep_minutes integer CHECK(sleep_minutes BETWEEN 0 AND 1440),
  resting_heart_rate numeric CHECK(resting_heart_rate BETWEEN 25 AND 240),
  grant_id uuid NOT NULL,
  revocation_cursor bigint NOT NULL CHECK(revocation_cursor>=0),
  source_identity_verified boolean NOT NULL DEFAULT false CHECK(source_identity_verified=false),
  automatic_sync_certified boolean NOT NULL DEFAULT false CHECK(automatic_sync_certified=false),
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT m26_wearable_v47_some_measurement CHECK(
    steps IS NOT NULL OR sleep_minutes IS NOT NULL OR resting_heart_rate IS NOT NULL
  ),
  CONSTRAINT m26_wearable_v47_window CHECK(window_started_at<window_ended_at),
  CONSTRAINT m26_wearable_v47_one_civil_day UNIQUE(owner_user_id,client_id,provider,record_date)
);
CREATE INDEX m26_wearable_v47_client_date ON public.m26_wearable_daily_health_v47
 (client_id,record_date DESC);
ALTER TABLE public.m26_wearable_daily_health_v47 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m26_wearable_daily_health_v47 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.m26_wearable_daily_health_v47 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.m26_wearable_daily_health_v47 TO service_role;
COMMENT ON TABLE public.m26_wearable_daily_health_v47 IS
 'Android Health Connect daily observations; no source app/watch attestation, medical diagnosis or training completion inference.';

CREATE OR REPLACE FUNCTION public.m26_wearable_v47_import_daily_prod_v1(
  p_grant_id uuid,p_rows jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $v47$
DECLARE
  v_owner uuid:=(SELECT auth.uid());
  v_client uuid:=public.iberfit_client_id();
  v_grant_cursor bigint;
  v_revocation_cursor bigint;
  v_scopes text[];
  v_row jsonb;
  v_day date;
  v_zone text;
  v_start timestamptz;
  v_end timestamptz;
  v_acquired timestamptz;
  v_steps integer;
  v_sleep integer;
  v_rest numeric;
  v_seen date[]:=ARRAY[]::date[];
  v_old public.m26_wearable_daily_health_v47%rowtype;
  v_inserted integer:=0;
  v_updated integer:=0;
  v_unchanged integer:=0;
BEGIN
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF v_owner IS NULL OR v_client IS NULL OR p_grant_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.m26_wearable_v46_release_control_prod
      WHERE id=true AND enabled=true) THEN
    RAISE EXCEPTION USING MESSAGE='M26_V47_NOT_AUTHORIZED',ERRCODE='42501';
  END IF;
  IF p_rows IS NULL OR pg_catalog.jsonb_typeof(p_rows)<>'array'
    OR pg_catalog.octet_length(p_rows::text)>25000
    OR pg_catalog.jsonb_array_length(p_rows) NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION USING MESSAGE='M26_V47_BATCH_INVALID',ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint));
  SELECT a.scopes,a.revocation_cursor INTO v_scopes,v_grant_cursor
    FROM public.m26_wearable_authorization_sources_v3 a
    WHERE a.owner_user_id=v_owner AND a.client_id=v_client
      AND a.provider='health_connect' AND a.grant_id=p_grant_id FOR UPDATE;
  IF NOT FOUND OR v_grant_cursor IS NULL THEN
    RAISE EXCEPTION USING MESSAGE='M26_V47_GRANT_STALE',ERRCODE='42501';
  END IF;
  SELECT coalesce(max(e.id),0) INTO v_revocation_cursor
    FROM public.m26_wearable_revocation_events_v2 e
    WHERE e.owner_user_id=v_owner AND e.client_id=v_client
      AND e.provider IN ('health_connect','*');
  IF v_revocation_cursor>v_grant_cursor OR EXISTS(
    SELECT 1 FROM public.m26_wearable_connections_v44 c
    WHERE c.owner_user_id=v_owner AND c.client_id=v_client AND c.provider='health_connect'
      AND (c.status IN ('paused','revoked','disconnected') OR c.sync_enabled=false)
  ) THEN
    RAISE EXCEPTION USING MESSAGE='M26_V47_GRANT_REVOKED_OR_PAUSED',ERRCODE='42501';
  END IF;
  -- Never accept a fabricated clinical provenance or an unstated category.
  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) LOOP
    IF pg_catalog.jsonb_typeof(v_row)<>'object'
      OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(v_row) k
        WHERE k NOT IN ('date','aggregationTimeZone','windowStartedAt',
          'windowEndedAt','acquiredAt','steps','sleepMinutes','restingHeartRate'))
      OR NOT (v_row ?& ARRAY['date','aggregationTimeZone','windowStartedAt',
          'windowEndedAt','acquiredAt'])
      OR NOT (v_row ?| ARRAY['steps','sleepMinutes','restingHeartRate'])
      OR (v_row ? 'steps' AND (NOT 'steps'=ANY(v_scopes)
        OR pg_catalog.jsonb_typeof(v_row->'steps')<>'number'
        OR v_row->>'steps' !~ '^[0-9]{1,6}$'))
      OR (v_row ? 'sleepMinutes' AND (NOT 'sleepMinutes'=ANY(v_scopes)
        OR pg_catalog.jsonb_typeof(v_row->'sleepMinutes')<>'number'
        OR v_row->>'sleepMinutes' !~ '^[0-9]{1,4}$'))
      OR (v_row ? 'restingHeartRate' AND (NOT 'restingHeartRate'=ANY(v_scopes)
        OR pg_catalog.jsonb_typeof(v_row->'restingHeartRate')<>'number'
        OR v_row->>'restingHeartRate' !~ '^[0-9]{2,3}([.][0-9]{1,2})?$'))
      OR (v_row->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      OR (v_row->>'aggregationTimeZone' IS NULL)
      OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names z
        WHERE z.name=v_row->>'aggregationTimeZone')
      OR (v_row->>'windowStartedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T')
      OR (v_row->>'windowEndedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T')
      OR (v_row->>'acquiredAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T')
    THEN
      RAISE EXCEPTION USING MESSAGE='M26_V47_ROW_INVALID',ERRCODE='42501';
    END IF;
    v_day:=(v_row->>'date')::date;
    v_zone:=v_row->>'aggregationTimeZone';
    v_start:=(v_row->>'windowStartedAt')::timestamptz;
    v_end:=(v_row->>'windowEndedAt')::timestamptz;
    v_acquired:=(v_row->>'acquiredAt')::timestamptz;
    v_steps:=CASE WHEN v_row ? 'steps' THEN (v_row->>'steps')::integer ELSE NULL END;
    v_sleep:=CASE WHEN v_row ? 'sleepMinutes' THEN (v_row->>'sleepMinutes')::integer ELSE NULL END;
    v_rest:=CASE WHEN v_row ? 'restingHeartRate' THEN (v_row->>'restingHeartRate')::numeric ELSE NULL END;
    IF v_day=ANY(v_seen)
      OR v_day NOT BETWEEN (now() AT TIME ZONE v_zone)::date-6
                        AND (now() AT TIME ZONE v_zone)::date
      OR v_start IS DISTINCT FROM (v_day::timestamp AT TIME ZONE v_zone)
      OR v_end IS DISTINCT FROM ((v_day+1)::timestamp AT TIME ZONE v_zone)
      OR v_acquired NOT BETWEEN now()-interval '20 minutes' AND now()+interval '5 minutes'
      OR v_steps>200000 OR v_sleep>1440 OR v_rest NOT BETWEEN 25 AND 240
    THEN
      RAISE EXCEPTION USING MESSAGE='M26_V47_WINDOW_OR_VALUE_INVALID',ERRCODE='42501';
    END IF;
    IF EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_object_keys(v_row) k
      WHERE k IN ('steps','sleepMinutes','restingHeartRate')
        AND NOT EXISTS(
          SELECT 1 FROM public.m26_wearable_v47_consents_prod c
          WHERE c.owner_user_id=v_owner AND c.client_id=v_client
            AND c.provider='health_connect' AND c.grant_id=p_grant_id
            AND c.revocation_cursor=v_grant_cursor
            AND k=ANY(c.scopes)
        )
    ) THEN
      RAISE EXCEPTION USING MESSAGE='M26_V47_EXPLICIT_CONSENT_REQUIRED',ERRCODE='42501';
    END IF;
    v_seen:=pg_catalog.array_append(v_seen,v_day);
    SELECT * INTO v_old FROM public.m26_wearable_daily_health_v47
      WHERE owner_user_id=v_owner AND client_id=v_client
        AND provider='health_connect' AND record_date=v_day FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.m26_wearable_daily_health_v47(
        owner_user_id,client_id,record_date,aggregation_time_zone,
        window_started_at,window_ended_at,acquired_at,
        steps,sleep_minutes,resting_heart_rate,grant_id,revocation_cursor
      ) VALUES(v_owner,v_client,v_day,v_zone,v_start,v_end,v_acquired,
        v_steps,v_sleep,v_rest,p_grant_id,v_grant_cursor);
      v_inserted:=v_inserted+1;
    ELSIF (v_row ? 'steps' AND v_old.steps IS DISTINCT FROM v_steps)
      OR (v_row ? 'sleepMinutes' AND v_old.sleep_minutes IS DISTINCT FROM v_sleep)
      OR (v_row ? 'restingHeartRate' AND v_old.resting_heart_rate IS DISTINCT FROM v_rest)
    THEN
      UPDATE public.m26_wearable_daily_health_v47 SET
        steps=CASE WHEN v_row ? 'steps' THEN v_steps ELSE steps END,
        sleep_minutes=CASE WHEN v_row ? 'sleepMinutes' THEN v_sleep ELSE sleep_minutes END,
        resting_heart_rate=CASE WHEN v_row ? 'restingHeartRate' THEN v_rest ELSE resting_heart_rate END,
        aggregation_time_zone=v_zone,window_started_at=v_start,window_ended_at=v_end,
        acquired_at=v_acquired,grant_id=p_grant_id,revocation_cursor=v_grant_cursor,imported_at=now()
        WHERE id=v_old.id;
      v_updated:=v_updated+1;
    ELSE
      v_unchanged:=v_unchanged+1;
    END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('ok',true,'provider','health_connect',
    'persisted',true,'automatic',false,'sourceIdentityVerified',false,
    'automaticSyncCertified',false,'inserted',v_inserted,
    'updated',v_updated,'unchanged',v_unchanged);
END;
$v47$;
REVOKE ALL ON FUNCTION public.m26_wearable_v47_import_daily_prod_v1(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v47_import_daily_prod_v1(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.m26_wearable_v47_my_daily_prod_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $v47_read$
DECLARE
  v_owner uuid:=(SELECT auth.uid());
  v_client uuid:=public.iberfit_client_id();
  v_rows jsonb;
BEGIN
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF v_owner IS NULL OR v_client IS NULL THEN
    RAISE EXCEPTION USING MESSAGE='M26_V47_CLIENT_REQUIRED',ERRCODE='42501';
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'date',q.record_date,
    'steps',q.steps,'sleepMinutes',q.sleep_minutes,
    'restingHeartRate',q.resting_heart_rate,
    'acquiredAt',q.acquired_at,'sourceVerified',false
  ) ORDER BY q.record_date DESC),'[]'::jsonb) INTO v_rows
  FROM (
    SELECT record_date,steps,sleep_minutes,resting_heart_rate,acquired_at
    FROM public.m26_wearable_daily_health_v47
    WHERE owner_user_id=v_owner AND client_id=v_client
      AND record_date>=(now() AT TIME ZONE aggregation_time_zone)::date-6
    ORDER BY record_date DESC LIMIT 7
  ) q;
  RETURN pg_catalog.jsonb_build_object('ok',true,'provider','health_connect',
    'dailyHealth',v_rows,'sourceIdentityVerified',false);
END;
$v47_read$;
REVOKE ALL ON FUNCTION public.m26_wearable_v47_my_daily_prod_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v47_my_daily_prod_v1() TO authenticated;

-- Existing V46 delete/erase triggers now delete V47 in the SAME transaction.
CREATE OR REPLACE FUNCTION public.m26_wearable_v46_cleanup_prod_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_owner uuid;
  v_client uuid;
  v_provider text;
begin
  if tg_table_schema <> 'public' then
    raise exception 'M26_V46_CLEANUP_SCOPE_INVALID';
  end if;
  if tg_table_name='m26_wearable_consents_v44' then
    if new.action<>'delete' then return new; end if;
    v_owner:=new.actor_user_id; v_client:=new.client_id; v_provider:=new.provider;
  elsif tg_table_name='m26_wearable_revocation_events_v2' then
    if new.provider<>'*' then return new; end if;
    v_owner:=new.owner_user_id; v_client:=new.client_id; v_provider:='*';
  else
    raise exception 'M26_V46_CLEANUP_SOURCE_INVALID';
  end if;
  if v_owner is null or v_client is null or v_provider not in ('*','health_connect',
    'samsung_health','apple_health','normalized_file','strava','garmin_connect','fitbit','oura') then
    raise exception 'M26_V46_CLEANUP_OWNER_INVALID';
  end if;
  if (select auth.uid()) is not null and (
    v_owner is distinct from (select auth.uid())
    or v_client is distinct from public.iberfit_client_id()
  ) then
    raise exception 'M26_V46_CLEANUP_AUTH_MISMATCH';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint
  ));
  if v_provider in ('health_connect','*') then
    delete from public.m26_wearable_heart_rate_daily_v46
      where owner_user_id=v_owner and client_id=v_client;
    delete from public.m26_wearable_exercise_evidence_v46
      where owner_user_id=v_owner and client_id=v_client;
    delete from public.m26_wearable_daily_health_v47
      where owner_user_id=v_owner and client_id=v_client;
    delete from public.m26_wearable_v46_consents_prod
      where owner_user_id=v_owner and client_id=v_client;
    delete from public.m26_wearable_v47_consents_prod
      where owner_user_id=v_owner and client_id=v_client;
  end if;
  return new;
end;
$function$
;
COMMENT ON FUNCTION public.m26_wearable_v47_import_daily_prod_v1(uuid,jsonb) IS
  'V47 explicit grant + OS-read aggregate; no inferred watch provenance. Idempotent, owner-only.';
COMMIT;
