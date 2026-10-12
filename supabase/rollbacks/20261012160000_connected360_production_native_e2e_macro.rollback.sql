-- Safe rollback for production V46 macro. Never destroy a health record or revoke legacy consent silently.
BEGIN;
UPDATE public.m26_wearable_v46_release_control_prod
 SET enabled=false,changed_at=now(),change_ticket='CONNECTED360_PRODUCTION_STOP_WRITES';
REVOKE EXECUTE ON FUNCTION public.m26_wearable_v46_import_prod_v1(uuid,jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.m26_wearable_v46_authorize_prod_v1(uuid,bigint,text[]) FROM authenticated;
-- Keep V46, V44, triggers and historical consents in place for no-data-loss recovery.
COMMIT;
