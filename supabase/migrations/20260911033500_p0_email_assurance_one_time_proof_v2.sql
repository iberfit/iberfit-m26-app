-- IBERFIT P0 · email assurance one-time proof hardening
-- Preserve every consumed OTP session as an immutable one-time proof.
-- This allows a new OTP on the same password session while making replay of the same OTP session fail closed.

alter table public.iberfit_email_privileged_assurance_v1
  drop constraint if exists iberfit_email_privileged_assurance_v1_pkey;

alter table public.iberfit_email_privileged_assurance_v1
  drop constraint if exists iberfit_email_privileged_assurance_v1_otp_session_id_key;

alter table public.iberfit_email_privileged_assurance_v1
  add constraint iberfit_email_privileged_assurance_v1_pkey
  primary key (otp_session_id);

create index if not exists iberfit_email_privileged_assurance_v1_session_idx
  on public.iberfit_email_privileged_assurance_v1(user_id,session_id,origin,verified_at desc);

comment on constraint iberfit_email_privileged_assurance_v1_pkey
  on public.iberfit_email_privileged_assurance_v1 is
  'Each Supabase email OTP session may establish privileged assurance exactly once.';
