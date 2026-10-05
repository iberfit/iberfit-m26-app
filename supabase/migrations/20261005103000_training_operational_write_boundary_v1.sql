-- IBERFIT · Entrenamiento Operativo 360 · direct-write boundary v1
--
-- Canonical training entity state (training_cycles, sessions, session_executions)
-- is mutated through the Command Bus / SECURITY DEFINER projection path, never by
-- direct PostgREST writes. session_events is an older compatibility event store:
-- it remains readable for N-1 compatibility but is hardened to read-only here.
-- Legacy RC43 plan/session tables and RPC remain untouched in this wave.

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
