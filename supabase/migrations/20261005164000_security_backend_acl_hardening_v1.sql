-- IBERFIT · Security/Data Integrity 360 · SECURITY DEFINER ACL hardening v1
--
-- Two least-privilege corrections only:
-- 1) the auth.users activation trigger is already installed in QA/PROD and
--    executes as its owner; direct EXECUTE by application roles is unnecessary.
-- 2) PROD may still retain three superseded invitation RPCs. Current QA/PROD
--    Edge Function code uses only iberfit_admin_client_invitation_*.
--
-- Keep this migration idempotent across QA/PROD. Do not drop functions or data.

revoke execute on function private.iberfit_sync_client_access_activation_v26()
from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.iberfit_client_invitation_begin_v26(uuid,text)') is not null then
    execute 'revoke execute on function public.iberfit_client_invitation_begin_v26(uuid,text) from authenticated';
  end if;

  if to_regprocedure('public.iberfit_client_invitation_fail_v26(uuid,text)') is not null then
    execute 'revoke execute on function public.iberfit_client_invitation_fail_v26(uuid,text) from authenticated';
  end if;

  if to_regprocedure('public.iberfit_client_invitation_finalize_v26(uuid,uuid,text)') is not null then
    execute 'revoke execute on function public.iberfit_client_invitation_finalize_v26(uuid,uuid,text) from authenticated';
  end if;
end
$$;
