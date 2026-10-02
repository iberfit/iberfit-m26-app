-- IBERFIT · lifecycle person / IRI-only / training client v1
-- Adds an explicit commercial state without removing the client/person record.
-- Coach assignment may remain active for private IRI authorization; active training metrics
-- must derive from the latest lifecycle status, not from assignment existence alone.

alter table public.iberfit_client_lifecycle_events
  drop constraint if exists iberfit_client_lifecycle_events_status_check;

alter table public.iberfit_client_lifecycle_events
  add constraint iberfit_client_lifecycle_events_status_check
  check (status = any(array[
    'lead'::text,
    'onboarding'::text,
    'iri_only'::text,
    'active'::text,
    'paused'::text,
    'inactive'::text,
    'reactivation'::text
  ]));

comment on column public.iberfit_client_lifecycle_events.status is
  'Commercial/service lifecycle. iri_only = person with paid IRI/history but no active training service.';
