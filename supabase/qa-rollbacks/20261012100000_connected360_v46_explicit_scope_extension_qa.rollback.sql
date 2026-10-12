-- QA-only fail-closed rollback. Retain existing consent and measurements.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.m26_wearable_v46_extend_scopes_explicit_qa_v1(uuid,bigint,text[])
FROM authenticated;
COMMIT;
