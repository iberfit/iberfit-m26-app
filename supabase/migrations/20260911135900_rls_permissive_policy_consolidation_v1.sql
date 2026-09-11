-- IBERFIT · RLS permissive-policy consolidation v1
-- Preserves the exact OR semantics of the previous permissive policies while
-- reducing duplicate policy evaluation reported by Supabase Performance Advisor.

drop policy if exists profiles_insert_coach on public.client_app_profiles;
drop policy if exists profiles_insert_onboarding on public.client_app_profiles;
drop policy if exists profiles_insert_authorized on public.client_app_profiles;
create policy profiles_insert_authorized
on public.client_app_profiles
for insert
to authenticated
with check (
  public.is_assigned_coach(client_id)
  or (
    (select public.iberfit_role()) = any (
      array['admin'::public.iberfit_role,'coach'::public.iberfit_role]
    )
    and created_by = (select auth.uid())
  )
);

drop policy if exists client_timeline_admin_insert on public.client_timeline_events;
drop policy if exists timeline_insert_onboarding_coach on public.client_timeline_events;
drop policy if exists client_timeline_insert_authorized on public.client_timeline_events;
create policy client_timeline_insert_authorized
on public.client_timeline_events
for insert
to authenticated
with check (
  (select public.iberfit_current_role()) = 'admin'::public.iberfit_role
  or (
    (select public.iberfit_role()) = 'coach'::public.iberfit_role
    and public.is_assigned_coach(client_id)
  )
);

drop policy if exists clients_insert_coach on public.clients;
drop policy if exists clients_insert_onboarding on public.clients;
drop policy if exists clients_insert_authorized on public.clients;
create policy clients_insert_authorized
on public.clients
for insert
to authenticated
with check (
  public.is_assigned_coach(id)
  or (select public.iberfit_role()) = any (
    array['admin'::public.iberfit_role,'coach'::public.iberfit_role]
  )
);

drop policy if exists m26_measurements_write_v43 on public.m26_client_measurements_v43;
drop policy if exists m26_measurements_insert_v43 on public.m26_client_measurements_v43;
drop policy if exists m26_measurements_update_v43 on public.m26_client_measurements_v43;
drop policy if exists m26_measurements_delete_v43 on public.m26_client_measurements_v43;
create policy m26_measurements_insert_v43
on public.m26_client_measurements_v43
for insert
to authenticated
with check (
  (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
  and created_by = (select auth.uid())
);
create policy m26_measurements_update_v43
on public.m26_client_measurements_v43
for update
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
)
with check (
  (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
  and created_by = (select auth.uid())
);
create policy m26_measurements_delete_v43
on public.m26_client_measurements_v43
for delete
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists m26_plans_write_v43 on public.m26_training_plans_v43;
drop policy if exists m26_plans_insert_v43 on public.m26_training_plans_v43;
drop policy if exists m26_plans_update_v43 on public.m26_training_plans_v43;
drop policy if exists m26_plans_delete_v43 on public.m26_training_plans_v43;
create policy m26_plans_insert_v43
on public.m26_training_plans_v43
for insert
to authenticated
with check (
  public.is_assigned_coach(client_id)
  and created_by = (select auth.uid())
);
create policy m26_plans_update_v43
on public.m26_training_plans_v43
for update
to authenticated
using (public.is_assigned_coach(client_id))
with check (
  public.is_assigned_coach(client_id)
  and created_by = (select auth.uid())
);
create policy m26_plans_delete_v43
on public.m26_training_plans_v43
for delete
to authenticated
using (public.is_assigned_coach(client_id));

drop policy if exists m26_sessions_write_v43 on public.m26_training_sessions_v43;
drop policy if exists m26_sessions_insert_v43 on public.m26_training_sessions_v43;
drop policy if exists m26_sessions_update_v43 on public.m26_training_sessions_v43;
drop policy if exists m26_sessions_delete_v43 on public.m26_training_sessions_v43;
create policy m26_sessions_insert_v43
on public.m26_training_sessions_v43
for insert
to authenticated
with check (
  (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
  and created_by = (select auth.uid())
);
create policy m26_sessions_update_v43
on public.m26_training_sessions_v43
for update
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
)
with check (
  (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
  and created_by = (select auth.uid())
);
create policy m26_sessions_delete_v43
on public.m26_training_sessions_v43
for delete
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

do $postcheck$
declare
  v_duplicates integer;
begin
  select count(*)
  into v_duplicates
  from (
    select tablename,roles,cmd,count(*) as policy_count
    from pg_catalog.pg_policies
    where schemaname='public'
      and tablename in (
        'client_app_profiles',
        'client_timeline_events',
        'clients',
        'm26_client_measurements_v43',
        'm26_training_plans_v43',
        'm26_training_sessions_v43'
      )
      and permissive='PERMISSIVE'
      and 'authenticated'=any(roles)
    group by tablename,roles,cmd
    having count(*)>1
  ) duplicated;
  if v_duplicates<>0 then
    raise exception 'IBERFIT_MULTIPLE_PERMISSIVE_POLICIES_REMAIN';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public'
      and tablename='m26_training_plans_v43'
      and policyname='m26_plans_read_v43'
      and cmd='SELECT'
  ) then
    raise exception 'IBERFIT_TRAINING_PLAN_READ_POLICY_REQUIRED';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public'
      and tablename='client_timeline_events'
      and policyname='client_timeline_insert_authorized'
      and cmd='INSERT'
  ) then
    raise exception 'IBERFIT_TIMELINE_INSERT_POLICY_REQUIRED';
  end if;
end
$postcheck$;
