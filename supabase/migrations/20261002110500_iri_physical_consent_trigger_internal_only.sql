-- IBERFIT IRI photogrammetry · keep trigger function internal-only
-- The trigger executes through PostgreSQL trigger machinery and must not be directly callable by browser roles.

revoke all on function public.iberfit_require_physical_consent_before_iri_confirm_v1() from authenticated;
