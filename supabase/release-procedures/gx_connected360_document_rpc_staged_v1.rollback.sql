BEGIN;
DROP FUNCTION public.iberfit_gx_document_inbox_v1(uuid),public.iberfit_gx_document_review_v1(uuid,boolean),public.iberfit_gx_document_decide_v1(uuid,integer,uuid,text,text,text) RESTRICT;
DROP FUNCTION private.gx_document_require_owner_v1() RESTRICT;
COMMIT;
