-- IBERFIT · Public table default privileges fail-closed v1
-- Purpose: make future public tables created by the IBERFIT migration owner deny-by-default.
-- Existing table ACLs are intentionally unchanged.
-- New migrations must explicitly declare anon/authenticated/service_role access under
-- docs/SUPABASE_PUBLIC_TABLE_SECURITY_POLICY.md.
-- Rollback (emergency only):
--   alter default privileges for role postgres in schema public
--     grant all on tables to anon, authenticated, service_role;

-- Fail closed if the migration runner identity changes. The read-only audit performed
-- before this migration confirmed every current IBERFIT public table is owned by postgres.
do $precheck$
begin
  if current_user <> 'postgres' then
    raise exception 'IBERFIT_PUBLIC_TABLE_DEFAULT_ACL_OWNER_UNEXPECTED:%', current_user;
  end if;

  if to_regrole('anon') is null
     or to_regrole('authenticated') is null
     or to_regrole('service_role') is null then
    raise exception 'IBERFIT_PUBLIC_TABLE_DEFAULT_ACL_ROLE_MISSING';
  end if;
end
$precheck$;

-- PostgreSQL default privileges only affect objects created in the future by this owner.
-- Current tables, policies and grants are not modified by this statement.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

-- Self-certify the resulting default ACL. If any default table privilege remains for
-- an API/service role, abort instead of silently leaving a partially hardened state.
do $postcheck$
declare
  v_remaining integer;
begin
  select count(*)::integer
    into v_remaining
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where pg_get_userbyid(d.defaclrole) = 'postgres'
    and n.nspname = 'public'
    and d.defaclobjtype = 'r'
    and a.grantee in (
      to_regrole('anon')::oid,
      to_regrole('authenticated')::oid,
      to_regrole('service_role')::oid
    );

  if v_remaining <> 0 then
    raise exception 'IBERFIT_PUBLIC_TABLE_DEFAULT_ACL_NOT_FAIL_CLOSED:%', v_remaining;
  end if;
end
$postcheck$;
