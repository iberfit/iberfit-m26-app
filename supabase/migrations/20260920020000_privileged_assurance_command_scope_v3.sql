-- IBERFIT M26
-- Restore the privileged-assurance boundary without coupling WebAuthn to the
-- generic conflict_sensitive flag. Only commands with an explicit privileged
-- product contract are guarded here; action-outcome commands remain guarded by
-- their dedicated outer wrappers.

create or replace function public.iberfit_command_preflight_v26_pre_crm_renewal(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_type text := upper(btrim(coalesce(p_command->>'type', '')));
begin
  if v_type in ('RENOVACION_REGISTRAR', 'CHECKIN_ANULAR') then
    perform public.iberfit_require_privileged_assurance_v65d();
  end if;

  return public.iberfit_command_preflight_v26_pre_v65e(p_command);
end
$function$;

create or replace function public.iberfit_execute_command_v26_pre_crm_renewal(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_type text := upper(btrim(coalesce(p_command->>'type', '')));
begin
  if v_type in ('RENOVACION_REGISTRAR', 'CHECKIN_ANULAR') then
    perform public.iberfit_require_privileged_assurance_v65d();
  end if;

  return public.iberfit_execute_command_v26_pre_v65e(p_command);
end
$function$;
