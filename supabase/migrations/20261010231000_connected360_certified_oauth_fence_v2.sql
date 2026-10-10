-- Connected360 V44 certification spoofing follow-up.
-- "certified_oauth" is also interpreted as an automatic link in device-hub.js.
-- V1 only blocked "certified_native". This replaces the function only;
-- existing trigger, grants, rows, RLS, OAuth and manual import paths are untouched.
-- Checked on QA before PROD; no V45 ingestion activated.
begin;

create or replace function public.m26_wearable_connection_certification_guard_v1()
returns trigger
language plpgsql security invoker set search_path=''
as $guard$
begin
  if new.metadata is null or pg_catalog.jsonb_typeof(new.metadata)<>'object' then
    raise exception using message='M26_NATIVE_CERTIFICATION_METADATA_INVALID',errcode='42501';
  end if;

  -- This metadata is supplied through the authenticated v44 connection RPC.
  -- It cannot be the source of truth for signed/native OS attestation.
  -- Client-supplied connection metadata is NOT remote attestation.
  -- This covers both currently-rendered certified modes and future verified prefixes.
  if pg_catalog.lower(pg_catalog.btrim(coalesce(new.metadata->>'mode','')))
       ~ '^(certified_|verified_)'
    or (new.metadata ? 'automatic' and new.metadata->'automatic' is distinct from 'false'::jsonb)
    or (new.metadata ? 'sourceTimeVerified' and new.metadata->'sourceTimeVerified' is distinct from 'false'::jsonb)
    or (new.metadata ? 'sourceIdentityVerified' and new.metadata->'sourceIdentityVerified' is distinct from 'false'::jsonb)
  then
    raise exception using message='M26_NATIVE_CERTIFICATION_NOT_VERIFIED',errcode='42501';
  end if;

  return new;
end;
$guard$;

comment on function public.m26_wearable_connection_certification_guard_v1() is
  'Reject unverified native/OAuth certification and automatic/source provenance claims from caller-supplied v44 metadata.';

commit;
