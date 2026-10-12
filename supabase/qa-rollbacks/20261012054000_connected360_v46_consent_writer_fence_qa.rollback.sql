-- IBERFIT V46 QA emergency rollback (data-preserving kill switch).
-- Block new RPC ingestion immediately; historical V46 rows, audit/consents, RLS,
-- and erase triggers remain intact. Do NOT drop observations or narrow scopes.
begin;
revoke execute on function public.m26_wearable_v46_import_explicit_qa_v1(uuid,jsonb) from authenticated;
commit;
-- Restoration requires new reviewed migration and permission/certification checks.
