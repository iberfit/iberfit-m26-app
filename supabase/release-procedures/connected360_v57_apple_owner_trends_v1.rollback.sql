-- Read-only API rollback; retain all history and consent data.
BEGIN;
DROP FUNCTION public.m26_wearable_v57_apple_owner_trends_v1(integer);
DROP FUNCTION private.m26_v57_apple_owner_trends(integer);
COMMIT;
