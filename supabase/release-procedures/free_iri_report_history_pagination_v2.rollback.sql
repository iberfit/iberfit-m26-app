-- Rollback only after consumer has reverted to v1; never cascade.
BEGIN;
SET LOCAL lock_timeout='3s';
DROP FUNCTION public.iberfit_iri_report_history_v2(uuid,uuid,integer);
COMMIT;
