-- IBERFIT U34 prescription preservation INSTALL; candidate, not applied.
-- Execute only in the protected release after authenticated QA and backup validation.
-- Rollback requires suspending reprogramming admission externally first.
BEGIN;
DO $guard$
DECLARE
 fn regprocedure := 'private.iberfit_u34_coach_occurrence_change_v1(jsonb)'::regprocedure;
 body text := pg_get_functiondef(fn);
 old_acl aclitem[];
 old_owner oid;
 old_count integer;
 anchor_text text;
 replacement_text text;
BEGIN
 IF md5(body) IS DISTINCT FROM 'ca01ce1428cf906ab3db3dd76f75740f' OR
    md5(pg_get_functiondef('private.iberfit_u32_create_occurrences_batch_v1(jsonb)'::regprocedure)) IS DISTINCT FROM '4f1a97e2c6feefbc1e51954ebce61dd5' THEN
  RAISE EXCEPTION 'U34_PRESCRIPTION_BASELINE_DRIFT';
 END IF;
 SELECT proacl,proowner INTO old_acl,old_owner FROM pg_proc WHERE oid=fn;
 IF EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) a(role_name)
   WHERE has_function_privilege(a.role_name,fn,'EXECUTE')) OR EXISTS (
   SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=fn AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
  RAISE EXCEPTION 'U34_PRIVILEGES_DRIFT';
 END IF;
 anchor_text := $old$ IF occ.appointment_id IS NOT NULL THEN
$old$;
 replacement_text := $new$ IF cmd_type='OCURRENCIA_REPROGRAMAR' THEN
  SELECT revision INTO src_revision FROM public.domain_entities_v26
   WHERE entity_type='session' AND entity_id=occ.session_id AND client_id=owner;
  IF src_revision IS DISTINCT FROM occ.prescription_revision THEN
   RETURN jsonb_build_object('kind','conflict','reason','PRESCRIPTION_REVISION_CHANGED',
    'operationId',op,'remoteRevision',occ.revision);END IF;
 END IF;
 IF occ.appointment_id IS NOT NULL THEN
$new$;
 old_count := (length(body)-length(replace(body,anchor_text,'')))/length(anchor_text);
 IF old_count<>1 THEN RAISE EXCEPTION 'U34_PRESCRIPTION_ANCHOR_1'; END IF;
 body := replace(body,anchor_text,replacement_text);
 anchor_text := $old$  SELECT revision INTO src_revision FROM public.domain_entities_v26
   WHERE entity_type='session' AND entity_id=occ.session_id AND client_id=owner;
  IF src_revision IS NULL THEN RAISE EXCEPTION 'U34_SOURCE_MISSING' USING errcode='23503';END IF;
$old$;
 replacement_text := $new$  -- U32 checks the original prescription revision under its existing source lock.
$new$;
 old_count := (length(body)-length(replace(body,anchor_text,'')))/length(anchor_text);
 IF old_count<>1 THEN RAISE EXCEPTION 'U34_PRESCRIPTION_ANCHOR_2'; END IF;
 body := replace(body,anchor_text,replacement_text);
 anchor_text := $old$  IF batch->>'kind'<>'ack' OR batch->>'count'<>'1'
    OR batch->>'duplicate' IS DISTINCT FROM 'false' THEN
   RAISE EXCEPTION 'U34_REPLACEMENT_NOT_APPLIED' USING errcode='23514';END IF;
$old$;
 replacement_text := $new$  IF batch->>'kind' IS DISTINCT FROM 'ack' OR batch->>'count' IS DISTINCT FROM '1'
    OR batch->>'duplicate' IS DISTINCT FROM 'false' THEN
   RAISE EXCEPTION 'U34_REPLACEMENT_NOT_APPLIED' USING errcode='23514';END IF;
  IF NOT EXISTS (SELECT 1 FROM public.training_session_occurrences_v1 r
   WHERE r.id=(batch#>>'{occurrences,0,id}')::uuid AND r.id<>occ.id
   AND r.client_id=occ.client_id AND r.session_id=occ.session_id
   AND r.batch_operation_id=batch_op AND r.batch_ordinal=1
   AND r.status='planificada' AND r.execution_id IS NULL AND r.revision=0
   AND r.prescription_revision=occ.prescription_revision
   AND r.prescription_snapshot=occ.prescription_snapshot
   AND r.duration_minutes=occ.duration_minutes) THEN
   RAISE EXCEPTION 'U34_REPLACEMENT_PRESCRIPTION_CHANGED' USING errcode='23514';END IF;
$new$;
 old_count := (length(body)-length(replace(body,anchor_text,'')))/length(anchor_text);
 IF old_count<>1 THEN RAISE EXCEPTION 'U34_PRESCRIPTION_ANCHOR_3'; END IF;
 body := replace(body,anchor_text,replacement_text);
 anchor_text := $old$'reason','APPOINTMENT_ALREADY_TERMINAL');$old$;
 replacement_text := $new$'reason','APPOINTMENT_ALREADY_TERMINAL','operationId',op,'remoteRevision',occ.revision);$new$;
 old_count := (length(body)-length(replace(body,anchor_text,'')))/length(anchor_text);
 IF old_count<>1 THEN RAISE EXCEPTION 'U34_PRESCRIPTION_ANCHOR_4'; END IF;
 body := replace(body,anchor_text,replacement_text);
 anchor_text := $old$'reason','APPOINTMENT_REVISION_DRIFT');$old$;
 replacement_text := $new$'reason','APPOINTMENT_REVISION_DRIFT','operationId',op,'remoteRevision',occ.revision);$new$;
 old_count := (length(body)-length(replace(body,anchor_text,'')))/length(anchor_text);
 IF old_count<>1 THEN RAISE EXCEPTION 'U34_PRESCRIPTION_ANCHOR_5'; END IF;
 body := replace(body,anchor_text,replacement_text);
 IF md5(body) IS DISTINCT FROM 'e3a461a489803b1a7e3c0823bf72e965' THEN RAISE EXCEPTION 'U34_PRESCRIPTION_CANDIDATE_DRIFT'; END IF;
 EXECUTE body;
 IF md5(pg_get_functiondef(fn)) IS DISTINCT FROM 'e3a461a489803b1a7e3c0823bf72e965' OR NOT EXISTS (
  SELECT 1 FROM pg_proc WHERE oid=fn AND proacl IS NOT DISTINCT FROM old_acl AND proowner=old_owner
 ) THEN RAISE EXCEPTION 'U34_PRESCRIPTION_INSTALL_UNVERIFIED'; END IF;
END $guard$;
COMMIT;
