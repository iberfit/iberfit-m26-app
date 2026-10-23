-- SIGNATURE controlled rollback for
-- 20261021013000_signature_appointment_session_same_client_v1.sql
-- Remove only the constraints introduced by this migration.
-- Existing appointments_session_id_fkey and all data remain untouched.
-- Use only after an explicitly authorized rollback decision.
BEGIN;
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_session_client_signature_v1_fkey;
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_id_client_id_signature_v1_key;
COMMIT;
