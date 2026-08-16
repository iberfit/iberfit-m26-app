insert into public.iberfit_system_settings(key, value)
values ('m10_gate', jsonb_build_object('environment','SYNTHETIC_ONLY','real_data_allowed',false,'production_blocked',true))
on conflict (key) do update set value = excluded.value, updated_at = now();
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('iberfit-documents-private','iberfit-documents-private',false,8388608,array['application/pdf','image/png','image/jpeg','text/plain','application/json']::text[])
on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = excluded.allowed_mime_types;
create table if not exists public.rls_probe_results (
  id uuid primary key default gen_random_uuid(),
  probe_name text not null,
  actor_role text not null,
  expected_allowed boolean not null,
  observed_allowed boolean,
  result text not null default 'pendiente' check (result in ('pendiente','pass','fail','bloqueado')),
  details jsonb not null default '{}'::jsonb,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.rls_probe_results enable row level security;
drop policy if exists rls_probe_results_admin_all on public.rls_probe_results;
create policy rls_probe_results_admin_all on public.rls_probe_results for all using (public.iberfit_role() = 'admin') with check (public.iberfit_role() = 'admin');;
