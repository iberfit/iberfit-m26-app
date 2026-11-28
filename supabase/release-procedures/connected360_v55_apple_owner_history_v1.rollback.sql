-- Remove only the candidate owner reader; all history remains intact.
BEGIN;
SET LOCAL lock_timeout='3s';
DROP FUNCTION public.m26_wearable_v55_apple_owner_history_v1(timestamptz,uuid);
DROP FUNCTION private.m26_v55_apple_owner_history(timestamptz,uuid);
COMMIT;
