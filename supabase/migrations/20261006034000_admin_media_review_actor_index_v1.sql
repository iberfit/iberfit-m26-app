-- IBERFIT Media Review · audit ledger actor lookup / FK support.
-- The ledger remains service-role-only with RLS enabled and no browser policies.

create index if not exists exercise_media_review_events_actor_idx
  on public.exercise_media_review_events(actor_user_id, occurred_at desc);
