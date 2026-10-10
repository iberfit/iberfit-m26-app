-- IBERFIT Connected 360: native certification is NOT a client-writable claim.
-- Additive DB-side fence (not a UI-only check), QA first, then controlled PROD.
-- Existing v44 confirmed_import metadata {mode,automatic:false} remains valid.
-- Fail closed for native certification until signed, physical end-to-end E2E.
begin;

-- Preflight is performed as a separately audited read-only QA/PROD query:
-- verify schema, existing spoof claims and the absence of this trigger before
-- applying. Anonymous DO blocks are intentionally forbidden in migrations.
-- CREATE TRIGGER fails atomically if the table is missing or fence exists.



create function public.m26_wearable_connection_certification_guard_v1()
returns trigger
language plpgsql security invoker set search_path=''
as $guard$
begin
  if new.metadata is null or pg_catalog.jsonb_typeof(new.metadata)<>'object' then
    raise exception using message='M26_NATIVE_CERTIFICATION_METADATA_INVALID',errcode='42501';
  end if;

  -- This metadata is supplied through the authenticated v44 connection RPC.
  -- It cannot be the source of truth for signed/native OS attestation.
  if pg_catalog.lower(pg_catalog.btrim(coalesce(new.metadata->>'mode','')))='certified_native'
    or (new.metadata ? 'automatic' and new.metadata->'automatic' is distinct from 'false'::jsonb)
    or (new.metadata ? 'sourceTimeVerified' and new.metadata->'sourceTimeVerified' is distinct from 'false'::jsonb)
    or (new.metadata ? 'sourceIdentityVerified' and new.metadata->'sourceIdentityVerified' is distinct from 'false'::jsonb)
  then
    raise exception using message='M26_NATIVE_CERTIFICATION_NOT_VERIFIED',errcode='42501';
  end if;

  return new;
end;
$guard$;

-- A trigger function is not directly callable with SELECT.
revoke all on function public.m26_wearable_connection_certification_guard_v1()
  from public,anon;
grant execute on function public.m26_wearable_connection_certification_guard_v1()
  to authenticated,service_role;

create trigger m26_wearable_connections_certification_guard_v1
before insert or update on public.m26_wearable_connections_v44
for each row execute function public.m26_wearable_connection_certification_guard_v1();

comment on trigger m26_wearable_connections_certification_guard_v1
on public.m26_wearable_connections_v44 is
  'Deny user-supplied automatic/native-certified provenance. Only lift after OS/device E2E and a server-only attestation model.';
commit;
