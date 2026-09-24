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

-- Self-certify both the catalog state and the behavior of a freshly created public table.
-- The probe table exists only inside this migration transaction and is dropped immediately.
do $postcheck$
declare
  v_remaining integer;
  v_probe_exposed boolean;
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

  execute 'create table public.iberfit_default_acl_probe_v1 (id integer)';

  select
    has_table_privilege('anon', 'public.iberfit_default_acl_probe_v1', 'SELECT')
    or has_table_privilege('anon', 'public.iberfit_default_acl_probe_v1', 'INSERT')
    or has_table_privilege('authenticated', 'public.iberfit_default_acl_probe_v1', 'SELECT')
    or has_table_privilege('authenticated', 'public.iberfit_default_acl_probe_v1', 'INSERT')
    or has_table_privilege('service_role', 'public.iberfit_default_acl_probe_v1', 'SELECT')
    or has_table_privilege('service_role', 'public.iberfit_default_acl_probe_v1', 'INSERT')
    into v_probe_exposed;

  if v_probe_exposed then
    raise exception 'IBERFIT_PUBLIC_TABLE_DEFAULT_ACL_PROBE_EXPOSED';
  end if;

  if (select pg_get_userbyid(c.relowner)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'iberfit_default_acl_probe_v1') <> 'postgres' then
    raise exception 'IBERFIT_PUBLIC_TABLE_DEFAULT_ACL_PROBE_OWNER_UNEXPECTED';
  end if;

  execute 'drop table public.iberfit_default_acl_probe_v1';
end
$postcheck$;
