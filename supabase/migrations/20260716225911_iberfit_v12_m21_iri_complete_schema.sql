alter table public.iri_assessments
  add column if not exists assessment_type text not null default 'inicial',
  add column if not exists protocol_version text not null default '3.0.0',
  add column if not exists current_step text not null default 'contexto',
  add column if not exists evaluated_at date,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists score numeric,
  add column if not exists classification text,
  add column if not exists data_quality text,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists published_at timestamptz;
update public.iri_assessments
set evaluated_at = coalesce(evaluated_at, created_at::date),
    started_at = coalesce(started_at, created_at),
    protocol_version = coalesce(nullif(protocol_version, ''), '3.0.0'),
    current_step = coalesce(nullif(current_step, ''), 'contexto')
where evaluated_at is null or started_at is null or protocol_version is null or current_step is null;
do $$ begin alter table public.iri_assessments add constraint iri_assessments_type_check check (assessment_type in ('inicial','reevaluacion')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.iri_assessments add constraint iri_assessments_step_check check (current_step in ('contexto','composicion','movilidad','fuerza','capacidad','interpretacion','planAccion')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.iri_assessments add constraint iri_assessments_score_check check (score is null or (score >= 0 and score <= 100)); exception when duplicate_object then null; end $$;
do $$ begin alter table public.iri_assessments add constraint iri_assessments_quality_check check (data_quality is null or data_quality in ('insuficiente','media','alta')); exception when duplicate_object then null; end $$;
create index if not exists idx_iri_assessments_client_evaluated on public.iri_assessments(client_id, evaluated_at desc, created_at desc);
create index if not exists idx_iri_assessments_status on public.iri_assessments(client_id, status, updated_at desc);
create index if not exists idx_iri_assessments_approved_by on public.iri_assessments(approved_by);;
