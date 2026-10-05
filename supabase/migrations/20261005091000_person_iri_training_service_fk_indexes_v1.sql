-- IBERFIT · Persona / IRI / Servicio · FK index hardening v1
-- Additive performance hardening discovered by Supabase advisors after the canonical cutover.
-- No data semantics, RLS, permissions, IRI baseline constraints or training-service behavior changes.

create index if not exists iberfit_training_service_events_v1_person_idx
  on public.iberfit_training_service_events_v1(person_id);

create index if not exists iberfit_training_service_events_v1_changed_by_idx
  on public.iberfit_training_service_events_v1(changed_by);

create index if not exists iri_reevaluations_v1_initial_person_idx
  on public.iri_reevaluations_v1(initial_assessment_id,person_id);

create index if not exists iri_reevaluations_v1_organization_idx
  on public.iri_reevaluations_v1(organization_id);

create index if not exists iri_reevaluations_v1_created_by_idx
  on public.iri_reevaluations_v1(created_by);
