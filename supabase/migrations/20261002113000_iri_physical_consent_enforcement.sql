-- IBERFIT IRI v4 · post-deploy contract phase
-- Apply only after the new IRI frontend is live and certified.
-- The pre-deploy foundation leaves existing iri_assessments behavior unchanged.
-- This migration tightens the IRI contract without rewriting rows or dropping schema.

alter table public.iri_assessments
  add constraint iri_assessments_initial_only_v4
  check (assessment_type = 'inicial');

alter table public.iri_assessments
  alter column assessment_type set default 'inicial',
  alter column protocol_version set default '4.0.0';

alter table public.iri_assessments
  add constraint iri_assessments_step_v4
  check (current_step = any(array[
    'contexto','composicion','fotografia','movilidad','fuerza','capacidad','interpretacion','planAccion'
  ]::text[]));

create unique index if not exists iri_one_initial_per_client_v1
  on public.iri_assessments(client_id);

revoke delete on public.iri_assessments from authenticated, anon;

create trigger iri_require_physical_consent_v1
before update of status on public.iri_assessments
for each row execute function public.iberfit_require_physical_consent_before_iri_confirm_v1();
