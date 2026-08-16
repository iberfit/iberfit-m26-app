create extension if not exists pg_trgm with schema extensions;
create table if not exists public.exercise_catalog (
 id text primary key,
 name_es text not null,
 name_source text,
 source text not null default 'IBERFIT_CANONICAL',
 source_id text,
 pattern text not null,
 intent text not null,
 equipment text not null,
 difficulty text not null,
 primary_muscles text[] not null default '{}',
 secondary_muscles text[] not null default '{}',
 cues text[] not null default '{}',
 instructions_es text[] not null default '{}',
 precautions text[] not null default '{}',
 units text[] not null default '{}',
 tags text[] not null default '{}',
 aliases text[] not null default '{}',
 media_status text not null default 'pendiente',
 media jsonb not null default '{}'::jsonb,
 review_status text not null default 'pendiente',
 active boolean not null default true,
 revision bigint not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint exercise_catalog_media_status_check check (media_status in ('pendiente','aprobado','bloqueado','sin_media')),
 constraint exercise_catalog_review_status_check check (review_status in ('validado_nucleo','external_reference','pendiente','retirado'))
);
create index if not exists exercise_catalog_name_trgm_idx on public.exercise_catalog using gin (name_es extensions.gin_trgm_ops);
create index if not exists exercise_catalog_source_name_trgm_idx on public.exercise_catalog using gin (coalesce(name_source,'') extensions.gin_trgm_ops);
create index if not exists exercise_catalog_pattern_idx on public.exercise_catalog(pattern);
create index if not exists exercise_catalog_equipment_idx on public.exercise_catalog(equipment);
create index if not exists exercise_catalog_intent_idx on public.exercise_catalog(intent);
create index if not exists exercise_catalog_active_idx on public.exercise_catalog(active,review_status);
create index if not exists exercise_catalog_tags_idx on public.exercise_catalog using gin(tags);
create index if not exists exercise_catalog_aliases_idx on public.exercise_catalog using gin(aliases);
alter table public.exercise_catalog enable row level security;
drop policy if exists exercise_catalog_read_authenticated on public.exercise_catalog;
create policy exercise_catalog_read_authenticated on public.exercise_catalog for select to authenticated using(active=true or (select public.iberfit_role()) in ('coach'::public.iberfit_role,'admin'::public.iberfit_role));
drop policy if exists exercise_catalog_admin_insert on public.exercise_catalog;
create policy exercise_catalog_admin_insert on public.exercise_catalog for insert to authenticated with check((select public.iberfit_role())='admin'::public.iberfit_role);
drop policy if exists exercise_catalog_admin_update on public.exercise_catalog;
create policy exercise_catalog_admin_update on public.exercise_catalog for update to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);
grant select,insert,update on public.exercise_catalog to authenticated;;
