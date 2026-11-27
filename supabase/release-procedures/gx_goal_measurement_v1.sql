-- GX27 · guarded measurable goals. Candidate only; independent QA and recovery proof required.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.domain_entities_v26 IN SHARE ROW EXCLUSIVE MODE;
DO $gx_preflight$
DECLARE v_proc pg_proc%ROWTYPE;
BEGIN
 SELECT * INTO v_proc FROM pg_proc WHERE oid=to_regprocedure('public.iberfit_m43_client_safe_plan_v2(jsonb)');
 IF NOT FOUND OR md5(pg_get_functiondef(v_proc.oid))<>'56ee5426a2a83ea3ad00fd863f65e007'
    OR pg_get_userbyid(v_proc.proowner)<>'postgres' OR v_proc.prosecdef OR v_proc.provolatile<>'i'
    OR v_proc.proacl::text IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN
   RAISE EXCEPTION 'GX_GOAL_BASE_PROJECTION_DRIFT';
 END IF;
 IF EXISTS(SELECT 1 FROM public.domain_entities_v26 WHERE entity_type='planning' AND body ? 'goalMeasurement') THEN
   RAISE EXCEPTION 'GX_GOAL_EXISTING_DATA_REVIEW_REQUIRED';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'iberfit_gx_goal%') THEN
   RAISE EXCEPTION 'GX_GOAL_HELPER_ALREADY_EXISTS';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.iri_assessments'::regclass AND conname='iri_assessments_initial_only_v4') THEN
   RAISE EXCEPTION 'GX_GOAL_IRI_BOUNDARY_DRIFT';
 END IF;
END;
$gx_preflight$;
CREATE FUNCTION private.iberfit_gx_goal_definition_v1(p_body jsonb,p_today date)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $gx$
DECLARE g jsonb; k text; v text; u text; d text; b numeric; t numeric;
        bd date; dl date; sd date; ed date; ref text;
BEGIN
 IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
 g:=p_body->'goalMeasurement';
 IF jsonb_typeof(g) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
 IF g->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR (g - ARRAY['schemaVersion','metric','unit','direction','baseline','baselineDate','target','deadline','protocol','evidenceRef']::text[]) <> '{}'::jsonb THEN RETURN NULL; END IF;
 FOREACH k IN ARRAY ARRAY['metric','protocol','unit','direction','baselineDate','deadline'] LOOP
   IF jsonb_typeof(g->k) IS DISTINCT FROM 'string' THEN RETURN NULL; END IF;
   v:=g->>k;
   IF v='' OR v<>btrim(v) OR v ~ '[[:cntrl:]]' THEN RETURN NULL; END IF;
 END LOOP;
 IF char_length(g->>'metric')>80 OR char_length(g->>'protocol')>180 THEN RETURN NULL; END IF;
 u:=g->>'unit'; d:=g->>'direction';
 IF u NOT IN ('kg','reps','m','km','s','min','bpm','w','cm','percent','points','sessions') OR d NOT IN ('increase','decrease') THEN RETURN NULL; END IF;
 IF jsonb_typeof(g->'baseline') IS DISTINCT FROM 'number' OR jsonb_typeof(g->'target') IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
 b:=(g->>'baseline')::numeric; t:=(g->>'target')::numeric;
 IF b<0 OR t<0 OR b>(CASE WHEN u='percent' THEN 100 ELSE 1000000 END) OR t>(CASE WHEN u='percent' THEN 100 ELSE 1000000 END) THEN RETURN NULL; END IF;
 IF u IN ('reps','bpm','sessions') AND (trunc(b)<>b OR trunc(t)<>t) THEN RETURN NULL; END IF;
 IF (d='increase' AND t<=b) OR (d='decrease' AND t>=b) THEN RETURN NULL; END IF;
 FOREACH v IN ARRAY ARRAY[g->>'baselineDate',g->>'deadline',p_body->>'startDate',p_body->>'endDate'] LOOP
   IF v IS NULL OR v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN NULL; END IF;
 END LOOP;
 IF jsonb_typeof(p_body->'startDate') IS DISTINCT FROM 'string' OR jsonb_typeof(p_body->'endDate') IS DISTINCT FROM 'string' THEN RETURN NULL; END IF;
 bd:=(g->>'baselineDate')::date; dl:=(g->>'deadline')::date; sd:=(p_body->>'startDate')::date; ed:=(p_body->>'endDate')::date;
 IF to_char(bd,'YYYY-MM-DD')<>g->>'baselineDate' OR to_char(dl,'YYYY-MM-DD')<>g->>'deadline' OR to_char(sd,'YYYY-MM-DD')<>p_body->>'startDate' OR to_char(ed,'YYYY-MM-DD')<>p_body->>'endDate' THEN RETURN NULL; END IF;
 IF sd>ed OR dl<sd OR dl>ed OR dl<bd OR (p_today IS NOT NULL AND bd>p_today) THEN RETURN NULL; END IF;
 IF (p_body ? 'start_date' AND p_body->'start_date' IS DISTINCT FROM p_body->'startDate') OR (p_body ? 'end_date' AND p_body->'end_date' IS DISTINCT FROM p_body->'endDate') THEN RETURN NULL; END IF;
 IF g ? 'evidenceRef' THEN
   IF jsonb_typeof(g->'evidenceRef') IS DISTINCT FROM 'string' THEN RETURN NULL; END IF;
   ref:=g->>'evidenceRef';
   IF char_length(ref)>300 OR ref !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[|](0|[1-9][0-9]{0,15})[|][a-z0-9-]+:(left|right|bilateral|not-applicable):[A-Za-z][A-Za-z0-9]*$' THEN RETURN NULL; END IF;
   IF split_part(ref,'|',2)::numeric>9007199254740991 THEN RETURN NULL; END IF;
 END IF;
 RETURN g;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN NULL;
END;
$gx$;
CREATE FUNCTION private.iberfit_gx_goal_anchor_measurement_v1(p_goal jsonb,p_sections jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $gx$
DECLARE ref text; v_test_id text; side_id text; v_field_id text; label text; expected_unit text;
        minimum numeric; maximum numeric; rows_found integer; p jsonb; v jsonb; m numeric; comp jsonb; k text;
BEGIN
 IF jsonb_typeof(p_goal) IS DISTINCT FROM 'object' OR jsonb_typeof(p_sections) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 ref:=split_part(p_goal->>'evidenceRef','|',3);
 v_test_id:=split_part(ref,':',1); side_id:=split_part(ref,':',2); v_field_id:=split_part(ref,':',3);
 SELECT c.label,c.unit,c.minimum,c.maximum INTO label,expected_unit,minimum,maximum
 FROM (VALUES
       ('body-composition','weightKg','Peso corporal','kg',20,350),
       ('body-composition','bodyFatPercent','Grasa corporal','percent',1,80),
       ('body-composition','leanMassKg','Masa libre de grasa','kg',1,250),
       ('body-composition','muscleMassKg','Masa muscular','kg',1,250),
       ('body-composition','waistCm','Perímetro de cintura','cm',30,250),
       ('weight-bearing-lunge','bestCm','Movilidad de tobillo','cm',0,100),
       ('back-saver','bestCm','Cadena posterior','cm',0,100),
       ('chair-stand-30s','repetitions','Levantarse de la silla en 30 s','reps',0,500),
       ('push-test','repetitions','Empuje','reps',0,500),
       ('trx-row','repetitions','Remo en suspensión','reps',0,500),
       ('core-plank','frontPlankSeconds','Plancha frontal','s',0,3600),
       ('bodyweight-squat-60s','repetitions','Sentadillas en 60 s','reps',0,500),
       ('posterior-chain-endurance','seconds','Resistencia de cadena posterior','s',0,3600),
       ('one-minute-sit-to-stand','repetitions','Levantarse de la silla en 1 min','reps',0,500),
       ('one-minute-sit-to-stand','oneMinuteHr','Frecuencia cardíaca al minuto de recuperación','bpm',1,300),
       ('ymca-three-minute-step','oneMinuteHr','Frecuencia cardíaca al minuto de recuperación','bpm',1,300),
       ('treadmill-three-minute-field','oneMinuteHr','Frecuencia cardíaca al minuto de recuperación','bpm',1,300),
       ('legacy-iberfit-three-minute-step-adapted','oneMinuteHr','Frecuencia cardíaca al minuto de recuperación','bpm',1,300)
 ) AS c(test_id,field_id,label,unit,minimum,maximum)
 WHERE c.test_id=v_test_id AND c.field_id=v_field_id;
 IF NOT FOUND THEN RETURN false; END IF;
 label:=label||CASE side_id WHEN 'left' THEN ' · izquierda' WHEN 'right' THEN ' · derecha' ELSE '' END;
 IF p_goal->>'metric' IS DISTINCT FROM label OR p_goal->>'unit' IS DISTINCT FROM expected_unit
    OR side_id NOT IN ('left','right','bilateral','not-applicable') THEN RETURN false; END IF;
 IF jsonb_typeof(p_sections->'protocolRecords') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_sections->'protocolRecords')>64 THEN RETURN false; END IF;
 SELECT count(*) INTO rows_found FROM jsonb_array_elements(p_sections->'protocolRecords') AS x(value)
 WHERE x.value->>'testId'=v_test_id AND x.value->>'side'=side_id;
 IF rows_found<>1 THEN RETURN false; END IF;
 SELECT x.value INTO p FROM jsonb_array_elements(p_sections->'protocolRecords') AS x(value)
 WHERE x.value->>'testId'=v_test_id AND x.value->>'side'=side_id;
 IF p->'valid' IS DISTINCT FROM 'true'::jsonb OR p->'executionValid' IS DISTINCT FROM 'true'::jsonb
    OR p->'trackingComparable' IS DISTINCT FROM 'true'::jsonb OR p->>'date' IS DISTINCT FROM p_goal->>'baselineDate'
    OR coalesce(p->>'stopReason','')<>'' OR jsonb_typeof(p->'result') IS DISTINCT FROM 'object'
    OR p#>'{result,valid}'='false'::jsonb THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['variant','configuration','protocolVersion'] LOOP
   IF jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR btrim(coalesce(p->>k,''))='' THEN RETURN false; END IF;
 END LOOP;
 IF p->>'configuration' ~* 'sin registrar|no confirmado|—|\mnull\M' THEN RETURN false; END IF;
 v:=p->'result'->v_field_id;
 IF jsonb_typeof(v) IS DISTINCT FROM 'number' AND (jsonb_typeof(v) IS DISTINCT FROM 'string' OR v#>>'{}' !~ '^[+-]?[0-9]+([.][0-9]+)?$') THEN RETURN false; END IF;
 m:=(v#>>'{}')::numeric;
 IF m<minimum OR m>maximum OR m IS DISTINCT FROM (p_goal->>'baseline')::numeric THEN RETURN false; END IF;
 IF v_test_id='one-minute-sit-to-stand' AND (jsonb_typeof(p#>'{result,chairHeightCm}') IS DISTINCT FROM 'number' OR (p#>>'{result,chairHeightCm}')::numeric<=0 OR p#>'{result,durationSeconds}' IS DISTINCT FROM '60'::jsonb) THEN RETURN false; END IF;
 IF v_test_id='body-composition' THEN
   comp:=p_sections->'bodyComposition';
   IF jsonb_typeof(comp) IS DISTINCT FROM 'object' OR comp->'skipped'='true'::jsonb THEN RETURN false; END IF;
   FOREACH k IN ARRAY ARRAY['method','device','measurementConditions'] LOOP
     IF jsonb_typeof(comp->k) IS DISTINCT FROM 'string' OR btrim(coalesce(comp->>k,''))='' OR btrim(comp->>k) ~* '^(sin registrar|sin especificar|desconocid[oa]|no (registrad[oa]|confirmad[oa]|disponible)|—|-)$' THEN RETURN false; END IF;
   END LOOP;
   v:=comp->v_field_id;
   IF jsonb_typeof(v) IS DISTINCT FROM 'number' AND (jsonb_typeof(v) IS DISTINCT FROM 'string' OR v#>>'{}' !~ '^[+-]?[0-9]+([.][0-9]+)?$') THEN RETURN false; END IF;
   IF (v#>>'{}')::numeric IS DISTINCT FROM m THEN RETURN false; END IF;
   -- This only proves direct raw measurement identity. The existing JS engine
   -- must still reject discordant derived compartments before comparing outcomes.
 END IF;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END;
$gx$;
CREATE FUNCTION private.iberfit_gx_goal_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $gx$
DECLARE g jsonb; source_id uuid; source_revision bigint; a public.iri_assessments%ROWTYPE; v_today date;
        k text; should_check boolean;
BEGIN
 IF NEW.entity_type<>'planning' THEN RETURN NEW; END IF;
 IF NOT (NEW.body ? 'goalMeasurement') OR NEW.body->'goalMeasurement'='null'::jsonb THEN RETURN NEW; END IF;
 should_check:=TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN
   should_check:=NEW.body->'goalMeasurement' IS DISTINCT FROM OLD.body->'goalMeasurement'
      OR NEW.body->'startDate' IS DISTINCT FROM OLD.body->'startDate'
      OR NEW.body->'endDate' IS DISTINCT FROM OLD.body->'endDate'
      OR NEW.body->'start_date' IS DISTINCT FROM OLD.body->'start_date'
      OR NEW.body->'end_date' IS DISTINCT FROM OLD.body->'end_date'
      OR NEW.body->'clientId' IS DISTINCT FROM OLD.body->'clientId'
      OR NEW.body->'client_id' IS DISTINCT FROM OLD.body->'client_id'
      OR NEW.body->'clienteId' IS DISTINCT FROM OLD.body->'clienteId'
      OR NEW.body->'cliente_id' IS DISTINCT FROM OLD.body->'cliente_id'
      OR NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
      OR (NEW.status IN ('validado','aprobado','publicado','published') AND NEW.status IS DISTINCT FROM OLD.status);
 END IF;
 IF NOT should_check THEN RETURN NEW; END IF;
 v_today:=(statement_timestamp() AT TIME ZONE 'America/Santiago')::date;
 g:=private.iberfit_gx_goal_definition_v1(NEW.body,v_today);
 IF g IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='M26_GOAL_MEASUREMENT_INVALID'; END IF;
 FOREACH k IN ARRAY ARRAY['clientId','client_id','clienteId','cliente_id'] LOOP
   IF NEW.body ? k AND NEW.body->>k IS DISTINCT FROM NEW.client_id::text THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='M26_GOAL_ANCHOR_INVALID'; END IF;
 END LOOP;
 IF NOT (g ? 'evidenceRef') THEN RETURN NEW; END IF;
 source_id:=split_part(g->>'evidenceRef','|',1)::uuid;
 source_revision:=split_part(g->>'evidenceRef','|',2)::bigint;
 SELECT * INTO a FROM public.iri_assessments i
 WHERE i.id=source_id AND i.client_id=NEW.client_id AND i.revision=source_revision
   AND i.assessment_type='inicial' AND i.status::text IN ('aprobado','publicado')
   AND i.evaluated_at=(g->>'baselineDate')::date
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='M26_GOAL_ANCHOR_INVALID'; END IF;
 IF a.sections->>'assessmentDate' IS DISTINCT FROM g->>'baselineDate'
    OR jsonb_typeof(a.sections->'firstSessionCompletedAt') IS DISTINCT FROM 'string'
    OR (a.sections->>'firstSessionCompletedAt')::timestamptz>statement_timestamp()
    OR NOT private.iberfit_gx_goal_anchor_measurement_v1(g,a.sections) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='M26_GOAL_ANCHOR_INVALID';
 END IF;
 -- Do not silently bind a later initial record if an earlier confirmed one exists.
 IF EXISTS(SELECT 1 FROM public.iri_assessments i WHERE i.client_id=NEW.client_id AND i.id<>a.id
   AND i.assessment_type='inicial' AND i.status::text IN ('aprobado','publicado')
   AND i.evaluated_at<=a.evaluated_at AND i.sections ? 'firstSessionCompletedAt') THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='M26_GOAL_ANCHOR_INVALID';
 END IF;
 RETURN NEW;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='M26_GOAL_ANCHOR_INVALID';
END;
$gx$;
REVOKE ALL ON FUNCTION private.iberfit_gx_goal_definition_v1(jsonb,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.iberfit_gx_goal_anchor_measurement_v1(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.iberfit_gx_goal_guard_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.iberfit_gx_goal_definition_v1(jsonb,date) TO service_role;
GRANT EXECUTE ON FUNCTION private.iberfit_gx_goal_anchor_measurement_v1(jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.iberfit_m43_client_safe_plan_v2(p_body jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
 SELECT public.iberfit_m43_client_scalar_fields_v1(p_body,
   ARRAY['id','clientId','name','title','goal','summary','startDate','endDate',
         'modality','weeklyFrequency','sessionDurationMinutes','status','createdAt',
         'updatedAt','approvedAt','publishedAt','revision','publishedRevision',
         'visibleToClient']::text[])
 || CASE WHEN g.value IS NOT NULL THEN jsonb_build_object('goalMeasurement',g.value-'evidenceRef') ELSE '{}'::jsonb END
 FROM (SELECT private.iberfit_gx_goal_definition_v1(p_body,NULL::date) AS value) g;
$function$;
CREATE TRIGGER iberfit_gx_goal_guard_v1 BEFORE INSERT OR UPDATE ON public.domain_entities_v26
FOR EACH ROW WHEN (NEW.entity_type='planning') EXECUTE FUNCTION private.iberfit_gx_goal_guard_v1();
DO $gx_postflight$
BEGIN
 IF has_function_privilege('anon','public.iberfit_m43_client_safe_plan_v2(jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.iberfit_m43_client_safe_plan_v2(jsonb)','EXECUTE')
    OR has_function_privilege('anon','private.iberfit_gx_goal_definition_v1(jsonb,date)','EXECUTE')
    OR has_function_privilege('authenticated','private.iberfit_gx_goal_definition_v1(jsonb,date)','EXECUTE')
    OR has_function_privilege('authenticated','private.iberfit_gx_goal_anchor_measurement_v1(jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','private.iberfit_gx_goal_guard_v1()','EXECUTE') THEN
   RAISE EXCEPTION 'GX_GOAL_ACL_DRIFT';
 END IF;
END;
$gx_postflight$;
COMMIT;
