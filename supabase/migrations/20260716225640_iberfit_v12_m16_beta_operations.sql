create table if not exists public.beta_participants_v16 (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), client_id uuid references public.clients(id),
  role text not null check (role in ('client','coach')), cohort text not null,
  environment text not null default 'SYNTHETIC_ONLY' check (environment = 'SYNTHETIC_ONLY'),
  status text not null default 'invited' check (status in ('invited','active','paused','completed','withdrawn')),
  device_profile jsonb not null default '{}'::jsonb, support_owner uuid references auth.users(id),
  enrolled_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.beta_consent_records_v16 (
  id uuid primary key default gen_random_uuid(), participant_id uuid not null references public.beta_participants_v16(id),
  notice_version text not null, scope jsonb not null, accepted boolean not null, accepted_at timestamptz, withdrawn_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.beta_session_observations_v16 (
  id uuid primary key default gen_random_uuid(), participant_id uuid not null references public.beta_participants_v16(id),
  session_id uuid references public.sessions(id), duration_minutes integer not null default 0, network_interruptions integer not null default 0,
  recovered boolean not null default false, data_loss boolean not null default false, close_confirmed boolean not null default false,
  result jsonb not null default '{}'::jsonb, observed_at timestamptz not null default now()
);
create table if not exists public.beta_incidents_v16 (
  id uuid primary key default gen_random_uuid(), participant_id uuid references public.beta_participants_v16(id), client_id uuid references public.clients(id),
  category text not null, severity text not null check (severity in ('low','medium','high','critical')), summary text not null,
  details jsonb not null default '{}'::jsonb, status text not null default 'open' check (status in ('open','triage','mitigated','closed')),
  response_due_at timestamptz, assigned_to uuid references auth.users(id), created_at timestamptz not null default now(), closed_at timestamptz
);
create table if not exists public.beta_feedback_v16 (
  id uuid primary key default gen_random_uuid(), participant_id uuid not null references public.beta_participants_v16(id),
  session_id uuid references public.sessions(id), ease_score integer check (ease_score between 1 and 5), confidence_score integer check (confidence_score between 1 and 5),
  comment text, created_at timestamptz not null default now()
);
alter table public.beta_participants_v16 enable row level security;
alter table public.beta_consent_records_v16 enable row level security;
alter table public.beta_session_observations_v16 enable row level security;
alter table public.beta_incidents_v16 enable row level security;
alter table public.beta_feedback_v16 enable row level security;
create index if not exists idx_beta_participants_user on public.beta_participants_v16(user_id);
create index if not exists idx_beta_participants_client on public.beta_participants_v16(client_id);
create index if not exists idx_beta_participants_support on public.beta_participants_v16(support_owner);
create index if not exists idx_beta_consent_participant on public.beta_consent_records_v16(participant_id);
create index if not exists idx_beta_observation_participant on public.beta_session_observations_v16(participant_id, observed_at desc);
create index if not exists idx_beta_observation_session on public.beta_session_observations_v16(session_id);
create index if not exists idx_beta_incident_participant on public.beta_incidents_v16(participant_id);
create index if not exists idx_beta_incident_client on public.beta_incidents_v16(client_id, created_at desc);
create index if not exists idx_beta_incident_assigned on public.beta_incidents_v16(assigned_to);
create index if not exists idx_beta_feedback_participant on public.beta_feedback_v16(participant_id, created_at desc);
create index if not exists idx_beta_feedback_session on public.beta_feedback_v16(session_id);
create policy beta_participants_select on public.beta_participants_v16 for select to authenticated using (user_id = (select auth.uid()) or (client_id is not null and public.is_assigned_coach(client_id)) or (select public.iberfit_role()) = 'admin'::public.iberfit_role);
create policy beta_participants_admin_write on public.beta_participants_v16 for all to authenticated using ((select public.iberfit_role()) = 'admin'::public.iberfit_role) with check ((select public.iberfit_role()) = 'admin'::public.iberfit_role);
create policy beta_consent_select on public.beta_consent_records_v16 for select to authenticated using (exists(select 1 from public.beta_participants_v16 p where p.id = participant_id and (p.user_id = (select auth.uid()) or (p.client_id is not null and public.is_assigned_coach(p.client_id)) or (select public.iberfit_role()) = 'admin'::public.iberfit_role)));
create policy beta_consent_self_insert on public.beta_consent_records_v16 for insert to authenticated with check (exists(select 1 from public.beta_participants_v16 p where p.id = participant_id and p.user_id = (select auth.uid())));
create policy beta_consent_admin_update on public.beta_consent_records_v16 for update to authenticated using ((select public.iberfit_role()) = 'admin'::public.iberfit_role) with check ((select public.iberfit_role()) = 'admin'::public.iberfit_role);
create policy beta_observation_select on public.beta_session_observations_v16 for select to authenticated using (exists(select 1 from public.beta_participants_v16 p where p.id = participant_id and (p.user_id = (select auth.uid()) or (p.client_id is not null and public.is_assigned_coach(p.client_id)) or (select public.iberfit_role()) = 'admin'::public.iberfit_role)));
create policy beta_observation_insert on public.beta_session_observations_v16 for insert to authenticated with check (exists(select 1 from public.beta_participants_v16 p where p.id = participant_id and (p.user_id = (select auth.uid()) or (p.client_id is not null and public.is_assigned_coach(p.client_id)))));
create policy beta_incident_select on public.beta_incidents_v16 for select to authenticated using ((select public.iberfit_role()) = 'admin'::public.iberfit_role or assigned_to = (select auth.uid()) or (client_id is not null and public.is_assigned_coach(client_id)) or exists(select 1 from public.beta_participants_v16 p where p.id = participant_id and p.user_id = (select auth.uid())));
create policy beta_incident_insert on public.beta_incidents_v16 for insert to authenticated with check ((select public.iberfit_role()) = 'admin'::public.iberfit_role or (client_id is not null and public.is_assigned_coach(client_id)) or exists(select 1 from public.beta_participants_v16 p where p.id = participant_id and p.user_id = (select auth.uid())));
create policy beta_incident_update_staff on public.beta_incidents_v16 for update to authenticated using ((select public.iberfit_role()) = 'admin'::public.iberfit_role or assigned_to = (select auth.uid()) or (client_id is not null and public.is_assigned_coach(client_id))) with check ((select public.iberfit_role()) = 'admin'::public.iberfit_role or assigned_to = (select auth.uid()) or (client_id is not null and public.is_assigned_coach(client_id)));
create policy beta_feedback_select on public.beta_feedback_v16 for select to authenticated using (exists(select 1 from public.beta_participants_v16 p where p.id = participant_id and (p.user_id = (select auth.uid()) or (p.client_id is not null and public.is_assigned_coach(p.client_id)) or (select public.iberfit_role()) = 'admin'::public.iberfit_role)));
create policy beta_feedback_insert on public.beta_feedback_v16 for insert to authenticated with check (exists(select 1 from public.beta_participants_v16 p where p.id = participant_id and p.user_id = (select auth.uid())));;
