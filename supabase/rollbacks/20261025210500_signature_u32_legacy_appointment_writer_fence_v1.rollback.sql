-- U32 legacy appointment writer fence controlled rollback.
-- Never remove a cross-writer guard while dated live occurrences remain,
-- otherwise legacy CITA_CREAR can silently overlap existing Client workouts.
BEGIN;
SET LOCAL lock_timeout='1500ms';
SELECT 1 / CASE WHEN NOT EXISTS(
  SELECT 1 FROM public.training_session_occurrences_v1
  WHERE status<>'cancelada' AND starts_at IS NOT NULL
) THEN 1 ELSE 0 END AS u32_fence_rollback_requires_no_active_timed_occurrences;
DROP TRIGGER u32_appointment_writer_fence ON public.appointments;
DROP FUNCTION private.iberfit_u32_appointment_writer_fence_v1();
COMMIT;
