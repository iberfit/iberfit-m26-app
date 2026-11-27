-- Candidate only. After GX325 proof. Canonical professional report rows.
BEGIN;
DO $preflight$ BEGIN
 IF to_regprocedure('private.iberfit_gx_report_proof_v1(uuid,date,date,jsonb)') IS NULL OR to_regprocedure('private.iberfit_gx_report_evidence_row_v1(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'GX_REPORT_EVIDENCE_INSTALL_DRIFT'; END IF;
END $preflight$;
-- The input is exclusively a canonical proof item inside a trusted caller.
-- No client/user-configurable text or raw protocol is projected.
CREATE FUNCTION private.iberfit_gx_report_evidence_row_v1(p jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE label text; unit_label text; side_label text; a text; b text;
BEGIN
 label:=CASE (p->>'testId')||':'||(p->>'field')
 WHEN 'chair-stand-30s:repetitions' THEN 'Levantarse de la silla en 30 s'
 WHEN 'one-minute-sit-to-stand:repetitions' THEN 'Levantarse de la silla en 1 min'
 WHEN 'one-minute-sit-to-stand:oneMinuteHr' THEN 'Frecuencia cardíaca al minuto de recuperación'
 WHEN 'bodyweight-squat-60s:repetitions' THEN 'Sentadillas en 60 s'
 WHEN 'push-test:repetitions' THEN 'Empuje'
 WHEN 'trx-row:repetitions' THEN 'Remo en suspensión'
 WHEN 'weight-bearing-lunge:bestCm' THEN 'Movilidad de tobillo'
 WHEN 'back-saver:bestCm' THEN 'Movilidad de cadena posterior'
 WHEN 'core-plank:frontPlankSeconds' THEN 'Plancha frontal'
 WHEN 'posterior-chain-endurance:seconds' THEN 'Resistencia de cadena posterior'
 WHEN 'body-composition:weightKg' THEN 'Peso corporal'
 WHEN 'body-composition:waistCm' THEN 'Perímetro de cintura'
 WHEN 'body-composition:bodyFatPercent' THEN 'Grasa corporal'
 WHEN 'body-composition:leanMassKg' THEN 'Masa libre de grasa'
 WHEN 'body-composition:muscleMassKg' THEN 'Masa muscular' END;
 unit_label:=CASE p->>'unit' WHEN 'reps' THEN 'rep' WHEN 'bpm' THEN 'lpm' WHEN 'percent' THEN '%' WHEN 'kg' THEN 'kg' WHEN 'cm' THEN 'cm' WHEN 's' THEN 's' END;
 side_label:=CASE p->>'side' WHEN 'left' THEN ' · izquierda' WHEN 'right' THEN ' · derecha' WHEN 'bilateral' THEN ' · bilateral' WHEN 'not-applicable' THEN '' END;
 IF label IS NULL OR unit_label IS NULL OR side_label IS NULL OR jsonb_typeof(p->'previous') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'value') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'GX_REPORT_EVIDENCE_INVALID' USING ERRCODE='22023'; END IF;
 a:=replace(trim_scale((p->>'previous')::numeric)::text,'.',','); b:=replace(trim_scale((p->>'value')::numeric)::text,'.',',');
 RETURN jsonb_build_object('label',label||side_label,'text',(p->>'periodStart')||': '||a||' '||unit_label||' · '||(p->>'periodEnd')||': '||b||' '||unit_label||'. Comparación profesional revisada; no acredita por sí sola un logro.','source','gx-professional:'||(p->>'publicationId')||':'||(p->>'publicationRevision'),'quality','revisada');
END $f$;
REVOKE ALL ON FUNCTION private.iberfit_gx_report_evidence_row_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Existing private proof enforces assigned Coach + active assurance; its scope
-- is checked again here because this is a separate RPC boundary.
CREATE FUNCTION private.iberfit_gx_report_evidence_v1(p_client uuid,p_start date,p_end date,p_refs jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE proof jsonb; rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_REPORT_EVIDENCE_SCOPE' USING ERRCODE='42501'; END IF;
 proof:=private.iberfit_gx_report_proof_v1(p_client,p_start,p_end,p_refs);
 SELECT jsonb_agg(private.iberfit_gx_report_evidence_row_v1(item) ORDER BY ord) INTO rows FROM jsonb_array_elements(proof->'items') WITH ORDINALITY t(item,ord);
 RETURN jsonb_build_object('schemaVersion',1,'clientId',p_client,'periodStart',p_start,'periodEnd',p_end,'items',proof->'items','evidence',rows);
END $f$;
CREATE FUNCTION public.iberfit_gx_report_evidence_v1(p_client uuid,p_start date,p_end date,p_refs jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT private.iberfit_gx_report_evidence_v1(p_client,p_start,p_end,p_refs);
$f$;
REVOKE ALL ON FUNCTION private.iberfit_gx_report_evidence_v1(uuid,date,date,jsonb),public.iberfit_gx_report_evidence_v1(uuid,date,date,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.iberfit_gx_report_evidence_v1(uuid,date,date,jsonb),public.iberfit_gx_report_evidence_v1(uuid,date,date,jsonb) TO authenticated;
-- Deliberately no report writes, no change to public RLS or M44 legacy source.

-- Single canonical pair implementation. Role-independent core is owner-only.
CREATE FUNCTION private.iberfit_gx_report_pair_core_v1(p_client uuid,p_previous uuid,p_current uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE a public.m26_client_measurements_v43%ROWTYPE; b public.m26_client_measurements_v43%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.m26_client_measurements_v43 WHERE client_id=p_client AND id=p_previous AND metric='gx_followup_v1';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO b FROM public.m26_client_measurements_v43 WHERE client_id=p_client AND id=p_current AND metric='gx_followup_v1';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM private.iberfit_gx_publication_event_v1 e WHERE e.client_id=p_client AND ((e.previous_id IN (p_previous,p_current) AND e.invalidated_previous_at IS NOT NULL) OR (e.current_id IN (p_previous,p_current) AND e.invalidated_current_at IS NOT NULL))) THEN RETURN NULL; END IF;
 IF a.revision IS DISTINCT FROM 1 OR b.revision IS DISTINCT FROM 1 OR a.source IS DISTINCT FROM 'manual' OR b.source IS DISTINCT FROM 'manual' OR a.notes IS NOT NULL OR b.notes IS NOT NULL OR a.measured_at IS NULL OR b.measured_at IS NULL OR a.created_at<a.measured_at OR b.created_at<b.measured_at OR a.created_at IS NULL OR b.created_at IS NULL OR a.created_at>now() OR b.created_at>now() OR a.measured_at<'1900-01-01'::timestamptz OR b.measured_at>now() OR a.measured_at>=b.measured_at OR (a.measured_at AT TIME ZONE 'America/Santiago')::date >= (b.measured_at AT TIME ZONE 'America/Santiago')::date OR a.unit IS DISTINCT FROM b.unit OR a.metadata IS DISTINCT FROM b.metadata OR private.iberfit_gx_followup_valid_v1(a.metadata,a.value,a.unit) IS DISTINCT FROM true OR private.iberfit_gx_followup_valid_v1(b.metadata,b.value,b.unit) IS DISTINCT FROM true OR EXISTS (SELECT 1 FROM public.m26_client_measurements_v43 m WHERE m.client_id=p_client AND m.metric='gx_followup_void_v1' AND m.metadata->>'targetId' IN (a.id::text,b.id::text)) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('previous',jsonb_build_object('id',a.id,'revision',a.revision,'measuredMicros',trunc(extract(epoch FROM a.measured_at)*1000000)::bigint::text,'value',a.value,'unit',a.unit,'protocol',a.metadata),'current',jsonb_build_object('id',b.id,'revision',b.revision,'measuredMicros',trunc(extract(epoch FROM b.measured_at)*1000000)::bigint::text,'value',b.value,'unit',b.unit,'protocol',b.metadata));
END $f$;
REVOKE ALL ON FUNCTION private.iberfit_gx_report_pair_core_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.iberfit_gx_publication_pair_v1(p_client uuid,p_previous uuid,p_current uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
BEGIN
 IF private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN private.iberfit_gx_report_pair_core_v1(p_client,p_previous,p_current);
END $f$;
-- Trusted validator for a marked evidence row; must never expose raw pair.
CREATE FUNCTION private.iberfit_gx_report_evidence_current_v1(p_client uuid,p_start date,p_end date,p_row jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE m text[]; e private.iberfit_gx_publication_event_v1%ROWTYPE; pair jsonb; a jsonb; b jsonb; micros bigint; first_day date; last_day date; item jsonb;
BEGIN
 IF p_client IS NULL OR p_start IS NULL OR p_end IS NULL OR p_start>p_end OR p_end-p_start>366 OR p_end>(now() AT TIME ZONE 'America/Santiago')::date OR jsonb_typeof(p_row) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 m:=regexp_match(p_row->>'source','^gx-professional:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([1-9][0-9]{0,9})$');
 IF m IS NULL OR m[2]::numeric>2147483647 THEN RETURN false; END IF;
 SELECT * INTO e FROM private.iberfit_gx_publication_event_v1 WHERE client_id=p_client AND publication_id=m[1]::uuid ORDER BY revision DESC LIMIT 1;
 IF NOT FOUND OR e.status<>'published' OR e.revision<>m[2]::integer OR e.invalidated_previous_at IS NOT NULL OR e.invalidated_current_at IS NOT NULL THEN RETURN false; END IF;
 pair:=private.iberfit_gx_report_pair_core_v1(p_client,e.previous_id,e.current_id);
 IF pair IS NULL OR pg_catalog.sha256(pg_catalog.convert_to(private.iberfit_gx_publication_normalize_v1(pair)::text,'UTF8')) IS DISTINCT FROM e.pair_hash THEN RETURN false; END IF;
 a:=pair->'previous';b:=pair->'current';
 micros:=(a->>'measuredMicros')::bigint;first_day:=(('epoch'::timestamptz+(micros/1000000)*interval '1 second'+(micros%1000000)*interval '1 microsecond') AT TIME ZONE 'America/Santiago')::date;
 micros:=(b->>'measuredMicros')::bigint;last_day:=(('epoch'::timestamptz+(micros/1000000)*interval '1 second'+(micros%1000000)*interval '1 microsecond') AT TIME ZONE 'America/Santiago')::date;
 IF first_day>=last_day OR last_day<p_start OR last_day>p_end THEN RETURN false; END IF;
 item:=jsonb_build_object('publicationId',e.publication_id,'publicationRevision',e.revision,'testId',b->'protocol'->>'testId','field',b->'protocol'->>'field','side',b->'protocol'->>'side','periodStart',first_day,'periodEnd',last_day,'previous',a->'value','value',b->'value','unit',b->>'unit');
 RETURN p_row IS NOT DISTINCT FROM private.iberfit_gx_report_evidence_row_v1(item);
END $f$;
REVOKE ALL ON FUNCTION private.iberfit_gx_report_evidence_current_v1(uuid,date,date,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.iberfit_gx_report_body_has_refs_v1(p_body jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_body->'evidence')='array' THEN p_body->'evidence' ELSE '[]'::jsonb END) e WHERE lower(btrim(coalesce(e->>'source',''))) LIKE 'gx-professional:%');
$f$;
CREATE FUNCTION private.iberfit_gx_report_body_current_v1(p_client uuid,p_body jsonb)
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
REVOKE ALL ON FUNCTION private.iberfit_gx_report_body_has_refs_v1(jsonb),private.iberfit_gx_report_body_current_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- No direct exposure of internal validation: only own authorized report by ID.
CREATE FUNCTION private.iberfit_gx_report_client_visible_v1(p_client uuid,p_report uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE body jsonb;
BEGIN
 IF auth.uid() IS NULL OR public.iberfit_current_role_v26() IS DISTINCT FROM 'cliente' OR public.iberfit_client_id() IS DISTINCT FROM p_client THEN RETURN false; END IF;
 SELECT content INTO body FROM public.reports WHERE id=p_report AND client_id=p_client AND status='publicado' AND audience='cliente';
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN private.iberfit_gx_report_body_current_v1(p_client,body);
END $f$;
REVOKE ALL ON FUNCTION private.iberfit_gx_report_client_visible_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.iberfit_gx_report_client_visible_v1(uuid,uuid) TO authenticated;
-- Candidate helpers are not activated as policies/triggers yet. Do not enable official
-- report selection until canonical write + M44 authorization + client projection are certified together.
COMMIT;
