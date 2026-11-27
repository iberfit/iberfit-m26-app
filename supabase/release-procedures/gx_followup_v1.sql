-- GX13/GX27: independent professional observations, NOT a diagnosis or attainment.
-- Reuses m26_client_measurements_v43, its FK/index and audited row mutations.
-- Procedure source only. Run in a transaction after verified backup/release review.
-- No new table or grants on existing tables, no IRI changes. One private scoped service predicate uses SECURITY DEFINER.
DO $preflight$
BEGIN
 IF md5(pg_get_functiondef(to_regprocedure('private.iberfit_training_service_status_at_v1(uuid,uuid,timestamptz)'))) IS DISTINCT FROM '85175e7e90b258c0092024d1027d01e1'
 OR md5(pg_get_functiondef(to_regprocedure('public.iberfit_application_context_v14()'))) IS DISTINCT FROM 'cef11e2423a584c33ab6e1cc9496db18'
 OR has_function_privilege('authenticated','private.iberfit_training_service_status_at_v1(uuid,uuid,timestamptz)'::regprocedure,'EXECUTE')
 THEN RAISE EXCEPTION 'GX_FOLLOWUP_SERVICE_AUTHORITY_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.m26_record_measurement_v43(jsonb)'::regprocedure)) <> 'd4443406b1c302169580ea21f4ef9c8a'
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.m26_client_measurements_v43'::regclass AND relrowsecurity)
    OR EXISTS (SELECT 1 FROM public.m26_client_measurements_v43 WHERE left(metric,12)='gx_followup_')
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname LIKE 'iberfit_gx_followup%')
    OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='m26_client_measurements_v43' AND policyname LIKE 'iberfit_gx_followup%')
    OR to_regclass('public.iberfit_gx_followup_void_target_uq') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.m26_client_measurements_v43'::regclass AND tgname='iberfit_gx_followup_guard_v1')
 THEN RAISE EXCEPTION 'GX_FOLLOWUP_INSTALL_DRIFT'; END IF;
 IF NOT has_schema_privilege('authenticated','private','USAGE')
    OR NOT has_function_privilege('authenticated','public.iberfit_privileged_assurance_context_v65d()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.iberfit_can_access_client_v26(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'GX_FOLLOWUP_PERMISSION_DRIFT'; END IF;
END $preflight$;

CREATE FUNCTION private.iberfit_gx_followup_text_v1(v jsonb, max_len integer, allow_empty boolean DEFAULT false)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT coalesce(jsonb_typeof(v)='string' AND char_length(v#>>'{}') <= max_len
   AND (allow_empty OR char_length(v#>>'{}')>0) AND btrim(v#>>'{}')=v#>>'{}'
   AND (v#>>'{}') !~ '[[:cntrl:]]',false);
$f$;
CREATE FUNCTION private.iberfit_gx_followup_number_v1(v jsonb, low numeric, high numeric, whole boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE n numeric;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
 n:=(v#>>'{}')::numeric;
 RETURN n BETWEEN low AND high AND (NOT whole OR n=trunc(n));
END $f$;
CREATE FUNCTION private.iberfit_gx_followup_shape_v1(v jsonb, keys text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT CASE WHEN jsonb_typeof(v)='object' THEN v ?& keys AND v-keys='{}'::jsonb ELSE false END;
$f$;

CREATE FUNCTION private.iberfit_gx_followup_valid_v1(p_meta jsonb,p_value numeric,p_unit text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE t text; f text; v text; side text; setup jsonb; c text; a text;
BEGIN
 IF NOT private.iberfit_gx_followup_shape_v1(p_meta,ARRAY['schemaVersion','testId','field','side','variant','protocolVersion','configuration','adaptationReason','setup'])
   OR p_meta->'schemaVersion' IS DISTINCT FROM '1'::jsonb
   OR p_meta->'protocolVersion' IS DISTINCT FROM '"iri-protocols-2026.10-v3"'::jsonb
   OR NOT private.iberfit_gx_followup_text_v1(p_meta->'testId',80)
   OR NOT private.iberfit_gx_followup_text_v1(p_meta->'field',40)
   OR NOT private.iberfit_gx_followup_text_v1(p_meta->'side',20)
   OR NOT private.iberfit_gx_followup_text_v1(p_meta->'variant',120)
   OR NOT private.iberfit_gx_followup_text_v1(p_meta->'configuration',400)
   OR NOT private.iberfit_gx_followup_text_v1(p_meta->'adaptationReason',240,true)
   OR p_value IS NULL OR p_unit IS NULL OR octet_length(p_meta::text)>4096
 THEN RETURN false; END IF;
 t:=p_meta->>'testId';f:=p_meta->>'field';v:=p_meta->>'variant';side:=p_meta->>'side';setup:=p_meta->'setup';c:=p_meta->>'configuration';a:=p_meta->>'adaptationReason';
 IF c ~* '(sin registrar|sin especificar|no confirmado|desconocido|—|\mnull\M)' THEN RETURN false; END IF;
 IF t='chair-stand-30s' THEN
  RETURN side='not-applicable' AND f='repetitions' AND p_unit='reps' AND p_value BETWEEN 0 AND 500 AND p_value=trunc(p_value)
   AND v IN ('standard-arms-crossed','adapted-arm-support') AND (v='standard-arms-crossed' OR a<>'')
   AND private.iberfit_gx_followup_shape_v1(setup,ARRAY['chairHeightCm'])
   AND private.iberfit_gx_followup_number_v1(setup->'chairHeightCm',20,100);
 ELSIF t='one-minute-sit-to-stand' THEN
  RETURN side='not-applicable' AND v='1msts-standard'
   AND ((f='repetitions' AND p_unit='reps' AND p_value BETWEEN 0 AND 500 AND p_value=trunc(p_value)) OR (f='oneMinuteHr' AND p_unit='bpm' AND p_value BETWEEN 1 AND 300 AND p_value=trunc(p_value)))
   AND private.iberfit_gx_followup_shape_v1(setup,ARRAY['chairHeightCm','durationSeconds'])
   AND private.iberfit_gx_followup_number_v1(setup->'chairHeightCm',20,100) AND setup->'durationSeconds'='60'::jsonb;
 ELSIF t='bodyweight-squat-60s' THEN
  RETURN side='not-applicable' AND f='repetitions' AND p_unit='reps' AND p_value BETWEEN 0 AND 500 AND p_value=trunc(p_value)
   AND v IN ('bodyweight-60s-standard','bodyweight-60s-adapted') AND (v='bodyweight-60s-standard' OR a<>'')
   AND private.iberfit_gx_followup_shape_v1(setup,ARRAY['depthCriterion','stance','durationSeconds']) AND setup->'durationSeconds'='60'::jsonb
   AND private.iberfit_gx_followup_text_v1(setup->'depthCriterion',120) AND private.iberfit_gx_followup_text_v1(setup->'stance',120);
 ELSIF t='push-test' THEN
  RETURN side='not-applicable' AND f='repetitions' AND p_unit='reps' AND p_value BETWEEN 0 AND 500 AND p_value=trunc(p_value)
   AND v IN ('standard','knees','incline') AND (v='standard' OR a<>'')
   AND private.iberfit_gx_followup_shape_v1(setup,ARRAY['variant','supportHeightCm','durationSeconds']) AND setup->'variant'=to_jsonb(v)
   AND (private.iberfit_gx_followup_number_v1(setup->'supportHeightCm',1,250) OR (v<>'incline' AND setup->'supportHeightCm'='null'::jsonb))
   AND (setup->'durationSeconds'='null'::jsonb OR private.iberfit_gx_followup_number_v1(setup->'durationSeconds',1,3600,true));
 ELSIF t='trx-row' THEN
  RETURN side='not-applicable' AND f='repetitions' AND p_unit='reps' AND p_value BETWEEN 0 AND 500 AND p_value=trunc(p_value)
   AND v IN ('standing-row-standard','reduced-angle') AND (v='standing-row-standard' OR a<>'')
   AND private.iberfit_gx_followup_shape_v1(setup,ARRAY['handleHeightCm','heelDistanceCm','bodyAngleDeg','position','durationSeconds'])
   AND private.iberfit_gx_followup_number_v1(setup->'handleHeightCm',1,300)
   AND (setup->'heelDistanceCm'='null'::jsonb OR private.iberfit_gx_followup_number_v1(setup->'heelDistanceCm',0,300))
   AND (setup->'bodyAngleDeg'='null'::jsonb OR private.iberfit_gx_followup_number_v1(setup->'bodyAngleDeg',0,90))
   AND (setup->'heelDistanceCm'<>'null'::jsonb OR setup->'bodyAngleDeg'<>'null'::jsonb)
   AND private.iberfit_gx_followup_text_v1(setup->'position',120)
   AND (setup->'durationSeconds'='null'::jsonb OR private.iberfit_gx_followup_number_v1(setup->'durationSeconds',1,3600,true));
 ELSIF t='weight-bearing-lunge' OR t='back-saver' THEN
  RETURN side IN ('left','right') AND f='bestCm' AND p_unit='cm' AND p_value BETWEEN -100 AND 100
   AND ((t='weight-bearing-lunge' AND v IN ('standard-barefoot','standard-footwear','supported-adaptation')) OR (t='back-saver' AND v IN ('box-standard','bench-ruler','floor-mat-adapted','adapted-supported')))
   AND private.iberfit_gx_followup_shape_v1(setup,ARRAY['trialCount']) AND private.iberfit_gx_followup_number_v1(setup->'trialCount',1,10,true);
 ELSIF t='core-plank' THEN
  RETURN side='bilateral' AND f='frontPlankSeconds' AND p_unit='s' AND p_value BETWEEN 0 AND 3600
   AND v IN ('front-and-side-standard','front-only','knees-supported') AND (v<>'knees-supported' OR a<>'')
   AND private.iberfit_gx_followup_shape_v1(setup,ARRAY['quality']) AND private.iberfit_gx_followup_text_v1(setup->'quality',120);
 ELSIF t='posterior-chain-endurance' THEN
  RETURN side='not-applicable' AND f='seconds' AND p_unit='s' AND p_value BETWEEN 0 AND 3600
   AND v IN ('sorensen-horizontal','sorensen-45')
   AND private.iberfit_gx_followup_shape_v1(setup,ARRAY['protocol','equipmentCompatible']) AND setup->'protocol'=to_jsonb(v) AND setup->'equipmentCompatible'='true'::jsonb;
 ELSIF t='body-composition' THEN
  RETURN side='not-applicable' AND v IN ('bioimpedancia-segmental','bioimpedancia-tetrapolar','antropometria','otro')
   AND private.iberfit_gx_followup_shape_v1(setup,ARRAY['method','device','measurementConditions','directlyRecorded'])
   AND private.iberfit_gx_followup_text_v1(setup->'method',120) AND setup->'method'=to_jsonb(v)
   AND private.iberfit_gx_followup_text_v1(setup->'device',120) AND private.iberfit_gx_followup_text_v1(setup->'measurementConditions',240) AND setup->'directlyRecorded'='true'::jsonb
   AND ((f='weightKg' AND p_unit='kg' AND p_value BETWEEN 20 AND 350) OR (f='waistCm' AND p_unit='cm' AND p_value BETWEEN 30 AND 250) OR (f='bodyFatPercent' AND p_unit='percent' AND p_value BETWEEN 1 AND 80) OR (f IN ('leanMassKg','muscleMassKg') AND p_unit='kg' AND p_value BETWEEN 1 AND 250));
 END IF;
 -- Unknown protocol, historical/unsupported protocol, or invalid setup: no certification.
 RETURN false;
END $f$;

-- The existing private service ledger is not executable by authenticated.
-- This one narrowly scoped predicate returns only a boolean after identity,
-- assignment and WebAuthn checks. No new privilege on the underlying ledger.
CREATE FUNCTION private.iberfit_gx_followup_can_coach_v1(p_client uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE ctx jsonb; org uuid;
BEGIN
 IF p_client IS NULL OR auth.uid() IS NULL OR public.iberfit_current_role_v26() IS DISTINCT FROM 'coach' OR public.iberfit_can_access_client_v26(p_client) IS DISTINCT FROM true THEN RETURN false; END IF;
 ctx:=public.iberfit_privileged_assurance_context_v65d();
 IF NOT coalesce(ctx->>'iberfitAssurance'='verified' AND ctx->>'assuranceMethod'='webauthn',false) THEN RETURN false; END IF;
 ctx:=public.iberfit_application_context_v14();
 org:=nullif(ctx->>'organizationId','')::uuid;
 IF org IS NULL THEN RETURN false; END IF;
 RETURN coalesce(private.iberfit_training_service_status_at_v1(org,p_client,now()) IN ('active','paused'),false);
END $f$;

-- A rectification is an append-only invalidation, never an UPDATE of evidence.
-- One narrowly scoped unique index supplies concurrency protection. Existing PK/date index remain.
CREATE UNIQUE INDEX iberfit_gx_followup_void_target_uq ON public.m26_client_measurements_v43 (client_id, (metadata->>'targetId')) WHERE metric='gx_followup_void_v1';
CREATE FUNCTION private.iberfit_gx_followup_void_valid_v1(p_meta jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT coalesce(private.iberfit_gx_followup_shape_v1(p_meta,ARRAY['schemaVersion','targetId','reason'])
   AND p_meta->'schemaVersion'='1'::jsonb
   AND jsonb_typeof(p_meta->'targetId')='string' AND p_meta->>'targetId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND p_meta->'reason' IN ('"measurement_error"'::jsonb,'"protocol_error"'::jsonb,'"duplicate"'::jsonb,'"wrong_subject"'::jsonb,'"other_invalid"'::jsonb),false);
$f$;

CREATE FUNCTION private.iberfit_gx_followup_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE target public.m26_client_measurements_v43%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF left(OLD.metric,12)='gx_followup_' OR left(NEW.metric,12)='gx_followup_' THEN RAISE EXCEPTION 'GX_FOLLOWUP_IMMUTABLE' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF left(NEW.metric,12)<>'gx_followup_' THEN RETURN NEW; END IF;
 IF current_user<>'authenticated' OR NOT private.iberfit_gx_followup_can_coach_v1(NEW.client_id) THEN RAISE EXCEPTION 'GX_FOLLOWUP_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NEW.source IS DISTINCT FROM 'manual' OR NEW.notes IS NOT NULL OR NEW.created_by IS DISTINCT FROM auth.uid()
    OR NEW.measured_at IS NULL OR NEW.measured_at>now() OR NEW.measured_at<'1900-01-01'::timestamptz OR NEW.id IS NULL
 THEN RAISE EXCEPTION 'GX_FOLLOWUP_INVALID' USING ERRCODE='22023'; END IF;
 IF NEW.metric='gx_followup_v1' THEN
  IF private.iberfit_gx_followup_valid_v1(NEW.metadata,NEW.value,NEW.unit) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_FOLLOWUP_INVALID' USING ERRCODE='22023'; END IF;
 ELSIF NEW.metric='gx_followup_void_v1' THEN
  IF private.iberfit_gx_followup_void_valid_v1(NEW.metadata) IS DISTINCT FROM true OR NEW.value IS DISTINCT FROM 0 OR NEW.unit IS DISTINCT FROM 'event' OR NEW.id::text=NEW.metadata->>'targetId' THEN RAISE EXCEPTION 'GX_FOLLOWUP_VOID_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO target FROM public.m26_client_measurements_v43 WHERE id=(NEW.metadata->>'targetId')::uuid AND client_id=NEW.client_id AND metric='gx_followup_v1';
  IF NOT FOUND OR target.revision<>1 OR target.measured_at IS DISTINCT FROM NEW.measured_at OR target.source<>'manual' OR target.notes IS NOT NULL OR private.iberfit_gx_followup_valid_v1(target.metadata,target.value,target.unit) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_FOLLOWUP_TARGET_INVALID' USING ERRCODE='22023'; END IF;
 ELSE RAISE EXCEPTION 'GX_FOLLOWUP_INVALID' USING ERRCODE='22023'; END IF;
 NEW.revision:=1; NEW.created_at:=now(); NEW.updated_at:=now();
 RETURN NEW;
END $f$;

-- Existing permissive policies remain in force. Restrictive policies intersect with them.
-- The client never sees the internal source directly; use separately reviewed publication.
CREATE POLICY iberfit_gx_followup_read_v1 ON public.m26_client_measurements_v43 AS RESTRICTIVE FOR SELECT TO authenticated USING (CASE WHEN left(metric,12)='gx_followup_' THEN private.iberfit_gx_followup_can_coach_v1(client_id) ELSE true END);
CREATE POLICY iberfit_gx_followup_update_v1 ON public.m26_client_measurements_v43 AS RESTRICTIVE FOR UPDATE TO authenticated USING (left(metric,12)<>'gx_followup_') WITH CHECK (left(metric,12)<>'gx_followup_');
CREATE POLICY iberfit_gx_followup_delete_v1 ON public.m26_client_measurements_v43 AS RESTRICTIVE FOR DELETE TO authenticated USING (left(metric,12)<>'gx_followup_');
CREATE TRIGGER iberfit_gx_followup_guard_v1 BEFORE INSERT OR UPDATE ON public.m26_client_measurements_v43 FOR EACH ROW EXECUTE FUNCTION private.iberfit_gx_followup_guard_v1();

-- Idempotent write: caller supplies one UUID per observation and retries only that UUID.
-- No upsert, no overwrite; a different payload for an existing id is a conflict.
CREATE FUNCTION public.iberfit_gx_followup_record_v1(p_id uuid,p_client_id uuid,p_measured_at timestamptz,p_value numeric,p_unit text,p_protocol jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE r public.m26_client_measurements_v43%ROWTYPE;
BEGIN
 IF current_user<>'authenticated' OR NOT private.iberfit_gx_followup_can_coach_v1(p_client_id) THEN RAISE EXCEPTION 'GX_FOLLOWUP_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_client_id IS NULL OR p_measured_at IS NULL OR p_measured_at>now() OR p_measured_at<'1900-01-01'::timestamptz OR private.iberfit_gx_followup_valid_v1(p_protocol,p_value,p_unit) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_FOLLOWUP_INVALID' USING ERRCODE='22023'; END IF;
 INSERT INTO public.m26_client_measurements_v43(id,client_id,metric,value,unit,measured_at,source,metadata,created_by)
 VALUES(p_id,p_client_id,'gx_followup_v1',p_value,p_unit,p_measured_at,'manual',p_protocol,auth.uid()) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO r FROM public.m26_client_measurements_v43 WHERE id=p_id AND client_id=p_client_id AND metric='gx_followup_v1' AND created_by=auth.uid();
 IF NOT FOUND OR r.value IS DISTINCT FROM p_value OR r.unit IS DISTINCT FROM p_unit OR r.measured_at IS DISTINCT FROM p_measured_at OR r.metadata IS DISTINCT FROM p_protocol OR r.revision IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'GX_FOLLOWUP_CONFLICT' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('ok',true,'id',r.id,'clientId',r.client_id,'measuredAt',r.measured_at,'value',r.value,'unit',r.unit,'revision',r.revision,'protocol',r.metadata);
END $f$;

-- A retry returns the same immutable rectification, with the server timestamp.
CREATE FUNCTION public.iberfit_gx_followup_void_v1(p_id uuid,p_client_id uuid,p_target_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE target public.m26_client_measurements_v43%ROWTYPE; r public.m26_client_measurements_v43%ROWTYPE; meta jsonb;
BEGIN
 IF current_user<>'authenticated' OR NOT private.iberfit_gx_followup_can_coach_v1(p_client_id) THEN RAISE EXCEPTION 'GX_FOLLOWUP_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 meta:=jsonb_build_object('schemaVersion',1,'targetId',p_target_id,'reason',p_reason);
 IF p_id IS NULL OR p_target_id IS NULL OR p_id=p_target_id OR private.iberfit_gx_followup_void_valid_v1(meta) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_FOLLOWUP_VOID_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO target FROM public.m26_client_measurements_v43 WHERE id=p_target_id AND client_id=p_client_id AND metric='gx_followup_v1';
 IF NOT FOUND THEN RAISE EXCEPTION 'GX_FOLLOWUP_TARGET_INVALID' USING ERRCODE='22023'; END IF;
 BEGIN
  INSERT INTO public.m26_client_measurements_v43(id,client_id,metric,value,unit,measured_at,source,metadata,created_by)
  VALUES(p_id,p_client_id,'gx_followup_void_v1',0,'event',target.measured_at,'manual',meta,auth.uid()) ON CONFLICT(id) DO NOTHING;
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'GX_FOLLOWUP_VOID_CONFLICT' USING ERRCODE='40001'; END;
 SELECT * INTO r FROM public.m26_client_measurements_v43 WHERE id=p_id AND client_id=p_client_id AND metric='gx_followup_void_v1' AND created_by=auth.uid();
 IF NOT FOUND OR r.metadata IS DISTINCT FROM meta OR r.measured_at IS DISTINCT FROM target.measured_at OR r.revision IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'GX_FOLLOWUP_VOID_CONFLICT' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('ok',true,'id',r.id,'clientId',r.client_id,'targetId',p_target_id,'reason',p_reason,'voidedAt',r.created_at);
END $f$;

-- Demand-only history; explicit access check prevents an unauthorized empty list.
-- Cursor is stable even when multiple observations share the same instant.
CREATE FUNCTION public.iberfit_gx_followup_list_v1(p_client_id uuid,p_limit integer DEFAULT 30,p_cursor_at timestamptz DEFAULT NULL,p_cursor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE r record; items jsonb:='[]'::jsonb; cursor_at timestamptz; cursor_id uuid; more boolean:=false; n integer:=0;
BEGIN
 IF current_user<>'authenticated' OR NOT private.iberfit_gx_followup_can_coach_v1(p_client_id) THEN RAISE EXCEPTION 'GX_FOLLOWUP_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_client_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR (p_cursor_at IS NULL)<>(p_cursor_id IS NULL) THEN RAISE EXCEPTION 'GX_FOLLOWUP_PAGE_INVALID' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT o.*,v.id AS void_id,v.metadata AS void_meta,v.created_at AS void_at,v.measured_at AS void_measured_at,v.revision AS void_revision,v.source AS void_source,v.notes AS void_notes,v.value AS void_value,v.unit AS void_unit
   FROM public.m26_client_measurements_v43 o LEFT JOIN public.m26_client_measurements_v43 v ON v.client_id=o.client_id AND v.metric='gx_followup_void_v1' AND v.metadata->>'targetId'=o.id::text
   WHERE o.client_id=p_client_id AND o.metric='gx_followup_v1'
   AND (p_cursor_at IS NULL OR (o.measured_at,o.id)<(p_cursor_at,p_cursor_id)) ORDER BY o.measured_at DESC,o.id DESC LIMIT p_limit+1 LOOP
  IF n=p_limit THEN more:=true; EXIT; END IF;
  IF r.revision<>1 OR r.source<>'manual' OR r.notes IS NOT NULL OR private.iberfit_gx_followup_valid_v1(r.metadata,r.value,r.unit) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_FOLLOWUP_INTEGRITY_INVALID'; END IF;
  IF r.void_id IS NOT NULL AND (private.iberfit_gx_followup_void_valid_v1(r.void_meta) IS DISTINCT FROM true OR r.void_measured_at IS DISTINCT FROM r.measured_at OR r.void_revision<>1 OR r.void_source<>'manual' OR r.void_notes IS NOT NULL OR r.void_value<>0 OR r.void_unit<>'event' OR r.void_at<r.measured_at) THEN RAISE EXCEPTION 'GX_FOLLOWUP_VOID_INTEGRITY_INVALID'; END IF;
  items:=items||jsonb_build_array(jsonb_build_object('id',r.id,'clientId',r.client_id,'measuredAt',r.measured_at,'value',r.value,'unit',r.unit,'revision',r.revision,'protocol',r.metadata,'rectification',CASE WHEN r.void_id IS NULL THEN NULL ELSE jsonb_build_object('id',r.void_id,'targetId',r.id,'reason',r.void_meta->>'reason','voidedAt',r.void_at) END));
  cursor_at:=r.measured_at;cursor_id:=r.id;n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'clientId',p_client_id,'items',items,'nextCursor',CASE WHEN more THEN jsonb_build_object('measuredAt',cursor_at,'id',cursor_id) ELSE NULL END);
END $f$;

REVOKE ALL ON FUNCTION private.iberfit_gx_followup_text_v1(jsonb,integer,boolean),private.iberfit_gx_followup_number_v1(jsonb,numeric,numeric,boolean),private.iberfit_gx_followup_shape_v1(jsonb,text[]),private.iberfit_gx_followup_valid_v1(jsonb,numeric,text),private.iberfit_gx_followup_can_coach_v1(uuid),private.iberfit_gx_followup_guard_v1(),public.iberfit_gx_followup_record_v1(uuid,uuid,timestamptz,numeric,text,jsonb),public.iberfit_gx_followup_list_v1(uuid,integer,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.iberfit_gx_followup_text_v1(jsonb,integer,boolean),private.iberfit_gx_followup_number_v1(jsonb,numeric,numeric,boolean),private.iberfit_gx_followup_shape_v1(jsonb,text[]),private.iberfit_gx_followup_valid_v1(jsonb,numeric,text),private.iberfit_gx_followup_can_coach_v1(uuid),public.iberfit_gx_followup_record_v1(uuid,uuid,timestamptz,numeric,text,jsonb),public.iberfit_gx_followup_list_v1(uuid,integer,timestamptz,uuid) TO authenticated;
-- Trigger invocation needs no direct EXECUTE grant to API users. Service-role
-- deletion through the existing authorized erasure lifecycle remains possible.

REVOKE ALL ON FUNCTION private.iberfit_gx_followup_void_valid_v1(jsonb),public.iberfit_gx_followup_void_v1(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.iberfit_gx_followup_void_valid_v1(jsonb),public.iberfit_gx_followup_void_v1(uuid,uuid,uuid,text) TO authenticated;
