-- IBERFIT IRI v4 · physical-consent guard for every protected status
-- Repairs intermediate QA environments and keeps the canonical function fail-closed
-- for legacy IRI rows that may already be in revisión before this feature is deployed.

create or replace function public.iberfit_require_physical_consent_before_iri_confirm_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status in ('revisión','aprobado','publicado')
     and not public.iberfit_iri_consent_active_v1(new.id,'physical_assessment') then
    raise exception 'IRI_V4_PHYSICAL_CONSENT_REQUIRED' using errcode='42501';
  end if;
  return new;
end
$$;

revoke all on function public.iberfit_require_physical_consent_before_iri_confirm_v1() from public,anon,authenticated;
