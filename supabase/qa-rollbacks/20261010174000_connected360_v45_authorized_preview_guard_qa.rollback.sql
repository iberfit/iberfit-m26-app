-- Connected360 v45 QA only. This rollback changes no health records.
-- The existing v45 insert/update denial trigger is intentionally untouched.
begin;
drop function if exists public.m26_wearable_v45_validate_native_preview_qa_v1(uuid,jsonb);
commit;
