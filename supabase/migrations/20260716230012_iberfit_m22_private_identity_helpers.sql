create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;
create or replace function private.iberfit_role()
returns public.iberfit_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'iberfit_role', '')::public.iberfit_role,
    (select p.role from public.user_profiles p where p.user_id = auth.uid())
  )
$$;
create or replace function private.iberfit_client_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'iberfit_client_id', '')::uuid,
    (select p.client_id from public.user_profiles p where p.user_id = auth.uid())
  )
$$;
create or replace function private.is_assigned_coach(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.iberfit_role() = 'admin'
    or (
      private.iberfit_role() = 'coach'
      and (
        target_client::text in (
          select jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'iberfit_client_ids', '[]'::jsonb))
        )
        or exists (
          select 1 from public.client_assignments a
          where a.client_id = target_client and a.coach_user_id = auth.uid() and a.active
        )
      )
    )
$$;
revoke all on function private.iberfit_role() from public, anon, authenticated;
revoke all on function private.iberfit_client_id() from public, anon, authenticated;
revoke all on function private.is_assigned_coach(uuid) from public, anon, authenticated;;
