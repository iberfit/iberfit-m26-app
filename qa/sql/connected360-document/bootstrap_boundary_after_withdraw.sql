SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SELECT gx_test.assert(jsonb_array_length(private.gx_document_bootstrap_filter_v1(gx_test.document_bootstrap_payload(true))#>'{data,reports}')=0,'withdrawn owner bootstrap denied');
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
SELECT gx_test.assert(jsonb_array_length(private.gx_document_bootstrap_filter_v1(gx_test.document_bootstrap_payload(false))#>'{data,m26Entities}')=0 AND private.gx_document_bootstrap_filter_v1(gx_test.document_bootstrap_payload(false))->'remoteRevisions'='{}'::jsonb,'withdrawn Coach canonical and revision hidden');
\echo GX_DOCUMENT_BOOTSTRAP_BOUNDARY_PG17_OK
