-- Exercise actual private filter against a synthetic bootstrap envelope.
\ir bootstrap_boundary_generated.sql
CREATE FUNCTION gx_test.document_bootstrap_payload(p_client_projection boolean) RETURNS jsonb LANGUAGE sql STABLE AS $test$
 SELECT jsonb_build_object('data',jsonb_build_object('reports',jsonb_agg(CASE WHEN p_client_projection THEN to_jsonb(r)||jsonb_build_object('content',jsonb_build_object('reportType',r.content->>'reportType','summary',r.summary,'conclusions',r.content->>'conclusions','recommendations',r.content->>'recommendations','periodStart',r.content->>'periodStart','periodEnd',r.content->>'periodEnd','evidence',r.content->'evidence','activitySeries',r.content->'activitySeries')) ELSE to_jsonb(r) END),'m26Entities',jsonb_agg(jsonb_build_object('entityType','report','entityId',d.entity_id,'clientId',d.client_id,'status',d.status,'revision',d.revision,'body',d.body))),'remoteRevisions',jsonb_object_agg('report:'||r.id::text,r.revision))
 FROM public.reports r JOIN public.domain_entities_v26 d ON d.entity_id=r.id AND d.entity_type='report' JOIN gx_test.scenarios s ON s.report_id=r.id WHERE s.provider='apple_health'
$test$;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
SELECT gx_test.assert(private.gx_document_bootstrap_filter_v1(gx_test.document_bootstrap_payload(false))=gx_test.document_bootstrap_payload(false),'authorized Coach current bootstrap unchanged');
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SELECT gx_test.assert(jsonb_array_length(private.gx_document_bootstrap_filter_v1(gx_test.document_bootstrap_payload(true))#>'{data,reports}')=1 AND jsonb_array_length(private.gx_document_bootstrap_filter_v1(gx_test.document_bootstrap_payload(true))#>'{data,m26Entities}')=0,'owner published projection only');
SELECT gx_test.actor('10000000-0000-4000-8000-000000000003');
SELECT gx_test.assert(jsonb_array_length(private.gx_document_bootstrap_filter_v1(gx_test.document_bootstrap_payload(true))#>'{data,reports}')=0,'foreign owner bootstrap denied');
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
SELECT gx_test.assert(private.gx_document_bootstrap_filter_v1('{"data":{"reports":[{"content":{}}],"m26Entities":[]},"remoteRevisions":{"session:x":1}}')='{ "data":{"reports":[{"content":{}}],"m26Entities":[]},"remoteRevisions":{"session:x":1}}'::jsonb,'ordinary bootstrap unchanged');
