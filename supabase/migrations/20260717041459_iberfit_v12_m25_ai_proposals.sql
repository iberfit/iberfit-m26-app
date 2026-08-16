create table if not exists public.ai_proposals(
 id uuid primary key default gen_random_uuid(),
 action text not null,
 client_id uuid references public.clients(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 provider text not null,
 model text,
 status text not null default 'propuesta',
 request_summary jsonb not null default '{}'::jsonb,
 proposal jsonb not null,
 limitations jsonb not null default '[]'::jsonb,
 requires_coach_approval boolean not null default true,
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 discarded_by uuid references auth.users(id),
 discarded_at timestamptz,
 created_at timestamptz not null default now(),
 constraint ai_proposals_status_check check(status in('propuesta','aprobada','descartada')),
 constraint ai_proposals_action_check check(action in('exercise_search','session_draft','iri_interpretation','progress_review','report_draft','catalog_enrichment'))
);
create index if not exists ai_proposals_client_idx on public.ai_proposals(client_id,created_at desc);
create index if not exists ai_proposals_created_by_idx on public.ai_proposals(created_by,created_at desc);
alter table public.ai_proposals enable row level security;
drop policy if exists ai_proposals_read on public.ai_proposals;
create policy ai_proposals_read on public.ai_proposals for select to authenticated using(created_by=(select auth.uid()) or (select public.iberfit_role())='admin'::public.iberfit_role or (client_id is not null and public.is_assigned_coach(client_id)));
drop policy if exists ai_proposals_insert on public.ai_proposals;
create policy ai_proposals_insert on public.ai_proposals for insert to authenticated with check(created_by=(select auth.uid()) and (select public.iberfit_role()) in('coach'::public.iberfit_role,'admin'::public.iberfit_role) and requires_coach_approval=true and status='propuesta');
drop policy if exists ai_proposals_update on public.ai_proposals;
create policy ai_proposals_update on public.ai_proposals for update to authenticated using((select public.iberfit_role()) in('coach'::public.iberfit_role,'admin'::public.iberfit_role) and (created_by=(select auth.uid()) or client_id is null or public.is_assigned_coach(client_id))) with check((select public.iberfit_role()) in('coach'::public.iberfit_role,'admin'::public.iberfit_role));
grant select,insert,update on public.ai_proposals to authenticated;;
