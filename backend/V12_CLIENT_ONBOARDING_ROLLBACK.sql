-- IBERFIT V12.2 · Rollback exclusivo de las funciones añadidas por V12.2
begin;
revoke all on function public.iberfit_create_client_draft_v12(jsonb) from authenticated;
revoke all on function public.iberfit_client_onboarding_preflight_v12() from authenticated;
drop function if exists public.iberfit_create_client_draft_v12(jsonb);
drop function if exists public.iberfit_client_onboarding_preflight_v12();
notify pgrst, 'reload schema';
commit;
