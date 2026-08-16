create table if not exists public.privacy_notices_v17 (
  id uuid primary key default gen_random_uuid(), version text not null unique, locale text not null default 'es-CL', title text not null,
  purposes jsonb not null, data_categories jsonb not null, retention_summary text, contact text,
  legal_reviewed boolean not null default false, status text not null check(status in ('draft','published','retired')) default 'draft',
  published_at timestamptz, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.consent_acceptances_v17 (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), client_id uuid references public.clients(id),
  notice_id uuid not null references public.privacy_notices_v17(id), scope jsonb not null, accepted boolean not null,
  accepted_at timestamptz, withdrawn_at timestamptz, evidence jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.data_subject_requests_v17 (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), client_id uuid references public.clients(id),
  request_type text not null check(request_type in ('access','correction','export','restriction','deletion')),
  status text not null check(status in ('received','identity_check','in_review','approved','rejected','completed')) default 'received',
  identity_verified boolean not null default false, notes text, resolution jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.retention_policies_v17 (
  id uuid primary key default gen_random_uuid(), data_domain text not null unique, retention_days integer not null check(retention_days>0),
  legal_hold_supported boolean not null default true, automatic_deletion boolean not null default false,
  status text not null check(status in ('draft','approved','retired')) default 'draft', approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.incident_register_v17 (
  id uuid primary key default gen_random_uuid(), severity text not null check(severity in ('low','medium','high','critical')),
  category text not null, summary text not null, details jsonb not null default '{}'::jsonb, status text not null check(status in ('open','contained','investigating','recovered','closed')) default 'open',
  owner_id uuid references auth.users(id), client_id uuid references public.clients(id), freeze_writes boolean not null default false,
  response_due_at timestamptz, created_at timestamptz not null default now(), closed_at timestamptz
);
create table if not exists public.release_approvals_v17 (
  id uuid primary key default gen_random_uuid(), release_candidate_id uuid references public.release_candidates(id), approval_type text not null check(approval_type in ('owner','technical','privacy','operations')),
  approved boolean not null default false, approved_by uuid references auth.users(id), evidence jsonb not null default '{}'::jsonb,
  approved_at timestamptz, created_at timestamptz not null default now(), unique(release_candidate_id,approval_type)
);
alter table public.privacy_notices_v17 enable row level security;
alter table public.consent_acceptances_v17 enable row level security;
alter table public.data_subject_requests_v17 enable row level security;
alter table public.retention_policies_v17 enable row level security;
alter table public.incident_register_v17 enable row level security;
alter table public.release_approvals_v17 enable row level security;
create index if not exists idx_privacy_notices_created_by on public.privacy_notices_v17(created_by);
create index if not exists idx_consent_user_notice on public.consent_acceptances_v17(user_id,notice_id);
create index if not exists idx_consent_client on public.consent_acceptances_v17(client_id);
create index if not exists idx_requests_user_status on public.data_subject_requests_v17(user_id,status);
create index if not exists idx_requests_client on public.data_subject_requests_v17(client_id);
create index if not exists idx_retention_approved_by on public.retention_policies_v17(approved_by);
create index if not exists idx_incident_owner on public.incident_register_v17(owner_id,status);
create index if not exists idx_incident_client on public.incident_register_v17(client_id,created_at desc);
create index if not exists idx_release_approval_candidate on public.release_approvals_v17(release_candidate_id);
create index if not exists idx_release_approval_by on public.release_approvals_v17(approved_by);
create policy privacy_notice_published_read on public.privacy_notices_v17 for select to authenticated using(status='published' or (select public.iberfit_role())='admin'::public.iberfit_role);
create policy privacy_notice_admin_write on public.privacy_notices_v17 for all to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);
create policy consent_self_read on public.consent_acceptances_v17 for select to authenticated using(user_id=(select auth.uid()) or (client_id is not null and public.is_assigned_coach(client_id)) or (select public.iberfit_role())='admin'::public.iberfit_role);
create policy consent_self_insert on public.consent_acceptances_v17 for insert to authenticated with check(user_id=(select auth.uid()));
create policy consent_admin_update on public.consent_acceptances_v17 for update to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);
create policy requests_self_read on public.data_subject_requests_v17 for select to authenticated using(user_id=(select auth.uid()) or (client_id is not null and public.is_assigned_coach(client_id)) or (select public.iberfit_role())='admin'::public.iberfit_role);
create policy requests_self_insert on public.data_subject_requests_v17 for insert to authenticated with check(user_id=(select auth.uid()));
create policy requests_admin_update on public.data_subject_requests_v17 for update to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);
create policy retention_admin_all on public.retention_policies_v17 for all to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);
create policy incident_staff_read on public.incident_register_v17 for select to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role or owner_id=(select auth.uid()) or (client_id is not null and public.is_assigned_coach(client_id)));
create policy incident_staff_write on public.incident_register_v17 for all to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role or owner_id=(select auth.uid())) with check((select public.iberfit_role())='admin'::public.iberfit_role or owner_id=(select auth.uid()));
create policy release_approvals_admin_all on public.release_approvals_v17 for all to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);;
