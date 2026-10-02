-- IBERFIT IRI v4 · additive contract-phase activation
-- Creates the physical-consent trigger only when the operational cutover intentionally left it absent.
-- This canonical migration never drops data or schema objects.

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid='public.iri_assessments'::regclass
      and tgname='iri_require_physical_consent_v1'
      and not tgisinternal
  ) then
    execute $sql$
      create trigger iri_require_physical_consent_v1
      before update of status on public.iri_assessments
      for each row execute function public.iberfit_require_physical_consent_before_iri_confirm_v1()
    $sql$;
  end if;
end
$$;
