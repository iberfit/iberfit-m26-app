-- QA-only rollback for v45 civil-day aggregation time zone.
-- Roll back only if no row has been persisted with this new provenance.
-- Does not alter source_time_zone or legacy v44 tables.
begin;
do $guard$
begin
  if exists (
    select 1 from public.m26_wearable_source_daily_v45
    where aggregation_time_zone is not null
  ) then
    raise exception 'M26_CONNECTED360_V45_AGGREGATION_ZONE_HAS_DATA';
  end if;
end;
$guard$;
alter table public.m26_wearable_source_daily_v45
  drop constraint m26_wearable_source_daily_v45_aggregation_time_zone_check;
alter table public.m26_wearable_source_daily_v45
  drop column aggregation_time_zone;
commit;
