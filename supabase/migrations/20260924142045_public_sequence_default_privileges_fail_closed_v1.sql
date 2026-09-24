-- IBERFIT · Public sequence default privileges fail-closed v1
-- Purpose: make future public sequences created by the IBERFIT migration owner deny-by-default.
-- Existing sequence ACLs are intentionally unchanged.
-- New migrations that require direct sequence access must grant only the required
-- privileges explicitly to the intended role(s).
-- Rollback (emergency only):
--   alter default privileges for role postgres in schema public
--     grant usage, select, update on sequences to anon, authenticated, service_role;

do $precheck$
begin
  if current_user <> 'postgres' then
    raise exception 'IBERFIT_PUBLIC_SEQUENCE_DEFAULT_ACL_OWNER_UNEXPECTED:%', current_user;
  end if;

  if to_regrole('anon') is null
     or to_regrole('authenticated') is null
     or to_regrole('service_role') is null then
    raise exception 'IBERFIT_PUBLIC_SEQUENCE_DEFAULT_ACL_ROLE_MISSING';
  end if;
end
$precheck$;

-- PostgreSQL default privileges only affect future objects created by this owner.
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

-- Self-certify both catalog state and the behavior of a freshly created public sequence.
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
    and d.defaclobjtype = 'S'
    and a.grantee in (
      to_regrole('anon')::oid,
      to_regrole('authenticated')::oid,
      to_regrole('service_role')::oid
    );

  if v_remaining <> 0 then
    raise exception 'IBERFIT_PUBLIC_SEQUENCE_DEFAULT_ACL_NOT_FAIL_CLOSED:%', v_remaining;
  end if;

  execute 'create sequence public.iberfit_default_acl_probe_seq_v1';

  select
    has_sequence_privilege('anon', 'public.iberfit_default_acl_probe_seq_v1', 'USAGE')
    or has_sequence_privilege('anon', 'public.iberfit_default_acl_probe_seq_v1', 'SELECT')
    or has_sequence_privilege('anon', 'public.iberfit_default_acl_probe_seq_v1', 'UPDATE')
    or has_sequence_privilege('authenticated', 'public.iberfit_default_acl_probe_seq_v1', 'USAGE')
    or has_sequence_privilege('authenticated', 'public.iberfit_default_acl_probe_seq_v1', 'SELECT')
    or has_sequence_privilege('authenticated', 'public.iberfit_default_acl_probe_seq_v1', 'UPDATE')
    or has_sequence_privilege('service_role', 'public.iberfit_default_acl_probe_seq_v1', 'USAGE')
    or has_sequence_privilege('service_role', 'public.iberfit_default_acl_probe_seq_v1', 'SELECT')
    or has_sequence_privilege('service_role', 'public.iberfit_default_acl_probe_seq_v1', 'UPDATE')
    into v_probe_exposed;

  if v_probe_exposed then
    raise exception 'IBERFIT_PUBLIC_SEQUENCE_DEFAULT_ACL_PROBE_EXPOSED';
  end if;

  if (select pg_get_userbyid(c.relowner)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'iberfit_default_acl_probe_seq_v1') <> 'postgres' then
    raise exception 'IBERFIT_PUBLIC_SEQUENCE_DEFAULT_ACL_PROBE_OWNER_UNEXPECTED';
  end if;

  execute 'drop sequence public.iberfit_default_acl_probe_seq_v1';
end
$postcheck$;
