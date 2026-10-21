-- SIGNATURE U28 / #1064 · ownership foundation for dated training occurrences.
-- Additive only. No UPDATE/DELETE of customer rows, no changes to RLS/Auth or commands.
-- Preserves legacy ON DELETE SET NULL for appointments (only session_id) and
-- ON DELETE CASCADE for execution history. Fails closed on schema/data drift.
-- Tested data baseline (2026-10-20): QA + PROD zero cross-client links.
--
-- Rollback, only after verifying no downstream FK depends on this new key:
--   ALTER TABLE public.appointments DROP CONSTRAINT appointments_session_client_integrity_u28_fkey;
--   ALTER TABLE public.session_executions DROP CONSTRAINT session_executions_session_client_integrity_u28_fkey;
--   ALTER TABLE public.sessions DROP CONSTRAINT sessions_id_client_integrity_u28_key;

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Plain SELECT guards are mandatory: the production data-safety gate correctly
-- rejects anonymous DO blocks even when they only contain RAISE EXCEPTION.
SELECT 1 / (CASE WHEN current_setting('server_version_num')::integer >= 150000
  THEN 1 ELSE 0 END) AS u28_postgres_version_guard;

SELECT 1 / (CASE WHEN to_regclass('public.sessions') IS NOT NULL
  AND to_regclass('public.appointments') IS NOT NULL
  AND to_regclass('public.session_executions') IS NOT NULL
  THEN 1 ELSE 0 END) AS u28_required_tables_guard;

SELECT 1 / (CASE WHEN EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.appointments'::regclass
    AND conname='appointments_session_id_fkey'
    AND contype='f'
    AND pg_get_constraintdef(oid) LIKE '%ON DELETE SET NULL%'
) AND EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.session_executions'::regclass
    AND conname='session_executions_session_id_fkey'
    AND contype='f'
    AND pg_get_constraintdef(oid) LIKE '%ON DELETE CASCADE%'
) THEN 1 ELSE 0 END) AS u28_legacy_delete_semantics_guard;

SELECT 1 / (CASE WHEN NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE connamespace='public'::regnamespace
    AND conname IN (
      'sessions_id_client_integrity_u28_key',
      'appointments_session_client_integrity_u28_fkey',
      'session_executions_session_client_integrity_u28_fkey'
    )
) THEN 1 ELSE 0 END) AS u28_existing_constraints_guard;

SELECT 1 / (CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.appointments a
  JOIN public.sessions s ON s.id=a.session_id
  WHERE a.client_id IS DISTINCT FROM s.client_id
) AND NOT EXISTS (
  SELECT 1 FROM public.session_executions e
  JOIN public.sessions s ON s.id=e.session_id
  WHERE e.client_id IS DISTINCT FROM s.client_id
) THEN 1 ELSE 0 END) AS u28_cross_client_data_guard;


-- PostgreSQL requires the referenced pair to be unique, even though id alone
-- already is a primary key. Keep PKs and all existing FKs untouched.
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_id_client_integrity_u28_key UNIQUE (id, client_id);

-- MATCH SIMPLE permits existing session-less check-in/IRI appointments.
-- Column-scoped SET NULL preserves client_id NOT NULL and the old delete contract.
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_session_client_integrity_u28_fkey
  FOREIGN KEY (session_id, client_id)
  REFERENCES public.sessions (id, client_id)
  MATCH SIMPLE ON DELETE SET NULL (session_id) NOT VALID;

-- Closed execution rows retain their existing cascade rule; cross-client
-- combinations can never be inserted or reassigned, even via service_role.
ALTER TABLE public.session_executions
  ADD CONSTRAINT session_executions_session_client_integrity_u28_fkey
  FOREIGN KEY (session_id, client_id)
  REFERENCES public.sessions (id, client_id)
  MATCH SIMPLE ON DELETE CASCADE NOT VALID;

ALTER TABLE public.appointments
  VALIDATE CONSTRAINT appointments_session_client_integrity_u28_fkey;
ALTER TABLE public.session_executions
  VALIDATE CONSTRAINT session_executions_session_client_integrity_u28_fkey;

COMMENT ON CONSTRAINT appointments_session_client_integrity_u28_fkey
  ON public.appointments IS
  'SIGNATURE U28: an appointment may only link to a session belonging to the same client';
COMMENT ON CONSTRAINT session_executions_session_client_integrity_u28_fkey
  ON public.session_executions IS
  'SIGNATURE U28: execution ownership must match its prescribed session';

COMMIT;
