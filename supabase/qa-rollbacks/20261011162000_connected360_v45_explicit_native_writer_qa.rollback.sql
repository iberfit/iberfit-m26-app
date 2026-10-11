-- QA ONLY emergency rollback for Connected 360 V45 explicit writer.
-- Non-destructive: preserve every V45 row and pre-existing atomic cleanup.
-- The original unconditional rejector is restored. No migration to PROD.
begin;
revoke all on function public.m26_wearable_v45_import_explicit_qa_v1(uuid,jsonb)
  from public,anon,authenticated,service_role;
drop function if exists public.m26_wearable_v45_import_explicit_qa_v1(uuid,jsonb);

create or replace function public.m26_wearable_v45_block_unverified_write_qa_v1()
returns trigger language plpgsql security invoker set search_path=''
as $fn$
begin
  raise exception using message='M26_CONNECTED360_V45_INGEST_UNCERTIFIED',errcode='42501';
end;
$fn$;
revoke all on function public.m26_wearable_v45_block_unverified_write_qa_v1()
  from public,anon,authenticated;
-- IMPORTANT: the existing BEFORE INSERT OR UPDATE trigger is preserved.
-- Existing data is kept for owner-directed revocation/deletion, with no
-- broad SELECT or write grants. No DROP TABLE, TRUNCATE, or CASCADE.
commit;
