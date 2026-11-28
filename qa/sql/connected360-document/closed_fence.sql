-- Synthetic PG17 fixture only. Test the exact independent release procedure
-- before the private consent lifecycle; rollback restores this fixture only.
CREATE TABLE public.domain_entities_v26(entity_type text,body jsonb);
CREATE TABLE public.iberfit_evolution_report_issuances_v1(source_snapshot jsonb);
INSERT INTO public.domain_entities_v26 VALUES ('report','{"evidence":[{"source":"sessionExecutions"}]}'),('session','{}');
INSERT INTO public.iberfit_evolution_report_issuances_v1 VALUES ('{"evidence":[{"source":"gx-professional:legacy"}]}');
\ir ../../../supabase/release-procedures/gx_connected360_document_closed_fence_v1.sql
SELECT gx_test.assert((SELECT count(*) FROM pg_constraint WHERE conname IN ('gx_document_canonical_closed_v1','gx_document_projected_closed_v1','gx_document_issuance_closed_v1') AND convalidated)=3,'all three constraints validated');
DO $test$
DECLARE source text; marked jsonb; statement text; expected text; actual text;
BEGIN
 FOREACH source IN ARRAY ARRAY['connected360:health_connect:x', E' \tCONNECTED360:apple_health:x', E'\nConnected360:'] LOOP
  marked:=jsonb_build_object('evidence',jsonb_build_array(jsonb_build_object('source',source)));
  FOR statement,expected IN SELECT * FROM (VALUES
   (format('UPDATE public.reports SET content=%L::jsonb',marked),'gx_document_projected_closed_v1'),
   (format('INSERT INTO public.reports(id,content) VALUES (gen_random_uuid(),%L::jsonb)',marked),'gx_document_projected_closed_v1'),
   (format('INSERT INTO public.domain_entities_v26 VALUES (''report'',%L::jsonb)',marked),'gx_document_canonical_closed_v1'),
   (format('UPDATE public.domain_entities_v26 SET entity_type=''report'',body=%L::jsonb WHERE entity_type=''session''',marked),'gx_document_canonical_closed_v1'),
   (format('INSERT INTO public.iberfit_evolution_report_issuances_v1 VALUES (%L::jsonb)',marked),'gx_document_issuance_closed_v1'),
   (format('UPDATE public.iberfit_evolution_report_issuances_v1 SET source_snapshot=%L::jsonb',marked),'gx_document_issuance_closed_v1')
  ) t(statement,expected) LOOP
   BEGIN
    EXECUTE statement;
    RAISE EXCEPTION 'GX_FENCE_UNEXPECTED_WRITE: %',expected;
   EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS actual=CONSTRAINT_NAME;
    PERFORM gx_test.assert(actual=expected,'exact fence constraint');
   END;
  END LOOP;
 END LOOP;
END $test$;
-- Normal writes, null/malformed evidence handled without broadening the
-- reserved marker, and unrelated canonical entities remain unaffected.
INSERT INTO public.domain_entities_v26 VALUES ('session','{"evidence":[{"source":"connected360:synthetic"}]}'),('report','{}'),('report','{"evidence":null}');
UPDATE public.reports SET title=title;
UPDATE public.iberfit_evolution_report_issuances_v1 SET source_snapshot=source_snapshot;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT INSERT ON public.domain_entities_v26 TO service_role;
SET ROLE service_role;
INSERT INTO public.domain_entities_v26 VALUES ('report','{"evidence":[{"source":"sessionExecutions"}]}');
DO $test$ BEGIN
 BEGIN
  INSERT INTO public.domain_entities_v26 VALUES ('report','{"evidence":[{"source":"connected360:synthetic"}]}');
  RAISE EXCEPTION 'GX_FENCE_SERVICE_ROLE_BYPASS';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $test$;
RESET ROLE;
\ir ../../../supabase/release-procedures/gx_connected360_document_closed_fence_v1.rollback.sql
SELECT gx_test.assert(to_regprocedure('private.gx_document_has_external_v1(jsonb)') IS NULL AND (SELECT count(*) FROM pg_constraint WHERE conname IN ('gx_document_canonical_closed_v1','gx_document_projected_closed_v1','gx_document_issuance_closed_v1'))=0,'empty fence rollback');
SELECT gx_test.assert((SELECT count(*) FROM public.reports)=3,'original report history retained');
\echo GX_DOCUMENT_CLOSED_FENCE_PG17_OK
