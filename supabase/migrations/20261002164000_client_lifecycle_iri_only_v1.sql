-- IBERFIT · service classification for IRI-only people v1
-- Additive only: preserves the canonical lifecycle status CHECK and existing events.
-- Existing ADMIN_CLIENTE_CAMBIAR_CICLO remains the mutation rail.
-- UI encodes "Solo IRI" as status=inactive + reason prefix service:iri_only.

alter table public.iberfit_client_lifecycle_events
  add column if not exists service_kind text
  generated always as (
    case
      when status = 'inactive'
       and position('service:iri_only' in coalesce(reason,'')) = 1
      then 'iri_only'
      else 'training'
    end
  ) stored;

comment on column public.iberfit_client_lifecycle_events.service_kind is
  'Derived commercial classification. iri_only = paid IRI/history without active training service; training = normal training lifecycle.';

create index if not exists iberfit_client_lifecycle_service_kind_v1_idx
  on public.iberfit_client_lifecycle_events(organization_id, service_kind, effective_at desc);
