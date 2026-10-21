-- SIGNATURE · invariant: a dated appointment can link only a session
-- prescribed to the same Client. This protects all backend write paths,
-- not just the Coach selector or a UI projection.
--
-- Verified 2026-10-20, QA and PROD (read-only):
-- sessions.id is UUID PK; sessions.client_id UUID NOT NULL.
-- appointments.session_id UUID NULL, client_id UUID NOT NULL.
-- Existing appointments_session_id_fkey: ON DELETE SET NULL.
-- Existing mismatch counts: QA=0, PROD=0.
--
-- Prerequisite for multi-date occurrences, NOT an implementation of
-- per-occurrence execution. Do not mark recurring workouts as enabled
-- until their independent execution and idempotency contracts are ready.
--
-- Fail closed against any concurrent or previously invalid link. This
-- migration must NOT update or delete existing appointment/client data.
DO $signature_scope_check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.appointments AS a
    INNER JOIN public.sessions AS s ON s.id=a.session_id
    WHERE a.client_id IS DISTINCT FROM s.client_id
  ) THEN
    RAISE EXCEPTION 'SIGNATURE_APPOINTMENT_SESSION_CLIENT_SCOPE_MISMATCH'
      USING ERRCODE='23514';
  END IF;
END
$signature_scope_check$;

-- PostgreSQL FK targets must have a unique key on the exact pair.
-- Retain sessions(id) as the existing primary key for all old callers.
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_id_client_id_signature_v1_key
  UNIQUE (id, client_id);

-- Preserve existing nullable appointment.session_id semantics when a
-- session is deleted. Crucially, only session_id becomes NULL:
-- appointment.client_id is non-null and must NOT be cleared on delete.
-- MATCH SIMPLE permits appointments without an associated session.
-- Leave the previous session_id FK intact to preserve old contracts.
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_session_client_signature_v1_fkey
  FOREIGN KEY (session_id, client_id)
  REFERENCES public.sessions (id, client_id)
  MATCH SIMPLE
  ON UPDATE NO ACTION
  ON DELETE SET NULL (session_id)
  NOT VALID;

-- No backfill and no silent repair. Validate all existing links.
ALTER TABLE public.appointments
  VALIDATE CONSTRAINT appointments_session_client_signature_v1_fkey;
