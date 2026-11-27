-- GX325: read-only proof for reviewed professional evidence. No public report mutation.
-- The authenticated Coach is checked by the existing GX publication read; never accept a browser-provided value.
BEGIN;
DO $preflight$ BEGIN
 IF to_regprocedure('private.iberfit_gx_publication_read_v1(uuid,uuid)') IS NULL OR to_regprocedure('private.iberfit_gx_followup_can_coach_v1(uuid)') IS NULL OR to_regprocedure('private.iberfit_gx_report_proof_v1(uuid,date,date,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'GX_REPORT_PROOF_INSTALL_DRIFT'; END IF;
END $preflight$;
CREATE FUNCTION private.iberfit_gx_report_proof_v1(p_client uuid,p_start date,p_end date,p_refs jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE ref jsonb; pub uuid; rev integer; seen uuid[]:=ARRAY[]::uuid[]; head jsonb; pair jsonb; a jsonb; b jsonb; micros bigint; first_day date; last_day date; output jsonb:='[]'::jsonb;
BEGIN
 IF auth.uid() IS NULL OR private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_REPORT_PROOF_SCOPE' USING ERRCODE='42501'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_start<'1900-01-01'::date OR p_start>p_end OR p_end>(now() AT TIME ZONE 'America/Santiago')::date OR p_end-p_start>366 OR jsonb_typeof(p_refs) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'GX_REPORT_PROOF_INVALID' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_refs) NOT BETWEEN 1 AND 12 OR octet_length(p_refs::text)>2400 THEN RAISE EXCEPTION 'GX_REPORT_PROOF_INVALID' USING ERRCODE='22023'; END IF;
 FOR ref IN SELECT value FROM jsonb_array_elements(p_refs) LOOP
  IF jsonb_typeof(ref) IS DISTINCT FROM 'object' OR NOT(ref ?& ARRAY['publicationId','publicationRevision']) OR (ref-ARRAY['publicationId','publicationRevision'])<>'{}'::jsonb OR jsonb_typeof(ref->'publicationId') IS DISTINCT FROM 'string' OR coalesce(ref->>'publicationId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR jsonb_typeof(ref->'publicationRevision') IS DISTINCT FROM 'number' OR coalesce(ref->>'publicationRevision','') !~ '^[1-9][0-9]{0,9}$' OR (ref->>'publicationRevision')::numeric>2147483647 THEN RAISE EXCEPTION 'GX_REPORT_PROOF_INVALID' USING ERRCODE='22023'; END IF;
  pub:=(ref->>'publicationId')::uuid; rev:=(ref->>'publicationRevision')::integer;
  IF pub=p_client OR pub=ANY(seen) THEN RAISE EXCEPTION 'GX_REPORT_PROOF_DUPLICATE' USING ERRCODE='22023'; END IF;seen:=array_append(seen,pub);
  head:=private.iberfit_gx_publication_read_v1(p_client,pub);
  IF head IS NULL OR head->>'status' IS DISTINCT FROM 'published' OR (head->>'revision')::integer IS DISTINCT FROM rev THEN RAISE EXCEPTION 'GX_REPORT_PROOF_STALE' USING ERRCODE='40001'; END IF;
  pair:=head->'pair';a:=pair->'previous';b:=pair->'current';
  micros:=(a->>'measuredMicros')::bigint;first_day:=(('epoch'::timestamptz+(micros/1000000)*interval '1 second'+(micros%1000000)*interval '1 microsecond') AT TIME ZONE 'America/Santiago')::date;
  micros:=(b->>'measuredMicros')::bigint;last_day:=(('epoch'::timestamptz+(micros/1000000)*interval '1 second'+(micros%1000000)*interval '1 microsecond') AT TIME ZONE 'America/Santiago')::date;
  IF first_day>=last_day OR last_day<p_start OR last_day>p_end THEN RAISE EXCEPTION 'GX_REPORT_PROOF_PERIOD' USING ERRCODE='22023'; END IF;
  -- Previous baseline may precede the report period. Both actual dates are explicit.
  output:=output||jsonb_build_array(jsonb_build_object('publicationId',pub,'publicationRevision',rev,'testId',b->'protocol'->>'testId','field',b->'protocol'->>'field','side',b->'protocol'->>'side','periodStart',first_day,'periodEnd',last_day,'previous',a->'value','value',b->'value','unit',b->>'unit'));
 END LOOP;
 RETURN jsonb_build_object('schemaVersion',1,'clientId',p_client,'periodStart',p_start,'periodEnd',p_end,'items',output);
END $f$;
CREATE FUNCTION public.iberfit_gx_report_proof_v1(p_client uuid,p_start date,p_end date,p_refs jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT private.iberfit_gx_report_proof_v1(p_client,p_start,p_end,p_refs);
$f$;
REVOKE ALL ON FUNCTION private.iberfit_gx_report_proof_v1(uuid,date,date,jsonb),public.iberfit_gx_report_proof_v1(uuid,date,date,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.iberfit_gx_report_proof_v1(uuid,date,date,jsonb),public.iberfit_gx_report_proof_v1(uuid,date,date,jsonb) TO authenticated;
COMMIT;
