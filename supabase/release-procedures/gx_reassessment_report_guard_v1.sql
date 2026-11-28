-- Candidate only; after GX350 report guards, before enabling official reassessment.
-- No data or public API. Existing five report types stay unchanged.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.domain_entities_v26,public.reports IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.iberfit_gx_report_body_current_v1(uuid,jsonb)'::regprocedure)) IS DISTINCT FROM 'e8c34e1e1937f57f5f3feafbe4c02f12'
 OR md5(pg_get_functiondef('public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)'::regprocedure)) IS DISTINCT FROM 'fc964fabfd797e0a5cd1a8ed3aeb9aee'
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.reports'::regclass AND tgname='gx326_report_evidence_guard' AND tgenabled='O')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND tgname='gx326_issuance_evidence_guard' AND tgenabled='O')
 OR EXISTS(SELECT 1 FROM public.reports WHERE report_type='reassessment' OR content->>'reportType'='reassessment')
 OR EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 WHERE source_snapshot->>'reportType'='reassessment')
 OR EXISTS(SELECT 1 FROM public.reports r WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.content->'evidence')='array' THEN r.content->'evidence' ELSE '[]'::jsonb END) e WHERE lower(regexp_replace(coalesce(e->>'source',''),'^[[:space:]]+','','g')) LIKE 'connected360:%'))
 OR EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 r WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.source_snapshot->'evidence')='array' THEN r.source_snapshot->'evidence' ELSE '[]'::jsonb END) e WHERE lower(regexp_replace(coalesce(e->>'source',''),'^[[:space:]]+','','g')) LIKE 'connected360:%'))
 OR EXISTS(SELECT 1 FROM public.domain_entities_v26 r WHERE r.entity_type='report' AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.body->'evidence')='array' THEN r.body->'evidence' ELSE '[]'::jsonb END) e WHERE lower(regexp_replace(coalesce(e->>'source',''),'^[[:space:]]+','','g')) LIKE 'connected360:%'))
 THEN RAISE EXCEPTION 'GX_REASSESSMENT_BASELINE_DRIFT'; END IF;
END $guard$;
ALTER TABLE public.reports ADD CONSTRAINT gx_reassessment_type_consistency CHECK (
 (report_type IS NOT DISTINCT FROM 'reassessment')=(content->>'reportType' IS NOT DISTINCT FROM 'reassessment')
);
CREATE FUNCTION private.iberfit_gx_reassessment_body_current_v1(p_client uuid,p_body jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE r jsonb; labels text[]:=ARRAY[]::text[]; refs text[]:=ARRAY[]::text[];
 start_day date; end_day date; first_day date; last_day date; earliest date; latest date;
BEGIN
 IF p_client IS NULL OR p_body->>'reportType' IS DISTINCT FROM 'reassessment'
 OR jsonb_typeof(p_body->'evidence') IS DISTINCT FROM 'array'
 OR coalesce(p_body->>'periodStart','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 OR coalesce(p_body->>'periodEnd','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 OR (p_body ? 'activitySeries' AND p_body->'activitySeries' IS DISTINCT FROM '[]'::jsonb)
 OR (p_body ? 'assessmentId' AND p_body->'assessmentId' IS DISTINCT FROM 'null'::jsonb)
 OR (p_body ? 'assessmentRevision' AND p_body->'assessmentRevision' IS DISTINCT FROM 'null'::jsonb)
 OR (p_body ? 'sourceAssessmentId' AND p_body->'sourceAssessmentId' IS DISTINCT FROM 'null'::jsonb)
 OR (p_body ? 'sourceAssessmentRevision' AND p_body->'sourceAssessmentRevision' IS DISTINCT FROM 'null'::jsonb)
 THEN RETURN false; END IF;
 IF jsonb_array_length(p_body->'evidence') NOT BETWEEN 1 AND 12 THEN RETURN false; END IF;
 BEGIN start_day:=(p_body->>'periodStart')::date; end_day:=(p_body->>'periodEnd')::date;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false; END;
 IF start_day>=end_day OR end_day-start_day>366 OR end_day>(now() AT TIME ZONE 'America/Santiago')::date THEN RETURN false; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_body->'evidence') LOOP
  -- Rebuild exact row from live publication, owner, revision, protocol and hash.
  IF private.iberfit_gx_report_evidence_current_v1(p_client,start_day,end_day,r) IS DISTINCT FROM true THEN RETURN false; END IF;
  IF (r->>'label')=ANY(labels) OR split_part(r->>'source',':',2)=ANY(refs) THEN RETURN false; END IF;
  labels:=array_append(labels,r->>'label'); refs:=array_append(refs,split_part(r->>'source',':',2));
  -- Dates are parsed only AFTER exact canonical row equality is established.
  first_day:=left(r->>'text',10)::date;
  last_day:=left(split_part(r->>'text',' · ',2),10)::date;
  IF first_day<start_day OR last_day>end_day OR first_day>=last_day THEN RETURN false; END IF;
  earliest:=least(earliest,first_day); latest:=greatest(latest,last_day);
 END LOOP;
 RETURN earliest IS NOT DISTINCT FROM start_day AND latest IS NOT DISTINCT FROM end_day;
END $f$;
REVOKE ALL ON FUNCTION private.iberfit_gx_reassessment_body_current_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.iberfit_gx_report_body_has_refs_v1(p_body jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT coalesce(p_body->>'reportType'='reassessment',false) OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_body->'evidence')='array' THEN p_body->'evidence' ELSE '[]'::jsonb END) e WHERE lower(btrim(coalesce(e->>'source',''))) LIKE 'gx-professional:%') OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_body->'evidence')='array' THEN p_body->'evidence' ELSE '[]'::jsonb END) e WHERE lower(regexp_replace(coalesce(e->>'source',''),'^[[:space:]]+','','g')) LIKE 'connected360:%');
$f$;
CREATE OR REPLACE FUNCTION private.iberfit_gx_report_body_current_v1(p_client uuid,p_body jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE r jsonb; seen text[]:=ARRAY[]::text[]; start_day date; end_day date;
BEGIN
 -- Connected360 read consent is not publication consent.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_body->'evidence')='array' THEN p_body->'evidence' ELSE '[]'::jsonb END) e WHERE lower(regexp_replace(coalesce(e->>'source',''),'^[[:space:]]+','','g')) LIKE 'connected360:%') THEN RETURN false; END IF;
 IF p_body->>'reportType'='reassessment' THEN RETURN private.iberfit_gx_reassessment_body_current_v1(p_client,p_body); END IF;
 IF NOT private.iberfit_gx_report_body_has_refs_v1(p_body) THEN RETURN true; END IF;
 IF jsonb_array_length(p_body->'evidence') NOT BETWEEN 1 AND 12 OR coalesce(p_body->>'periodStart','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_body->>'periodEnd','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_body->>'reportType','') NOT IN ('weekly','monthly','quarterly','year-in-iberfit','reassessment','post-session') THEN RETURN false; END IF;
 BEGIN start_day:=(p_body->>'periodStart')::date; end_day:=(p_body->>'periodEnd')::date; EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false; END;
 FOR r IN SELECT value FROM jsonb_array_elements(p_body->'evidence') LOOP
  IF lower(btrim(coalesce(r->>'source',''))) NOT LIKE 'gx-professional:%' THEN CONTINUE; END IF;
  IF split_part(r->>'source',':',2)=ANY(seen) OR private.iberfit_gx_report_evidence_current_v1(p_client,start_day,end_day,r) IS DISTINCT FROM true THEN RETURN false; END IF;
  seen:=array_append(seen,split_part(r->>'source',':',2));
 END LOOP;
 RETURN true;
END $f$;
COMMIT;
