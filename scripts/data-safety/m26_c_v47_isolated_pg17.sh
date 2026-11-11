#!/usr/bin/env bash
# Non-production SQL integration for the exact V47 read migration.
# Uses a THROWAWAY local PostgreSQL 17 GitHub Actions service and SYNTHETIC rows.
set -Eeuo pipefail
if [[ "${IBERFIT_PG17_SYNTHETIC_ONLY:-}" != "YES" || "${PGHOST:-}" != "127.0.0.1" ||
      "${PGPORT:-}" != "5432" || "${PGUSER:-}" != "postgres" ||
      "${PGDATABASE:-}" != "postgres" ]]; then
  echo 'IBERFIT_V47_ISOLATED_PG17_ONLY' >&2
  exit 65
fi
: "${PGPASSWORD:?Synthetic local PostgreSQL password required}"
psql_synthetic(){
  docker run --rm --network host \
    -e PGPASSWORD -e PGHOST -e PGPORT -e PGUSER -e PGDATABASE \
    -v "$PWD:/repo:ro" postgres:17-alpine psql -X -q -v ON_ERROR_STOP=1 "$@"
}
psql_synthetic <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION public.iberfit_client_id() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.test.client_id',true),'')::uuid $$;
CREATE FUNCTION public.iberfit_require_privileged_assurance_v65d()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.test.assured',true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION USING MESSAGE='M26_V47_ASSURANCE_REQUIRED',ERRCODE='42501';
  END IF;
END; $$;
CREATE TABLE public.m26_wearable_daily_health_v47(
  owner_user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  provider text NOT NULL CHECK(provider='health_connect'),
  record_date date NOT NULL,
  aggregation_time_zone text NOT NULL,
  steps integer,
  sleep_minutes integer,
  resting_heart_rate numeric,
  acquired_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX m26_wearable_v47_one_civil_day ON
  public.m26_wearable_daily_health_v47(owner_user_id,client_id,provider,record_date);
ALTER TABLE public.m26_wearable_daily_health_v47 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m26_wearable_daily_health_v47 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.m26_wearable_daily_health_v47 FROM PUBLIC,anon,authenticated;
INSERT INTO public.m26_wearable_daily_health_v47
(owner_user_id,client_id,provider,record_date,aggregation_time_zone,steps,acquired_at)
SELECT '11111111-1111-4111-8111-111111111111'::uuid,
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
       'health_connect',current_date-(40+g),'UTC',1000+g,now()
FROM generate_series(1,9) AS g;
INSERT INTO public.m26_wearable_daily_health_v47
(owner_user_id,client_id,provider,record_date,aggregation_time_zone,steps,acquired_at)
VALUES
('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','health_connect',current_date+3,'UTC',9999,now()),
('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','health_connect',current_date-400,'UTC',8888,now()),
('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','health_connect',current_date-1,'UTC',7777,now()),
('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','health_connect',current_date-1,'UTC',6666,now()),
('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','health_connect',current_date-600,'UTC',5555,now());
SQL
psql_synthetic -f /repo/supabase/migrations/20261111131000_connected360_v47_last_seven_owner_history.sql
psql_synthetic <<'SQL'
DO $$
BEGIN
  IF has_function_privilege('anon',
    'public.m26_wearable_v47_my_daily_prod_v1()','EXECUTE')
    OR NOT has_function_privilege('authenticated',
    'public.m26_wearable_v47_my_daily_prod_v1()','EXECUTE')
    OR has_table_privilege('authenticated',
    'public.m26_wearable_daily_health_v47','SELECT') THEN
    RAISE EXCEPTION 'M26_V47_PRIVILEGE_BOUNDARY_INVALID';
  END IF;
END $$;
SET ROLE authenticated;
SET "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111';
SET "app.test.client_id"='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET "app.test.assured"='yes';
DO $$
DECLARE result jsonb;
BEGIN
  SELECT public.m26_wearable_v47_my_daily_prod_v1() INTO result;
  IF result->>'ok' <> 'true'
    OR result->>'sourceIdentityVerified' <> 'false'
    OR jsonb_array_length(result->'dailyHealth') <> 7
    OR (result->'dailyHealth'->0->>'date')::date <> current_date-41
    OR (result->'dailyHealth'->6->>'date')::date <> current_date-47
    OR result->'dailyHealth'->0->>'sourceVerified' <> 'false' THEN
    RAISE EXCEPTION 'M26_V47_BOUNDED_LAST7_INVALID';
  END IF;
  -- Current-day and other-client samples must never be present in this response.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(result->'dailyHealth') row
    WHERE (row->>'date')::date > current_date-41
      OR (row->>'steps')::int IN (9999,7777,6666,5555)) THEN
    RAISE EXCEPTION 'M26_V47_CROSS_SCOPE_OR_FUTURE';
  END IF;
END $$;
SET "app.test.client_id"='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $$
DECLARE result jsonb;
BEGIN
  SELECT public.m26_wearable_v47_my_daily_prod_v1() INTO result;
  IF jsonb_array_length(result->'dailyHealth') <> 1 OR
    result->'dailyHealth'->0->>'steps' <> '7777' THEN
    RAISE EXCEPTION 'M26_V47_CLIENT_ISOLATION_FAILED';
  END IF;
END $$;
SET "request.jwt.claim.sub"='22222222-2222-4222-8222-222222222222';
DO $$
DECLARE result jsonb;
BEGIN
  SELECT public.m26_wearable_v47_my_daily_prod_v1() INTO result;
  IF jsonb_array_length(result->'dailyHealth') <> 1 OR
    result->'dailyHealth'->0->>'steps' <> '5555' THEN
    RAISE EXCEPTION 'M26_V47_OWNER_ISOLATION_OR_OLD_HISTORY_FAILED';
  END IF;
END $$;
SET "app.test.assured"='no';
DO $$
BEGIN
  BEGIN
    PERFORM public.m26_wearable_v47_my_daily_prod_v1();
    RAISE EXCEPTION 'M26_V47_ASSURANCE_BYPASS';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;
SQL
psql_synthetic -f /repo/supabase/rollbacks/20261111131000_connected360_v47_last_seven_owner_history.rollback.sql
psql_synthetic <<'SQL'
SET ROLE authenticated;
SET "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111';
SET "app.test.client_id"='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET "app.test.assured"='yes';
DO $$
DECLARE result jsonb;
BEGIN
  SELECT public.m26_wearable_v47_my_daily_prod_v1() INTO result;
  IF jsonb_array_length(result->'dailyHealth') <> 0 THEN
    RAISE EXCEPTION 'M26_V47_ROLLBACK_30_DAY_BEHAVIOR_FAILED';
  END IF;
END $$;
SQL
echo 'IBERFIT_C_V47_PG17_SYNTHETIC_OWNER_CLIENT_ASSURANCE_ACL_ROLLBACK_SUCCESS'
