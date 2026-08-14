-- IBERFIT M26 RC59.0C2B
-- TELEMETRY BACKEND ROLLBACK EXECUTABLE CANDIDATE
-- NOT YET APPROVED FOR REMOTE APPLY.
--
-- Manual rollback requires a separate session-local authorization flag.
--
-- Required before execution in the SAME transaction/session:
--   set local iberfit.rc59_0c2_rollback_authorized =
--     'RC59_0C2B_ROLLBACK_AUTHORIZED';

begin;

do $rc59_rollback_authorization$
begin
  if current_setting(
    'iberfit.rc59_0c2_rollback_authorized',
    true
  ) is distinct from 'RC59_0C2B_ROLLBACK_AUTHORIZED'
  then
    raise exception 'RC59_0C2B_ROLLBACK_AUTHORIZATION_REQUIRED';
  end if;
end
$rc59_rollback_authorization$;

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

drop function if exists
public.m26_telemetry_can_access_client_v59(uuid);

commit;