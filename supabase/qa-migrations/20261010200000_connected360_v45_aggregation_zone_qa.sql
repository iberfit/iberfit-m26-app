-- Connected360 v45 QA-only: distinct Android civil-day aggregation time zone.
-- NOT a sensor/source time zone; source_time_zone remains independently nullable.
-- IMPORTANT: never copy this QA-only migration to supabase/migrations before
-- native E2E, current consent and revocation certification.
-- IBERFIT-TABLE-ACCESS: public.m26_wearable_source_daily_v45 :: service-only closed staging.
-- IBERFIT-POLICY: public.m26_wearable_source_daily_v45 = service-role-only
begin;
alter table public.m26_wearable_source_daily_v45
  add column aggregation_time_zone text null;

alter table public.m26_wearable_source_daily_v45
  add constraint m26_wearable_source_daily_v45_aggregation_time_zone_check
  check (
    aggregation_time_zone is null or (
      length(aggregation_time_zone) between 1 and 80
      and aggregation_time_zone ~ '^[A-Za-z0-9_.:+-]+(/[A-Za-z0-9_.:+-]+)*$'
    )
  );

comment on column public.m26_wearable_source_daily_v45.aggregation_time_zone is
  'Time zone used by the acquisition platform to construct the civil-day aggregate. NOT proof of the physical watch/source zone, measured_at or source_updated_at.';

-- Defense in depth: no policies or client grants are created, and ingestion
-- MUST still be blocked by the existing v45 BEFORE INSERT/UPDATE trigger.
do $guard$
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='m26_wearable_source_daily_v45'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'M26_CONNECTED360_V45_RLS_MISSING';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid='public.m26_wearable_source_daily_v45'::regclass
      and t.tgname='m26_wearable_v45_block_unverified_write_qa_v1'
      and t.tgenabled='O'
  ) then
    raise exception 'M26_CONNECTED360_V45_WRITE_GUARD_MISSING';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public'
      and table_name='m26_wearable_source_daily_v45'
      and grantee in ('anon','authenticated')
  ) then
    raise exception 'M26_CONNECTED360_V45_CLIENT_GRANTS_NOT_ALLOWED';
  end if;
end;
$guard$;
commit;
