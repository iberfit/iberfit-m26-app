-- IBERFIT · restore least-privilege for Admin client creation helper
-- QA may already have applied the prior Solo IRI migration revision.
-- Browser roles must continue to enter through iberfit_admin_execute_v14 only.

revoke all on function public.iberfit_admin_create_client_v26(jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.iberfit_admin_create_client_v26(jsonb,jsonb)
  to service_role;

revoke all on function public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb)
  to service_role;
