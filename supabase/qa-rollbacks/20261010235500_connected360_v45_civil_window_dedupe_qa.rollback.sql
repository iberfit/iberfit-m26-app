-- QA ONLY, manual guarded recovery, never deployed to production.
-- Rebuild both original indexes FIRST. If rows now contain separate civil
-- windows for the same old key, UNIQUE creation rejects the rollback
-- atomically, preserving the new protection and all data. Never delete rows.
begin;
lock table public.m26_wearable_source_daily_v45 in share row exclusive mode;

create unique index m26_wearable_source_daily_v45_known_source_uq
on public.m26_wearable_source_daily_v45
(owner_user_id,client_id,provider,record_date,source_key)
where source_key is not null;

create unique index m26_wearable_source_daily_v45_unknown_source_uq
on public.m26_wearable_source_daily_v45
(owner_user_id,client_id,provider,record_date)
where source_key is null;

drop index public.m26_wearable_source_daily_v45_source_civil_window_uq;
commit;
