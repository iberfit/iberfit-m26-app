-- Independent closed-by-default guard. No consent, no API, no data rewrite.
-- Install before reassessment/read-boundary candidates. Explicitly replace these
-- constraints ONLY as part of a future certified atomic authorization release.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN ACCESS EXCLUSIVE MODE;
CREATE FUNCTION private.gx_document_has_external_v1(p_body jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_body->'evidence')='array' THEN p_body->'evidence' ELSE '[]'::jsonb END) e WHERE lower(regexp_replace(coalesce(e->>'source',''),'^[[:space:]]+','','g')) LIKE 'connected360:%');
$f$;
REVOKE ALL ON FUNCTION private.gx_document_has_external_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.gx_document_has_external_v1(jsonb) TO authenticated,service_role;
-- Validated CHECKs cover every INSERT/UPDATE including owner/service-role writes
-- and retired rows; ordinary legacy material and non-report entities are untouched.
ALTER TABLE public.domain_entities_v26 ADD CONSTRAINT gx_document_canonical_closed_v1 CHECK (
 entity_type IS DISTINCT FROM 'report' OR NOT private.gx_document_has_external_v1(body)
);
ALTER TABLE public.reports ADD CONSTRAINT gx_document_projected_closed_v1 CHECK (
 NOT private.gx_document_has_external_v1(content)
);
ALTER TABLE public.iberfit_evolution_report_issuances_v1 ADD CONSTRAINT gx_document_issuance_closed_v1 CHECK (
 NOT private.gx_document_has_external_v1(source_snapshot)
);
COMMIT;
