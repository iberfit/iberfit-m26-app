-- IBERFIT IRI v4 · contract phase
-- Apply only after the new IRI frontend is live/certified.
-- Recreates the server-side fail-closed physical-consent guard.

drop trigger if exists iri_require_physical_consent_v1 on public.iri_assessments;

create trigger iri_require_physical_consent_v1
before update of status on public.iri_assessments
for each row execute function public.iberfit_require_physical_consent_before_iri_confirm_v1();
