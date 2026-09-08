alter function public.iberfit_admin_create_client_v26(jsonb,jsonb)
  rename to iberfit_admin_create_client_v26_pre_privileged_assurance;

create or replace function public.iberfit_admin_create_client_v26(
  p_command jsonb,
  p_context jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_admin_create_client_v26_pre_privileged_assurance(p_command,p_context);
end
$function$;

revoke all on function public.iberfit_admin_create_client_v26(jsonb,jsonb) from public,anon;
grant execute on function public.iberfit_admin_create_client_v26(jsonb,jsonb) to authenticated;

revoke all on function public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb) from public,anon,authenticated;
