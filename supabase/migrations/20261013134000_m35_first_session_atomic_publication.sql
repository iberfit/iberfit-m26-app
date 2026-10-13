-- M35: first Coach publication must create the canonical V26 session atomically.
-- Previously SESION_PUBLICAR was forbidden for an absent session (ENTITY_NOT_FOUND).
-- Keep the registry unchanged (no role or privilege expansion), and retain the
-- preview, client-access, training-service, delivery and revision guards.
-- Only the existing approved->published transition is used. An explicitly
-- reviewed first session is treated as approved by its publishing Coach.
DO $migration$
DECLARE
  v_definition text;
  v_needle text := 'if v_body is null and v_def.bootstrap_allowed then';
  v_replacement text := 'if v_body is null and (v_def.bootstrap_allowed or (v_entity_type=''session'' and v_command_type=''SESION_PUBLICAR'' and v_def.requires_preview)) then';
  v_status_needle text := 'when ''appointment'' then ''propuesta'' when ''intelligence'' then ''borrador'' else null end;';
  v_status_replacement text := 'when ''appointment'' then ''propuesta'' when ''intelligence'' then ''borrador'' when ''session'' then ''aprobada'' else null end;';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.domain_command_registry_v26
    WHERE command_type='SESION_PUBLICAR' AND entity_type='session'
      AND enabled AND requires_preview AND NOT bootstrap_allowed
      AND allowed_roles @> ARRAY['coach','admin']::text[]
  ) THEN
    RAISE EXCEPTION 'M35_SESSION_PUBLISH_CONTRACT_CHANGED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.domain_transitions_v26
    WHERE entity_type='session' AND from_status='aprobada'
      AND event_name='PUBLICAR' AND to_status='publicada'
  ) THEN
    RAISE EXCEPTION 'M35_SESSION_PUBLICATION_TRANSITION_MISSING';
  END IF;
  SELECT pg_get_functiondef('public.iberfit_execute_command_v26_rc29(jsonb)'::regprocedure)
  INTO v_definition;
  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'M35_CANONICAL_ENGINE_MISSING';
  END IF;
  IF strpos(v_definition,v_replacement)>0 AND strpos(v_definition,v_status_replacement)>0 THEN
    RETURN;
  END IF;
  IF (length(v_definition)-length(replace(v_definition,v_needle,'')))<>length(v_needle)
     OR (length(v_definition)-length(replace(v_definition,v_status_needle,'')))<>length(v_status_needle) THEN
    RAISE EXCEPTION 'M35_ENGINE_SOURCE_DRIFT';
  END IF;
  v_definition:=replace(v_definition,v_needle,v_replacement);
  v_definition:=replace(v_definition,v_status_needle,v_status_replacement);
  EXECUTE v_definition;
END;
$migration$;

-- Executable postcondition; fails the migration when existing safety contracts
-- have changed or the narrow bootstrap change was not installed.
DO $verify$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.iberfit_execute_command_v26_rc29(jsonb)'::regprocedure)
  INTO v_definition;
  IF strpos(v_definition, 'v_entity_type=''session'' and v_command_type=''SESION_PUBLICAR'' and v_def.requires_preview')=0
    OR strpos(v_definition, 'when ''session'' then ''aprobada''')=0 THEN
    RAISE EXCEPTION 'M35_SESSION_FIRST_PUBLISH_BOOTSTRAP_NOT_INSTALLED';
  END IF;
END;
$verify$;
