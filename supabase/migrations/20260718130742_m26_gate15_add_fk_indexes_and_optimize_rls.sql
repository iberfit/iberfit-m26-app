create index if not exists active_execution_locks_v26_session_idx
  on public.active_execution_locks_v26(session_id);
create index if not exists active_execution_locks_v26_acquired_by_idx
  on public.active_execution_locks_v26(acquired_by);

create index if not exists appointments_session_id_v26_idx
  on public.appointments(session_id);
create index if not exists appointments_created_by_v26_idx
  on public.appointments(created_by);
create index if not exists appointments_confirmed_by_v26_idx
  on public.appointments(confirmed_by);
create index if not exists appointments_cancelled_by_v26_idx
  on public.appointments(cancelled_by);
create index if not exists appointments_completed_by_v26_idx
  on public.appointments(completed_by);

create index if not exists command_events_v26_actor_idx
  on public.command_events_v26(actor_user_id);
create index if not exists command_receipts_v26_client_idx
  on public.command_receipts_v26(client_id);
create index if not exists command_receipts_v26_actor_idx
  on public.command_receipts_v26(actor_user_id);
create index if not exists domain_events_v26_actor_idx
  on public.domain_events_v26(actor_user_id);
create index if not exists m26_canary_clients_v26_enabled_by_idx
  on public.m26_canary_clients_v26(enabled_by);

drop policy if exists coach_availability_v26_select on public.coach_availability_v26;
create policy coach_availability_v26_select
on public.coach_availability_v26
for select
to authenticated
using (
  coach_user_id = (select auth.uid())
  or (select public.iberfit_current_role_v26()) = 'admin'
);;
