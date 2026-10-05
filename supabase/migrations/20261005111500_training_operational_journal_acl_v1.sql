-- IBERFIT · Entrenamiento Operativo 360 · canonical journal ACL hardening v1
--
-- Command Bus journals are append-only server projections. Authenticated clients
-- may read rows allowed by RLS but must never obtain table-level mutation,
-- trigger, references or maintenance privileges. Anonymous access is unnecessary.

revoke all on table
  public.domain_events_v26,
  public.command_events_v26,
  public.command_receipts_v26
from anon, authenticated;

grant select on table
  public.domain_events_v26,
  public.command_events_v26,
  public.command_receipts_v26
to authenticated;
