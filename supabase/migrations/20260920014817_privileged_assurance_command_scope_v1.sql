-- IBERFIT M26
-- Keep privileged WebAuthn assurance scoped to the commercial renewal command.
-- The action/outcome wrapper already enforces this boundary; these lower wrappers
-- retain defense in depth without blocking unrelated commands such as CHECKIN_REGISTRAR.

create or replace function public.iberfit_command_preflight_v26_pre_crm_renewal(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_type text := upper(coalesce(p_command->>'type', ''));
begin
  if v_type = 'RENOVACION_REGISTRAR' then
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
  v_type text := upper(coalesce(p_command->>'type', ''));
begin
  if v_type = 'RENOVACION_REGISTRAR' then
    perform public.iberfit_require_privileged_assurance_v65d();
  end if;

  return public.iberfit_execute_command_v26_pre_v65e(p_command);
end
$function$;
