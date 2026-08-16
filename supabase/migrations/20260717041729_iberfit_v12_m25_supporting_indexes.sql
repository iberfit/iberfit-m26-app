create index if not exists ai_proposals_approved_by_idx on public.ai_proposals(approved_by) where approved_by is not null;
create index if not exists ai_proposals_discarded_by_idx on public.ai_proposals(discarded_by) where discarded_by is not null;
create index if not exists exercise_catalog_sync_runs_started_by_idx on public.exercise_catalog_sync_runs(started_by,started_at desc);
create index if not exists client_intake_profiles_created_by_idx on public.client_intake_profiles(created_by);
create index if not exists client_intake_profiles_updated_by_idx on public.client_intake_profiles(updated_by);;
