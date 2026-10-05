-- IBERFIT · Entrenamiento Operativo 360 · direct-write boundary v1
--
-- Canonical training state is mutated through the Command Bus / SECURITY DEFINER
-- projection path, not by direct PostgREST writes. Keep authenticated read access
-- for backwards-compatible read surfaces while removing direct mutation capability.
-- Legacy RC43 compatibility tables/RPCs are intentionally untouched in this wave.

revoke all on table
  public.training_cycles,
  public.sessions,
  public.session_executions,
  public.session_events
from anon, authenticated;

grant select on table
  public.training_cycles,
  public.sessions,
  public.session_executions,
  public.session_events
to authenticated;

revoke all on table public.active_execution_locks_v26
from anon, authenticated;
