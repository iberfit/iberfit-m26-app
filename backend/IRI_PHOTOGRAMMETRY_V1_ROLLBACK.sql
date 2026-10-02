-- IBERFIT IRI photogrammetry v1 · data-preserving emergency rollback
-- Purpose: make an emergency rollback to the previous frontend compatible after
-- server-side physical-consent enforcement has been activated.
-- This intentionally preserves all IRI rows, consent ledger rows, private captures,
-- analyses, Storage objects, RLS policies and cryptographic provenance.
-- Re-activate enforcement with the canonical trigger definition after the forward
-- frontend is restored and certified.

begin;

drop trigger if exists iri_require_physical_consent_v1 on public.iri_assessments;

commit;
