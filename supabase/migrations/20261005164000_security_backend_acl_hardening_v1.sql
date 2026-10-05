-- IBERFIT · Security/Data Integrity 360 · SECURITY DEFINER ACL hardening v1
--
-- Least-privilege corrections only:
-- 1) the auth.users activation trigger is already installed in QA/PROD and
--    executes as its owner; direct EXECUTE by application roles is unnecessary.
-- 2) PROD may still retain three superseded invitation RPCs. Current QA/PROD
--    Edge Function code uses only iberfit_admin_client_invitation_*.
--
-- The named reconciliation routine replaces an anonymous DO block so migration
-- behavior stays explicit, reviewable and compatible with the data-safety gate.

revoke execute on function private.iberfit_sync_client_access_activation_v26()
from public, anon, authenticated;

create or replace function private.iberfit_reconcile_security_backend_acl_v1()
returns void
language plpgsql
set search_path to ''
as $function$
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
$function$;

revoke all on function private.iberfit_reconcile_security_backend_acl_v1()
from public, anon, authenticated;

select private.iberfit_reconcile_security_backend_acl_v1();
