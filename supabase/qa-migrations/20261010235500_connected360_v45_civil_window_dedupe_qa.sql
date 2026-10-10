-- IBERFIT Connected360 V45 QA ONLY: a source/date can have different civil
-- aggregation windows after a phone time-zone change or during travel.
-- Do NOT infer a sensor's source_time_zone from aggregation_time_zone.
-- Old unique indexes silently discarded that distinction; QA is empty,
-- and the existing V45 write-deny trigger remains ACTIVE.
--
-- PostgreSQL 17, NULLS NOT DISTINCT supports known and unknown source keys
-- and unknown civil zones without manufacturing a device identity.
-- SQL is atomic: if an index cannot be created, no old index is dropped.
-- Preflight proof: 0 V45 records, RLS ENABLE+FORCE, write-deny active,
-- old indexes not referenced by FK/PK constraints.
begin;
lock table public.m26_wearable_source_daily_v45 in share row exclusive mode;

create unique index m26_wearable_source_daily_v45_source_civil_window_uq
on public.m26_wearable_source_daily_v45
(owner_user_id,client_id,provider,record_date,source_key,aggregation_time_zone)
nulls not distinct;

comment on index public.m26_wearable_source_daily_v45_source_civil_window_uq is
  'QA v45: exactly one daily snapshot per owner/client/provider/source identity and phone civil window; NULL unknown stays distinct from certified source identity. This zone is NOT the physical sensor timezone.';

drop index public.m26_wearable_source_daily_v45_known_source_uq;
drop index public.m26_wearable_source_daily_v45_unknown_source_uq;

-- No INSERT/UPDATE, no new client table grants, no RLS policies, no dropping
-- the always-deny native write trigger. Never deploy V45 schema to PROD.
commit;
