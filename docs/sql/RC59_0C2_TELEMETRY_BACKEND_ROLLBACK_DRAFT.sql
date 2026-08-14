-- IBERFIT M26 RC59.0C2
-- TELEMETRY BACKEND ROLLBACK DRAFT
-- DESIGN ONLY. DO NOT APPLY.
--
-- This rollback is also protected by a transaction-aborting sentinel.

begin;

do $rc59_rollback_design_only$
begin
  raise exception 'RC59_0C2_ROLLBACK_DESIGN_ONLY_DO_NOT_APPLY';
end
$rc59_rollback_design_only$;

revoke all
on function public.m26_telemetry_import_v59(jsonb)
from public, anon, authenticated;

revoke all
on function public.m26_telemetry_read_page_v59(
  uuid,
  timestamptz,
  integer
)
from public, anon, authenticated;

revoke all
on function public.m26_telemetry_delete_own_v59(timestamptz)
from public, anon, authenticated;

revoke all
on function public.m26_telemetry_purge_expired_v59()
from public, anon, authenticated;

drop function if exists
public.m26_telemetry_import_v59(jsonb);

drop function if exists
public.m26_telemetry_read_page_v59(
  uuid,
  timestamptz,
  integer
);

drop function if exists
public.m26_telemetry_delete_own_v59(timestamptz);

drop function if exists
public.m26_telemetry_purge_expired_v59();

drop table if exists
public.m26_telemetry_import_batches_v59;

drop table if exists
public.m26_telemetry_events_v59;

drop function if exists
public.m26_telemetry_event_valid_v59(
  jsonb,
  uuid,
  text,
  text
);

drop function if exists
public.m26_telemetry_json_safe_v59(jsonb);

commit;