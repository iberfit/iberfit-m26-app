-- IBERFIT · m26_messages_v43 UPDATE privilege least-privilege normalization v1
-- Canonical contract from recovered baseline:
--   authenticated may INSERT/SELECT rows allowed by RLS and UPDATE only read_at.
-- This removes any environment drift that accidentally grants table-wide UPDATE.

do $precheck$
begin
  if current_user <> 'postgres' then
    raise exception 'IBERFIT_M26_MESSAGES_ACL_OWNER_UNEXPECTED:%', current_user;
  end if;

  if to_regclass('public.m26_messages_v43') is null then
    raise exception 'IBERFIT_M26_MESSAGES_TABLE_MISSING';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'm26_messages_v43'
      and column_name = 'read_at'
  ) then
    raise exception 'IBERFIT_M26_MESSAGES_READ_AT_COLUMN_MISSING';
  end if;
end
$precheck$;

-- Remove broad UPDATE if an environment acquired it, then restore the canonical
-- column-scoped permission. RLS remains unchanged and continues to scope rows.
revoke update on table public.m26_messages_v43 from authenticated;
grant update (read_at) on table public.m26_messages_v43 to authenticated;

do $postcheck$
declare
  v_broad_update boolean;
  v_wrong_update_columns integer;
  v_update_policy_count integer;
begin
  select exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'm26_messages_v43'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
  ) into v_broad_update;

  if v_broad_update then
    raise exception 'IBERFIT_M26_MESSAGES_BROAD_UPDATE_STILL_GRANTED';
  end if;

  if not has_column_privilege('authenticated', 'public.m26_messages_v43', 'read_at', 'UPDATE') then
    raise exception 'IBERFIT_M26_MESSAGES_READ_AT_UPDATE_MISSING';
  end if;

  select count(*)::integer
    into v_wrong_update_columns
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'm26_messages_v43'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE'
    and column_name <> 'read_at';

  if v_wrong_update_columns <> 0 then
    raise exception 'IBERFIT_M26_MESSAGES_NON_READ_AT_UPDATE_GRANTED:%', v_wrong_update_columns;
  end if;

  select count(*)::integer
    into v_update_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'm26_messages_v43'
    and policyname = 'm26_messages_update_v43'
    and cmd = 'UPDATE'
    and 'authenticated' = any(roles);

  if v_update_policy_count <> 1 then
    raise exception 'IBERFIT_M26_MESSAGES_UPDATE_POLICY_UNEXPECTED:%', v_update_policy_count;
  end if;
end
$postcheck$;
