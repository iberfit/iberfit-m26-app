-- Manual QA-only rollback. Never run on PROD. No cascade, no data loss.
-- This deliberately refuses rollback if the future ingestion path populated rows.
begin;
do $block$
begin
  if to_regclass('public.m26_wearable_source_daily_v45') is null then
    raise exception 'CONNECTED360_V45_ROLLBACK_TABLE_MISSING';
  end if;
  if exists(select 1 from public.m26_wearable_source_daily_v45 limit 1) then
    raise exception 'CONNECTED360_V45_ROLLBACK_NONEMPTY_FORBIDDEN';
  end if;
end;
$block$;
drop table public.m26_wearable_source_daily_v45;
commit;
