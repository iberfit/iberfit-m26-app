-- IBERFIT · P0 · Clients are deleted only through the privileged Admin command.
-- LIVE and QA prior state: public.clients granted DELETE to anon/authenticated and
-- clients_delete_coach allowed assigned Coach (and Admin via is_assigned_coach).
-- That path bypasses WebAuthn, explicit confirmation, audit and protected-history checks.
-- This migration is ACL/policy-only: no customer rows, Auth users, files or FK changed.
-- See tests/m26_p0_client_delete_command_only.test.mjs and the QA denial gate.
-- Refuse to close the legacy route unless the protected command remains available.
SELECT 1 / (
  CASE WHEN EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    WHERE p.oid = to_regprocedure('public.iberfit_admin_delete_client_v26(jsonb,jsonb)')
      AND p.prosecdef
  )
  AND to_regprocedure('public.iberfit_admin_execute_v14(jsonb)') IS NOT NULL
  AND pg_catalog.has_function_privilege(
    'service_role', 'public.iberfit_admin_delete_client_v26(jsonb,jsonb)', 'EXECUTE'
  )
  THEN 1 ELSE 0 END
) AS iberfit_p0_admin_delete_command_prerequisites_missing;

REVOKE DELETE ON TABLE public.clients FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS clients_delete_coach ON public.clients;

-- Fail closed if an inherited role grant or another DELETE/ALL policy reopens it.
-- Privileged SECURITY DEFINER command keeps its own authorization and execution ACL.
SELECT 1 / (
  CASE WHEN
    NOT pg_catalog.has_table_privilege('anon','public.clients','DELETE')
    AND NOT pg_catalog.has_table_privilege('authenticated','public.clients','DELETE')
    AND pg_catalog.has_table_privilege('service_role','public.clients','DELETE')
    AND pg_catalog.has_table_privilege('authenticated','public.clients','SELECT')
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE schemaname='public' AND tablename='clients'
        AND cmd IN ('DELETE','ALL')
    )
  THEN 1 ELSE 0 END
) AS iberfit_p0_client_direct_delete_boundary_still_open;

-- No automatic rollback of this P0 control: a rollback that reinstates direct
-- DELETE is a security regression. Emergency override needs privileged review.
