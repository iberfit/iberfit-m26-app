-- SIGNATURE U30 · independent dated occurrences (data foundation only).
-- DEPENDENCY: verified same-client FK from PR #1072 must already be installed.
-- Fail closed: no silent grants, no generation of occurrences, no command switch.
-- This file must not be promoted before separate backend lifecycle/RLS QA.
--
-- A prescription is NOT an occurrence. One dated occurrence may bind a
-- confirmed appointment and eventually a unique execution, while its source
-- snapshot stays frozen even if the Coach revises the prescription later.

SELECT 1 / CASE WHEN EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.appointments'::regclass
    AND conname='appointments_session_client_signature_v1_fkey'
    AND convalidated
) AND EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.sessions'::regclass
    AND conname='sessions_id_client_id_signature_v1_key'
) THEN 1 ELSE 0 END AS u30_same_client_prerequisite;

-- Preserve all legacy appointment IDs and nullable session semantics. The
-- exact triple prevents binding a different session of the same Client.
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_id_client_session_u30_key
  UNIQUE (id,client_id,session_id);

CREATE TABLE public.training_session_occurrences_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  session_id uuid NOT NULL,
  appointment_id uuid,
  local_date date NOT NULL,
  local_time time(0) without time zone,
  time_zone text NOT NULL DEFAULT 'America/Santiago',
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer NOT NULL,
  prescription_revision bigint NOT NULL,
  prescription_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'planificada',
  revision bigint NOT NULL DEFAULT 0,
  created_operation_id uuid NOT NULL UNIQUE,
  start_operation_id uuid UNIQUE,
  close_operation_id uuid UNIQUE,
  execution_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT u30_session_same_client_fk
    FOREIGN KEY (session_id,client_id)
    REFERENCES public.sessions(id,client_id)
    ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT u30_appointment_same_session_client_fk
    FOREIGN KEY (appointment_id,client_id,session_id)
    REFERENCES public.appointments(id,client_id,session_id)
    MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL (appointment_id),
  CONSTRAINT u30_local_zone_check CHECK (time_zone='America/Santiago'),
  CONSTRAINT u30_duration_check CHECK (duration_minutes BETWEEN 10 AND 240),
  CONSTRAINT u30_source_revision_check CHECK (prescription_revision>=0),
  CONSTRAINT u30_occurrence_revision_check CHECK (revision>=0),
  CONSTRAINT u30_snapshot_object_check
    CHECK (jsonb_typeof(prescription_snapshot)='object'),
  CONSTRAINT u30_occurrence_status_check
    CHECK (status IN ('planificada','confirmada','en_curso','completada','cancelada')),
  CONSTRAINT u30_clock_consistency_check
    CHECK (
      (local_time IS NULL AND starts_at IS NULL AND ends_at IS NULL)
      OR (
        local_time IS NOT NULL AND starts_at IS NOT NULL AND ends_at IS NOT NULL
        AND ends_at>starts_at
        AND (starts_at AT TIME ZONE time_zone)::date=local_date
        AND (starts_at AT TIME ZONE time_zone)::time(0)=local_time
        AND ends_at-starts_at=duration_minutes*interval '1 minute'
      )
    ),
  CONSTRAINT u30_occurrence_composite_identity UNIQUE (id,client_id,session_id),
  CONSTRAINT u30_session_one_occurrence_per_local_day UNIQUE (session_id,local_date)
);

-- IBERFIT-TABLE-ACCESS: public.training_session_occurrences_v1 :: Only trusted server-side reads of staged occurrence snapshots; never expose Client or Coach table access.
-- IBERFIT-POLICY: public.training_session_occurrences_v1 = service-role-only
-- Client calendar reads are not enabled yet. Bootstrap / HTTP projection must
-- explicitly whitelist safe per-role fields in the follow-up lifecycle PR.
ALTER TABLE public.training_session_occurrences_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.training_session_occurrences_v1
  FROM PUBLIC,anon,authenticated,service_role;
-- Server role receives only SELECT, not direct mutation. Future commands use
-- an explicitly reviewed privileged write boundary, never Client DML.
GRANT SELECT ON TABLE public.training_session_occurrences_v1 TO service_role;

-- An already-created occurrence is always tied to the original prescription
-- snapshot: changing source identity/history in-place is forbidden.
CREATE FUNCTION public.iberfit_u30_occurrence_snapshot_guard_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $u30$
DECLARE
  v_fk_unlink_only boolean;
BEGIN
  -- A PostgreSQL FK ON DELETE SET NULL(appointment_id) must retain the
  -- occurrence/history even after the parent appointment is deleted.
  v_fk_unlink_only := OLD.appointment_id IS NOT NULL
    AND NEW.appointment_id IS NULL
    AND (to_jsonb(NEW)-'appointment_id')=(to_jsonb(OLD)-'appointment_id');

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.session_id IS DISTINCT FROM OLD.session_id
    OR NEW.created_operation_id IS DISTINCT FROM OLD.created_operation_id
    OR NEW.prescription_revision IS DISTINCT FROM OLD.prescription_revision
    OR NEW.prescription_snapshot IS DISTINCT FROM OLD.prescription_snapshot THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_SOURCE_IMMUTABLE' USING errcode='23514';
  END IF;
  IF OLD.status IN ('completada','cancelada') AND NOT v_fk_unlink_only THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_TERMINAL_IMMUTABLE' USING errcode='23514';
  END IF;
  IF OLD.status='en_curso' AND (
    NEW.local_date IS DISTINCT FROM OLD.local_date
    OR NEW.local_time IS DISTINCT FROM OLD.local_time
    OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
    OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
    OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
    OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
  ) AND NOT v_fk_unlink_only THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_ACTIVE_SCHEDULE_LOCKED' USING errcode='23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='planificada' AND NEW.status IN ('confirmada','cancelada'))
    OR (OLD.status='confirmada' AND NEW.status IN ('en_curso','cancelada'))
    OR (OLD.status='en_curso' AND NEW.status='completada')
  ) THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_TRANSITION_FORBIDDEN' USING errcode='23514';
  END IF;
  IF OLD.execution_id IS NOT NULL
    AND NEW.execution_id IS DISTINCT FROM OLD.execution_id THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_EXECUTION_IMMUTABLE' USING errcode='23514';
  END IF;
  IF OLD.execution_id IS NULL AND NEW.execution_id IS NOT NULL
    AND NOT (OLD.status='confirmada' AND NEW.status='en_curso') THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_EXECUTION_BIND_FORBIDDEN' USING errcode='23514';
  END IF;
  IF NEW.status IN ('en_curso','completada') AND NEW.execution_id IS NULL THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_EXECUTION_REQUIRED' USING errcode='23514';
  END IF;
  IF NEW.status='en_curso' AND NEW.start_operation_id IS NULL THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_START_OPERATION_REQUIRED' USING errcode='23514';
  END IF;
  IF NEW.status='completada' AND NEW.close_operation_id IS NULL THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_CLOSE_OPERATION_REQUIRED' USING errcode='23514';
  END IF;
  IF OLD.start_operation_id IS NOT NULL
    AND NEW.start_operation_id IS DISTINCT FROM OLD.start_operation_id THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_START_OPERATION_IMMUTABLE' USING errcode='23514';
  END IF;
  IF OLD.close_operation_id IS NOT NULL
    AND NEW.close_operation_id IS DISTINCT FROM OLD.close_operation_id THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_CLOSE_OPERATION_IMMUTABLE' USING errcode='23514';
  END IF;
  -- This enforces monotone server-side transitions. The future command must
  -- additionally perform CAS in its UPDATE ... WHERE revision=expected.
  IF NOT v_fk_unlink_only AND NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'U30_OCCURRENCE_REVISION_CAS_REQUIRED' USING errcode='23514';
  END IF;
  RETURN NEW;
END;
$u30$;

REVOKE ALL ON FUNCTION public.iberfit_u30_occurrence_snapshot_guard_v1()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER u30_occurrence_source_protected
  BEFORE UPDATE ON public.training_session_occurrences_v1
  FOR EACH ROW EXECUTE FUNCTION public.iberfit_u30_occurrence_snapshot_guard_v1();

-- The mirror is nullable for ALL historical executions. Cross-Client and
-- cross-session IDs cannot be attached, even through a privileged write.
ALTER TABLE public.session_executions
  ADD COLUMN occurrence_id uuid;
ALTER TABLE public.session_executions
  ADD CONSTRAINT u30_execution_occurrence_client_session_fk
  FOREIGN KEY (occurrence_id,client_id,session_id)
  REFERENCES public.training_session_occurrences_v1(id,client_id,session_id)
  MATCH SIMPLE ON UPDATE NO ACTION ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.session_executions
  VALIDATE CONSTRAINT u30_execution_occurrence_client_session_fk;
CREATE UNIQUE INDEX u30_execution_one_per_occurrence
  ON public.session_executions(occurrence_id)
  WHERE occurrence_id IS NOT NULL;
CREATE INDEX u30_occurrence_client_calendar
  ON public.training_session_occurrences_v1(client_id,local_date,status);

COMMENT ON TABLE public.training_session_occurrences_v1 IS
  'SIGNATURE U30 staging only. Backend commands/projection not activated. Each occurrence references a frozen prescription revision; completion must never consume another date.';
