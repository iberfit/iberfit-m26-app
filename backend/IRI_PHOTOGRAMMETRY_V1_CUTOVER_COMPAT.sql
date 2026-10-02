-- IBERFIT IRI photogrammetry v1 · emergency compatibility action
-- Operational SQL outside supabase/migrations.
--
-- NOT part of the canonical forward production rollout.
-- The pre-deploy foundation leaves iri_assessments behavior unchanged, and the
-- restrictive physical-consent trigger is installed only after the new frontend
-- is live and certified.
--
-- Use only for an emergency frontend rollback after contract activation or to
-- repair an intermediate environment that already has the trigger enabled.
-- This preserves every row/object and only removes the enforcement trigger.

begin;

drop trigger if exists iri_require_physical_consent_v1 on public.iri_assessments;

commit;
