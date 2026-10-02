-- IBERFIT IRI v4 · contract-phase physical-consent enforcement
-- Apply only after the new IRI frontend is live and certified.
-- The operational cutover compatibility step removes the trigger before frontend promotion.
-- This canonical migration re-enables the fail-closed guard additively, without DROP or anonymous DO blocks.

create trigger iri_require_physical_consent_v1
before update of status on public.iri_assessments
for each row execute function public.iberfit_require_physical_consent_before_iri_confirm_v1();
