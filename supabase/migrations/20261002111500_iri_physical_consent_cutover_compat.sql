-- IBERFIT IRI v4 · expand/contract cutover compatibility
-- Apply with the schema/RPC migrations before the new frontend is promoted.
-- This keeps the previous frontend able to confirm an IRI during the deployment rollback window.
-- The new frontend still records physical consent before IRI confirmation at application level.
-- Server-side enforcement is activated by the following migration only after the new frontend is certified.

drop trigger if exists iri_require_physical_consent_v1 on public.iri_assessments;
