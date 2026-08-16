revoke all on function public.iberfit_current_role_v26() from public, anon, authenticated;
revoke all on function public.iberfit_can_access_client_v26(uuid) from public, anon, authenticated;
revoke all on function public.iberfit_canary_enabled_v26(uuid) from public, anon, authenticated;
revoke all on function public.iberfit_base_entity_v26(text,uuid,uuid) from public, anon, authenticated;
revoke all on function public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb) from public, anon, authenticated;
revoke all on function public.iberfit_command_preflight_v26(jsonb) from public, anon, authenticated;
revoke all on function public.iberfit_execute_command_v26(jsonb) from public, anon, authenticated;
revoke all on function public.iberfit_bootstrap_v26() from public, anon, authenticated;

grant execute on function public.iberfit_current_role_v26() to authenticated;
grant execute on function public.iberfit_can_access_client_v26(uuid) to authenticated;
grant execute on function public.iberfit_canary_enabled_v26(uuid) to authenticated;
grant execute on function public.iberfit_command_preflight_v26(jsonb) to authenticated;
grant execute on function public.iberfit_execute_command_v26(jsonb) to authenticated;
grant execute on function public.iberfit_bootstrap_v26() to authenticated;

comment on function public.iberfit_base_entity_v26(text,uuid,uuid) is 'M26 internal helper. Not callable by anon/authenticated.';
comment on function public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb) is 'M26 internal mutation helper. Only called by the transactional command bus.';;
