-- Refuse rollback after official reevaluation data exists.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.reports IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM public.reports WHERE report_type='reassessment' OR content->>'reportType'='reassessment')
 OR EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 WHERE source_snapshot->>'reportType'='reassessment') THEN RAISE EXCEPTION 'GX_REASSESSMENT_ROLLBACK_REQUIRES_RETAINED_HISTORY_PLAN'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.iberfit_gx_report_body_current_v1(p_client uuid,p_body jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE r jsonb; seen text[]:=ARRAY[]::text[]; start_day date; end_day date;
BEGIN
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
CREATE OR REPLACE FUNCTION private.iberfit_gx_report_body_has_refs_v1(p_body jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_body->'evidence')='array' THEN p_body->'evidence' ELSE '[]'::jsonb END) e WHERE lower(btrim(coalesce(e->>'source',''))) LIKE 'gx-professional:%');
$f$;
DROP FUNCTION private.iberfit_gx_reassessment_body_current_v1(uuid,jsonb);
ALTER TABLE public.reports DROP CONSTRAINT gx_reassessment_type_consistency;
COMMIT;
