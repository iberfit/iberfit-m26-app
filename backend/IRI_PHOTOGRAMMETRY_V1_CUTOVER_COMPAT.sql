-- IBERFIT IRI photogrammetry v1 · deployment cutover compatibility
-- Operational SQL, intentionally outside supabase/migrations because it is a reversible
-- control-plane action rather than an append-only schema migration.
-- Run only after the additive schema/RPC migrations and before promoting the new frontend.
-- It preserves every row/object and keeps the previous frontend rollback-compatible.

begin;

drop trigger if exists iri_require_physical_consent_v1 on public.iri_assessments;

commit;
