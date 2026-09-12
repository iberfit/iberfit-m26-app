-- Least-privilege hardening: the public Admin command gateway remains callable by
-- authenticated users, while this internal helper may only be invoked from trusted
-- database/owner execution paths (for example iberfit_admin_execute_v14).

revoke all on function public.iberfit_admin_create_client_v26(jsonb,jsonb)
  from public,anon,authenticated;
