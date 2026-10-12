-- QA V46 safer operational rollback: block writer; do not restore unsafe consent logic.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.m26_wearable_v46_import_explicit_qa_v1(uuid,jsonb)
  FROM authenticated;
COMMIT;
