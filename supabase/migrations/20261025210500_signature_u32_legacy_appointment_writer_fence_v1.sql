-- SIGNATURE U32 · stage cooperative scheduling lock for legacy appointment
-- writers. No change to v26 command handler or current appointment rows.
-- Requires U30 occurrence table and U32 batch function; do not ship alone.
SELECT 1 / CASE WHEN to_regclass('public.training_session_occurrences_v1') IS NOT NULL
 AND to_regprocedure('private.iberfit_u32_create_occurrences_batch_v1(jsonb)') IS NOT NULL
 THEN 1 ELSE 0 END AS u32_writer_fence_prerequisite;

CREATE FUNCTION private.iberfit_u32_appointment_writer_fence_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fence$
BEGIN
  -- The existing CITA_CREAR and CITA_REPROGRAMAR path writes this typed table
  -- via iberfit_persist_entity_v26_rc29. Serialize with all new U32 batches.
  IF NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'U32_APPOINTMENT_OWNER_REQUIRED'
      USING errcode='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'U32_APPOINTMENT_CLIENT_TRANSFER_FORBIDDEN'
      USING errcode='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('schedule_client:'||NEW.client_id::text,0));
  IF NEW.status='cancelada' THEN
    RETURN NEW;
  END IF;

  -- Existing legacy behaviour remains unchanged if there is no new active
  -- U30 occurrence at the target time. Preserve a legitimate appointment
  -- for the SAME source and exact time (either already linked or not yet
  -- linked) but never permit a second active duplicate to claim that slot.
  IF EXISTS(
    SELECT 1 FROM public.training_session_occurrences_v1 o
    WHERE o.client_id=NEW.client_id
      AND o.status<>'cancelada'
      AND o.starts_at IS NOT NULL AND o.ends_at IS NOT NULL
      AND o.starts_at<NEW.end_at AND o.ends_at>NEW.start_at
      AND NOT (
        o.session_id=NEW.session_id
        AND o.starts_at=NEW.start_at
        AND o.ends_at=NEW.end_at
        AND (
          o.appointment_id=NEW.id
          OR (o.appointment_id IS NULL AND NOT EXISTS(
            SELECT 1 FROM public.appointments other
            WHERE other.id<>NEW.id
              AND other.client_id=NEW.client_id
              AND other.session_id=NEW.session_id
              AND other.start_at=NEW.start_at AND other.end_at=NEW.end_at
              AND other.status<>'cancelada'
          ))
        )
      )
  ) THEN
    RAISE EXCEPTION 'U32_OCCURRENCE_APPOINTMENT_TIME_CONFLICT'
      USING errcode='23P01';
  END IF;
  RETURN NEW;
END;
$fence$;

REVOKE ALL ON FUNCTION private.iberfit_u32_appointment_writer_fence_v1()
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER u32_appointment_writer_fence
 BEFORE INSERT OR UPDATE OF client_id,session_id,start_at,end_at,status
 ON public.appointments FOR EACH ROW
 EXECUTE FUNCTION private.iberfit_u32_appointment_writer_fence_v1();

COMMENT ON FUNCTION private.iberfit_u32_appointment_writer_fence_v1()
IS 'SIGNATURE U32 STAGING. Serialize legacy appointments with U32 batch dates; reject overlap with other active occurrences, preserve exact own-source appointment.';
