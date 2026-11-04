-- IBERFIT U60: STAGED ONLY. Depends on reconciled U30-U36 source and QA ledger.
-- Deliberately no EXECUTE grants to anon/authenticated/service_role.
-- Do not apply to QA before comparing installed U30-U36 definitions and migrations.
SELECT 1 / CASE WHEN
  to_regclass('public.training_session_occurrences_v1') IS NOT NULL
  AND to_regclass('public.active_execution_locks_v26') IS NOT NULL
  AND to_regprocedure('private.iberfit_u31_occurrence_transition_v1(jsonb)') IS NOT NULL
  AND to_regprocedure('private.iberfit_u32_create_occurrences_batch_v1(jsonb)') IS NOT NULL
  AND to_regprocedure('public.iberfit_occurrence_api_v1(text,jsonb)') IS NOT NULL
THEN 1 ELSE 0 END AS u60_staging_dependency_guard;

-- Abort before DDL when provenance, owner/ACL, RLS, FK, triggers or old
-- execution serialization are not exactly the audited QA source. In
-- particular never install U60 over U30-U36 objects absent from the official
-- migration ledger; reconcile the ledger independently and reversibly first.
WITH expected(schema_name,function_name,body_sha256,definer,volatility) AS (
  VALUES ('public','iberfit_u30_occurrence_snapshot_guard_v1','215983b16b5c505255039bf5c9ef7b88a00b794f82a1a05488214d2180ff8528',false,'v'),
    ('private','iberfit_u31_occurrence_transition_v1','51c557cec4475edb707ccc006039d6ed5e3fff18f25014d9da21792b4a694230',true,'v'),
    ('private','iberfit_u32_build_execution_queue_v1','5cc253a1e4f94343befa1c18fab32f4f9df867b3aac29156fbd01624c2ebac9d',false,'i'),
    ('private','iberfit_u32_create_occurrences_batch_v1','100c1e8b8b9c711d3c5af66cd94ef17cbf310b631251eae7a1a872a5130b4566',true,'v'),
    ('private','iberfit_u32_appointment_writer_fence_v1','0d770b08e09f54b9fc01c2fafc0624e4e2df14a2df13ced8f3c3172f020dffa9',true,'v'),
    ('private','iberfit_u33_occurrence_calendar_v1','c3e2b899b1fd547a8a661b3dbb7515b617f3c136c1058c638af234464fb4c086',true,'s'),
    ('private','iberfit_u34_coach_occurrence_change_v1','e10585eed0526472763410944b0baa149c2e660de0a25ff069f6abd0042f1015',true,'v'),
    ('public','iberfit_occurrence_api_v1','ce048ae054b3787f1bb289fe3673ea9eb1cdb6154f568f6bdb2d40d236379253',true,'v')
), physical AS (
  SELECT e.*,
    p.oid IS NOT NULL AS found,
    (p.oid IS NOT NULL AND
      encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=e.body_sha256
      AND p.prosecdef=e.definer AND p.provolatile=e.volatility
      AND p.proconfig @> ARRAY['search_path=""']::text[]
      AND pg_get_userbyid(p.proowner)='postgres'
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
    ) AS verified
  FROM expected e
  LEFT JOIN pg_namespace n ON n.nspname=e.schema_name
  LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=e.function_name
), flags AS (
 SELECT
   (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('20261025182000','20261025194000','20261025203500','20261025210500','20261025223000','20261025231500','20261025235500'))::integer AS ledger_rows,
   (SELECT count(*) FROM physical WHERE verified)::integer AS verified_functions,
   (SELECT count(*) FROM physical WHERE NOT verified)::integer AS drifted_functions,
   (SELECT coalesce(jsonb_agg(schema_name||'.'||function_name ORDER BY function_name),'[]'::jsonb)
      FROM physical WHERE NOT verified) AS drift_names,
   (SELECT count(*)=8 FROM physical) AS signature_count_ok,
   (
     SELECT c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT')
       AND NOT has_table_privilege('authenticated',c.oid,'SELECT')
       AND has_table_privilege('service_role',c.oid,'SELECT')
     FROM pg_class c WHERE c.oid=to_regclass('public.training_session_occurrences_v1')
   ) AS table_private,
   (SELECT count(*)=3 FROM pg_constraint c WHERE c.convalidated AND c.contype='f'
       AND ((c.conname='appointments_session_client_signature_v1_fkey'
          AND c.conrelid=to_regclass('public.appointments')
          AND c.confrelid=to_regclass('public.sessions'))
         OR (c.conname='u30_appointment_same_session_client_fk'
          AND c.conrelid=to_regclass('public.training_session_occurrences_v1')
          AND c.confrelid=to_regclass('public.appointments'))
         OR (c.conname='u30_session_same_client_fk'
          AND c.conrelid=to_regclass('public.training_session_occurrences_v1')
          AND c.confrelid=to_regclass('public.sessions')))) AS same_client_fk,
   EXISTS(SELECT 1 FROM pg_constraint c WHERE c.convalidated AND c.contype='f'
       AND c.conname='u30_execution_occurrence_client_session_fk'
       AND c.conrelid=to_regclass('public.session_executions')
       AND c.confrelid=to_regclass('public.training_session_occurrences_v1')) AS execution_fk,
   (SELECT count(*)=2 FROM pg_trigger t
      WHERE NOT t.tgisinternal AND (
        (t.tgname='u30_occurrence_source_protected'
          AND t.tgrelid=to_regclass('public.training_session_occurrences_v1')
          AND t.tgfoid=to_regprocedure('public.iberfit_u30_occurrence_snapshot_guard_v1()'))
        OR (t.tgname='u32_appointment_writer_fence'
          AND t.tgrelid=to_regclass('public.appointments')
          AND t.tgfoid=to_regprocedure('private.iberfit_u32_appointment_writer_fence_v1()'))
      )) AS source_triggers_count,
   (SELECT count(*)=2 FROM pg_index ix
     WHERE ix.indisunique AND (
       (ix.indexrelid=to_regclass('public.u30_session_one_active_occurrence_per_local_day')
          AND ix.indrelid=to_regclass('public.training_session_occurrences_v1')
          AND pg_get_expr(ix.indpred,ix.indrelid) LIKE '%status%cancelada%')
       OR (ix.indexrelid=to_regclass('public.u30_execution_one_per_occurrence')
          AND ix.indrelid=to_regclass('public.session_executions')
          AND pg_get_expr(ix.indpred,ix.indrelid) LIKE '%occurrence_id%NOT NULL%')
     )) AS unique_index_guards,
   (SELECT count(*)=4 FROM (
      VALUES
        ('public.iberfit_execute_command_v26(jsonb)',
         '8a4800de487ef9f0babc51662e152fa0318cd56dd341e5b376fccda99ab5bea7',true),
        ('public.iberfit_execute_command_v26_rc29(jsonb)',
         '5a157b889f720157223b625c7bb1314278ce506fff7cb4d06d29e88db17f1bd8',false),
        ('public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)',
         '78bf27593b1e6f4277c73bacf04329eb21a0354f40557249d630df6a3da8bd9e',false),
        ('public.iberfit_persist_entity_v26_rc29(text,uuid,uuid,text,bigint,jsonb)',
         'd436dd82a48644ce8701aa797b1323ebafe9b2b1dbde36872cd83c170374a9e9',false)
      ) req(signature,body_sha256,auth_exec)
      JOIN pg_proc p ON p.oid=to_regprocedure(req.signature)
      WHERE encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=req.body_sha256
        AND pg_get_userbyid(p.proowner)='postgres'
        AND p.prosecdef
        AND p.proconfig @> ARRAY['search_path=""']::text[]
        AND has_function_privilege('authenticated',p.oid,'EXECUTE')=req.auth_exec
        AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
   ) AS legacy_write_chain_fingerprints,
   (to_regclass('public.command_receipts_v26') IS NOT NULL
      AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.command_receipts_v26')
         AND contype='p' AND conname='command_receipts_v26_pkey')
      AND to_regclass('public.command_receipts_v26_entity_idx') IS NOT NULL
      AND (SELECT count(*)=10 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='command_receipts_v26'
             AND is_nullable='NO')
   ) AS receipt_schema_ready,
   (SELECT p.prosrc LIKE '%active_execution_client:%' FROM pg_proc p
      WHERE p.oid=to_regprocedure('public.iberfit_execute_command_v26_rc29(jsonb)')) AS legacy_lock_shared
)

SELECT 1 / CASE WHEN coalesce((ledger_rows=7 AND verified_functions=8 AND drifted_functions=0 AND signature_count_ok AND table_private AND same_client_fk AND execution_fk AND source_triggers_count AND unique_index_guards AND legacy_write_chain_fingerprints AND receipt_schema_ready AND legacy_lock_shared),false) THEN 1 ELSE 0 END
 AS u60_reconciliation_required_before_schema_changes FROM flags;

-- The dated read returns an explicit allowlist. Never return publishedSnapshot,
-- a raw domain_entities row, receipts, or unscoped Coach/private fields.
CREATE FUNCTION private.iberfit_u60_occurrence_detail_v1(
  p_client_id uuid,p_occurrence_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $u60_read$
DECLARE
  v_role text;
  v_occ public.training_session_occurrences_v1%rowtype;
  v_source public.domain_entities_v26%rowtype;
  v_execution public.domain_entities_v26%rowtype;
  v_typed public.session_executions%rowtype;
  v_ap_status text;
  v_ap public.appointments%rowtype;
  v_snapshot jsonb;
  v_execution_snapshot jsonb;
  v_execution_body jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501';
  END IF;
  IF p_client_id IS NULL OR p_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'U60_READ_IDENTIFIERS_REQUIRED' USING errcode='22023';
  END IF;
  v_role:=public.iberfit_current_role_v26();
  IF v_role NOT IN ('coach','cliente')
    OR NOT public.iberfit_can_access_client_v26(p_client_id)
    OR NOT public.iberfit_canary_enabled_v26(p_client_id) THEN
    RAISE EXCEPTION 'CLIENT_ACCESS_DENIED' USING errcode='42501';
  END IF;
  SELECT * INTO v_occ FROM public.training_session_occurrences_v1
    WHERE id=p_occurrence_id AND client_id=p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'U60_OCCURRENCE_NOT_FOUND' USING errcode='42501';
  END IF;
  SELECT * INTO v_source FROM public.domain_entities_v26
    WHERE entity_type='session' AND entity_id=v_occ.session_id
      AND client_id=v_occ.client_id AND status='disponible';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'U60_SOURCE_NOT_AVAILABLE' USING errcode='42501';
  END IF;
  IF v_occ.appointment_id IS NOT NULL THEN
    SELECT * INTO v_ap FROM public.appointments
      WHERE id=v_occ.appointment_id AND client_id=v_occ.client_id
        AND session_id=v_occ.session_id;
    IF NOT FOUND OR v_ap.start_at IS DISTINCT FROM v_occ.starts_at
      OR v_ap.end_at IS DISTINCT FROM v_occ.ends_at
      OR v_ap.time_zone IS DISTINCT FROM v_occ.time_zone
      OR (v_occ.starts_at AT TIME ZONE v_occ.time_zone)::date
        IS DISTINCT FROM v_occ.local_date
      OR (v_occ.starts_at AT TIME ZONE v_occ.time_zone)::time
        IS DISTINCT FROM v_occ.local_time THEN
      RAISE EXCEPTION 'U60_LINKED_APPOINTMENT_DRIFT' USING errcode='42501';
    END IF;
    v_ap_status:=v_ap.status;
  END IF;
  -- Match the Client visibility conditions of U33, including cancellation
  -- after an in-flight execution. No unpublished draft or unlinked read.
  IF v_role='cliente' AND (
    v_occ.status='planificada'
    OR v_occ.appointment_id IS NULL
    OR v_source.body->>'visibleToClient' IS DISTINCT FROM 'true'
    OR v_source.body->>'clientVisibilityLevel' IS DISTINCT FROM 'full'
    OR v_source.body->>'deliveryModality' IS DISTINCT FROM 'guiada_en_app'
    OR NOT (
      (v_occ.status='confirmada' AND v_ap_status='confirmada')
      OR (v_occ.status='en_curso' AND v_ap_status IN ('confirmada','cancelada'))
      OR (v_occ.status='completada' AND v_ap_status IN ('completada','cancelada','confirmada'))
      OR (v_occ.status='cancelada' AND v_ap_status IN ('confirmada','cancelada','completada'))
    )
  ) THEN
    RAISE EXCEPTION 'U60_CLIENT_DATE_NOT_PUBLISHED' USING errcode='42501';
  END IF;
  IF v_occ.prescription_snapshot->>'clientId' IS DISTINCT FROM v_occ.client_id::text
    OR v_occ.prescription_snapshot->>'sessionId' IS DISTINCT FROM v_occ.session_id::text
    OR jsonb_typeof(v_occ.prescription_snapshot->'queue') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_occ.prescription_snapshot->'blocks') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_occ.prescription_snapshot->'queue')=0
    OR jsonb_array_length(v_occ.prescription_snapshot->'blocks')=0 THEN
    RAISE EXCEPTION 'U60_SOURCE_SNAPSHOT_INVALID' USING errcode='42501';
  END IF;
  v_snapshot:=jsonb_build_object(
    'clientId',v_occ.client_id,'sessionId',v_occ.session_id,
    'cycleId',v_occ.prescription_snapshot->'cycleId',
    'title',v_occ.prescription_snapshot->'title',
    'queue',v_occ.prescription_snapshot->'queue',
    'blocks',v_occ.prescription_snapshot->'blocks'
  );
  v_execution_body:=NULL;
  IF v_occ.execution_id IS NULL THEN
    IF v_occ.status IN ('en_curso','completada') THEN
      RAISE EXCEPTION 'U60_EXECUTION_LINK_MISSING' USING errcode='42501';
    END IF;
  ELSE
    IF v_occ.status NOT IN ('en_curso','completada') THEN
      RAISE EXCEPTION 'U60_EXECUTION_STATUS_DRIFT' USING errcode='42501';
    END IF;
    SELECT * INTO v_execution FROM public.domain_entities_v26
      WHERE entity_type='session_execution'
        AND entity_id=v_occ.execution_id AND client_id=v_occ.client_id;
    SELECT * INTO v_typed FROM public.session_executions
      WHERE id=v_occ.execution_id AND client_id=v_occ.client_id
        AND session_id=v_occ.session_id AND occurrence_id=v_occ.id;
    IF v_execution.entity_id IS NULL OR v_typed.id IS NULL
      OR v_execution.status IS DISTINCT FROM v_occ.status
      OR v_typed.revision IS DISTINCT FROM v_execution.revision
      OR v_typed.summary IS DISTINCT FROM v_execution.body
      OR (v_occ.status='en_curso'
        AND v_typed.execution_status IS DISTINCT FROM 'activa')
      OR (v_occ.status='completada' AND (
        v_typed.execution_status IS DISTINCT FROM 'cerrada_confirmada'
        OR v_typed.remote_confirmed_at IS NULL))
      OR v_execution.body->>'occurrenceId' IS DISTINCT FROM v_occ.id::text
      OR v_execution.body->>'sessionId' IS DISTINCT FROM v_occ.session_id::text
      OR v_execution.body->>'clientId' IS DISTINCT FROM v_occ.client_id::text
      OR v_execution.body->'queue' IS DISTINCT FROM v_occ.prescription_snapshot->'queue'
      OR jsonb_typeof(v_execution.body->'sourceSnapshot') IS DISTINCT FROM 'object'
      OR v_execution.body#>'{sourceSnapshot,queue}' IS DISTINCT FROM v_occ.prescription_snapshot->'queue'
      OR v_execution.body#>'{sourceSnapshot,blocks}' IS DISTINCT FROM v_occ.prescription_snapshot->'blocks'
    THEN
      RAISE EXCEPTION 'U60_EXECUTION_INTEGRITY_DRIFT' USING errcode='42501';
    END IF;
    v_execution_snapshot:=jsonb_build_object(
      'clientId',v_occ.client_id,'sessionId',v_occ.session_id,
      'cycleId',v_execution.body#>'{sourceSnapshot,cycleId}',
      'title',v_execution.body#>'{sourceSnapshot,title}',
      'queue',v_execution.body#>'{sourceSnapshot,queue}',
      'blocks',v_execution.body#>'{sourceSnapshot,blocks}'
    );
    v_execution_body:=jsonb_build_object(
      'id',v_execution.entity_id,'clientId',v_occ.client_id,
      'sessionId',v_occ.session_id,'occurrenceId',v_occ.id,
      'status',v_execution.status,'revision',v_execution.revision,
      'startedAt',v_execution.body->'startedAt',
      'completedAt',v_execution.body->'completedAt',
      'sourceSnapshot',v_execution_snapshot,
      'queue',v_execution.body->'queue',
      'results',v_execution.body->'results',
      'skippedSets',v_execution.body->'skippedSets',
      'events',v_execution.body->'events',
      'feedback',v_execution.body->'feedback'
    );
  END IF;
  IF octet_length(v_snapshot::text)>524288
    OR octet_length(coalesce(v_execution_body,'{}'::jsonb)::text)>1048576 THEN
    RAISE EXCEPTION 'U60_PRIVATE_READ_SIZE_LIMIT' USING errcode='54000';
  END IF;
  RETURN jsonb_build_object(
    'kind','private-occurrence',
    'occurrence',jsonb_build_object(
      'id',v_occ.id,'clientId',v_occ.client_id,'sessionId',v_occ.session_id,
      'appointmentId',v_occ.appointment_id,'localDate',v_occ.local_date,
      'localTime',v_occ.local_time,'timeZone',v_occ.time_zone,
      'startsAt',v_occ.starts_at,'endsAt',v_occ.ends_at,
      'durationMinutes',v_occ.duration_minutes,'status',v_occ.status,
      'revision',v_occ.revision,'executionId',v_occ.execution_id),
    'prescriptionSnapshot',v_snapshot,'executionBody',v_execution_body);
END;
$u60_read$;
REVOKE ALL ON FUNCTION private.iberfit_u60_occurrence_detail_v1(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- Separate read-only public entrypoint. Still CLOSED in this migration.
CREATE FUNCTION public.iberfit_occurrence_detail_v1(
  p_client_id uuid,p_occurrence_id uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $u60_rpc$
  SELECT private.iberfit_u60_occurrence_detail_v1(p_client_id,p_occurrence_id);
$u60_rpc$;
REVOKE ALL ON FUNCTION public.iberfit_occurrence_detail_v1(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- The legacy executor and U31 share active_execution_client locking. New
-- typed execution inserts also serialize on schedule_client. Never accept a
-- legacy execution for a prescription that has EVER had a dated occurrence.
CREATE FUNCTION private.iberfit_u60_typed_execution_fence_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $u60_typed$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('schedule_client:'||NEW.client_id::text,0));
  IF NEW.occurrence_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.training_session_occurrences_v1 o
      WHERE o.id=NEW.occurrence_id AND o.client_id=NEW.client_id
        AND o.session_id=NEW.session_id AND o.status='confirmada'
        AND o.execution_id IS NULL
    ) THEN
      RAISE EXCEPTION 'U60_DATED_EXECUTION_SOURCE_INVALID' USING errcode='23514';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.training_session_occurrences_v1 o
    WHERE o.client_id=NEW.client_id AND o.session_id=NEW.session_id
  ) THEN
    RAISE EXCEPTION 'U60_LEGACY_EXECUTION_BLOCKED' USING errcode='23514';
  END IF;
  RETURN NEW;
END;
$u60_typed$;
REVOKE ALL ON FUNCTION private.iberfit_u60_typed_execution_fence_v1()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER u60_typed_execution_fence
  BEFORE INSERT ON public.session_executions FOR EACH ROW
  EXECUTE FUNCTION private.iberfit_u60_typed_execution_fence_v1();

-- Defense in depth when a caller attempts to acquire an active lock without
-- writing a typed execution. U31 legitimately binds an occurrence first.
CREATE FUNCTION private.iberfit_u60_active_lock_fence_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $u60_lock$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('schedule_client:'||NEW.client_id::text,0));
  IF EXISTS (
    SELECT 1 FROM public.training_session_occurrences_v1 o
    WHERE o.client_id=NEW.client_id AND o.session_id=NEW.session_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.session_executions e
    JOIN public.training_session_occurrences_v1 o
      ON o.id=e.occurrence_id AND o.client_id=e.client_id
        AND o.session_id=e.session_id
    WHERE e.id=NEW.execution_id AND e.client_id=NEW.client_id
      AND e.session_id=NEW.session_id AND o.status='confirmada'
  ) THEN
    RAISE EXCEPTION 'U60_LEGACY_ACTIVE_LOCK_BLOCKED' USING errcode='23514';
  END IF;
  RETURN NEW;
END;
$u60_lock$;
REVOKE ALL ON FUNCTION private.iberfit_u60_active_lock_fence_v1()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER u60_active_lock_fence
  BEFORE INSERT ON public.active_execution_locks_v26 FOR EACH ROW
  EXECUTE FUNCTION private.iberfit_u60_active_lock_fence_v1();


-- U60 dated UPDATE boundary. Legacy V26's upsert-on-conflict can UPDATE
-- session_executions, not only INSERT it. Without these two triggers it could
-- mutate a U31-owned execution after the initial dated start. No direct role
-- grants; receipt verification runs at transaction COMMIT, after U31 journals.
CREATE FUNCTION private.iberfit_u60_dated_execution_identity_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $u60_update_identity$
BEGIN
  -- Historical legacy executions remain unaffected. Dated ownership is an
  -- irreversible binding, including when a legacy writer attempts rebind.
  IF OLD.occurrence_id IS NULL AND NEW.occurrence_id IS NULL THEN RETURN NEW;END IF;
  IF OLD.occurrence_id IS NULL OR
    NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id OR
    NEW.id IS DISTINCT FROM OLD.id OR
    NEW.client_id IS DISTINCT FROM OLD.client_id OR
    NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'U60_DATED_EXECUTION_IDENTITY_IMMUTABLE' USING errcode='23514';
  END IF;
  IF NEW.revision IS DISTINCT FROM OLD.revision+1 OR
    NEW.summary->>'id' IS DISTINCT FROM NEW.id::text OR
    NEW.summary->>'clientId' IS DISTINCT FROM NEW.client_id::text OR
    NEW.summary->>'sessionId' IS DISTINCT FROM NEW.session_id::text OR
    NEW.summary->>'occurrenceId' IS DISTINCT FROM NEW.occurrence_id::text OR
    NEW.summary->>'revision' IS DISTINCT FROM NEW.revision::text THEN
    RAISE EXCEPTION 'U60_DATED_EXECUTION_REVISION_OR_SCOPE_DRIFT'
      USING errcode='23514';
  END IF;
  RETURN NEW;
END;
$u60_update_identity$;
REVOKE ALL ON FUNCTION private.iberfit_u60_dated_execution_identity_guard_v1()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER u60_dated_execution_update_identity
  BEFORE UPDATE ON public.session_executions FOR EACH ROW
  EXECUTE FUNCTION private.iberfit_u60_dated_execution_identity_guard_v1();

-- A deferred constraint is essential: U31 inserts its idempotent receipt
-- AFTER the mirrored UPDATE. At COMMIT the exact actor, client, occurrence,
-- execution, revision, command and status must all match an in-transaction
-- U31 receipt. A V26 update cannot manufacture that private receipt.
CREATE FUNCTION private.iberfit_u60_dated_mirror_receipt_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $u60_update_receipt$
BEGIN
  IF NEW.occurrence_id IS NULL THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.command_receipts_v26 r
    WHERE r.entity_type='training_occurrence'
      AND r.entity_id=NEW.occurrence_id AND r.client_id=NEW.client_id
      AND r.actor_user_id=auth.uid()
      AND r.response->>'executionId'=NEW.id::text
      AND r.response->>'executionRevision'=NEW.revision::text
      AND r.response->>'kind'='ack'
      AND r.processed_at >= transaction_timestamp()
      AND (
        (r.command_type='OCURRENCIA_GUARDAR_PROGRESO'
          AND r.response->>'status'='en_curso'
          AND NEW.execution_status='activa'
          AND NEW.summary->>'status'='en_curso')
        OR
        (r.command_type='OCURRENCIA_COMPLETAR'
          AND r.response->>'status'='completada'
          AND NEW.execution_status='cerrada_confirmada'
          AND NEW.summary->>'status'='completada')
      )
  ) THEN
    RAISE EXCEPTION 'U60_DATED_EXECUTION_UPDATE_REQUIRES_U31_RECEIPT'
      USING errcode='23514';
  END IF;
  RETURN NEW;
END;
$u60_update_receipt$;
REVOKE ALL ON FUNCTION private.iberfit_u60_dated_mirror_receipt_guard_v1()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER u60_dated_execution_update_receipt
  AFTER UPDATE ON public.session_executions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION private.iberfit_u60_dated_mirror_receipt_guard_v1();

-- A Coach cannot introduce dates for a session still executing through the
-- legacy runtime. U32 already holds schedule_client before INSERT.
CREATE FUNCTION private.iberfit_u60_occurrence_insert_fence_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $u60_occ$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('schedule_client:'||NEW.client_id::text,0));
  IF EXISTS (
    SELECT 1 FROM public.active_execution_locks_v26 l
    LEFT JOIN public.session_executions e ON e.id=l.execution_id
      AND e.client_id=l.client_id AND e.session_id=l.session_id
    WHERE l.client_id=NEW.client_id AND l.session_id=NEW.session_id
      AND e.occurrence_id IS NULL
  ) THEN
    RAISE EXCEPTION 'U60_LEGACY_EXECUTION_ALREADY_ACTIVE' USING errcode='23514';
  END IF;
  RETURN NEW;
END;
$u60_occ$;
REVOKE ALL ON FUNCTION private.iberfit_u60_occurrence_insert_fence_v1()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER u60_occurrence_insert_fence
  BEFORE INSERT ON public.training_session_occurrences_v1 FOR EACH ROW
  EXECUTE FUNCTION private.iberfit_u60_occurrence_insert_fence_v1();

COMMENT ON FUNCTION public.iberfit_occurrence_detail_v1(uuid,uuid)
IS 'U60 STAGED CLOSED: owner-scoped private read; no authenticated EXECUTE until QA drift reconciliation, cross-role tests and rollback certified.';
COMMENT ON FUNCTION private.iberfit_u60_typed_execution_fence_v1()
IS 'U60 legacy writer fence: DATE occurrence uses typed occurrence_id; old session start must not consume a prescription with dated history.';
