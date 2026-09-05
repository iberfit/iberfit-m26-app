-- IBERFIT Exercise Library Engine v1
-- Multimedia queue + storage + read RPC. Additive and backwards compatible.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'iberfit-exercise-media',
  'iberfit-exercise-media',
  true,
  12582912,
  array['image/webp','image/png','image/jpeg','video/webm']::text[]
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.exercise_media_jobs(
  id uuid primary key default gen_random_uuid(),
  exercise_id text not null references public.exercise_catalog(id) on delete cascade,
  schema_version text not null default 'iberfit.exercise.visual.v1',
  style_version text not null default 'iberfit-premium-movement-pair-v1',
  status text not null default 'queued',
  attempts integer not null default 0,
  visual_spec jsonb not null default '{}'::jsonb,
  output_manifest jsonb not null default '{}'::jsonb,
  last_error text,
  created_by uuid references auth.users(id),
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_media_jobs_status_check check(status in('queued','generating','qa','ready','failed','blocked')),
  constraint exercise_media_jobs_attempts_check check(attempts>=0 and attempts<=20)
);

create index if not exists exercise_media_jobs_status_idx
  on public.exercise_media_jobs(status,created_at);
create index if not exists exercise_media_jobs_exercise_idx
  on public.exercise_media_jobs(exercise_id,created_at desc);
create unique index if not exists exercise_media_jobs_one_active_idx
  on public.exercise_media_jobs(exercise_id)
  where status in('queued','generating','qa');

alter table public.exercise_media_jobs enable row level security;

drop policy if exists exercise_media_jobs_admin_read on public.exercise_media_jobs;
create policy exercise_media_jobs_admin_read on public.exercise_media_jobs
for select to authenticated
using ((select public.iberfit_role())::text='admin');

drop policy if exists exercise_media_jobs_admin_insert on public.exercise_media_jobs;
create policy exercise_media_jobs_admin_insert on public.exercise_media_jobs
for insert to authenticated
with check ((select public.iberfit_role())::text='admin' and (created_by is null or created_by=(select auth.uid())));

drop policy if exists exercise_media_jobs_admin_update on public.exercise_media_jobs;
create policy exercise_media_jobs_admin_update on public.exercise_media_jobs
for update to authenticated
using ((select public.iberfit_role())::text='admin')
with check ((select public.iberfit_role())::text='admin');

grant select,insert,update on public.exercise_media_jobs to authenticated;

-- Exercise visuals are brand assets, not client data. Reads are public/CDN-friendly;
-- writes remain admin-only via Storage RLS.
drop policy if exists storage_iberfit_exercise_media_admin_insert on storage.objects;
create policy storage_iberfit_exercise_media_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id='iberfit-exercise-media' and (select public.iberfit_role())::text='admin');

drop policy if exists storage_iberfit_exercise_media_admin_update on storage.objects;
create policy storage_iberfit_exercise_media_admin_update on storage.objects
for update to authenticated
using (bucket_id='iberfit-exercise-media' and (select public.iberfit_role())::text='admin')
with check (bucket_id='iberfit-exercise-media' and (select public.iberfit_role())::text='admin');

drop policy if exists storage_iberfit_exercise_media_admin_delete on storage.objects;
create policy storage_iberfit_exercise_media_admin_delete on storage.objects
for delete to authenticated
using (bucket_id='iberfit-exercise-media' and (select public.iberfit_role())::text='admin');

create or replace function public.iberfit_queue_missing_exercise_media_v1(p_limit integer default 500)
returns integer
language plpgsql
security invoker
set search_path=''
as $$
declare
  inserted_count integer:=0;
begin
  if (select public.iberfit_role())::text<>'admin' then
    raise exception 'IBERFIT_ADMIN_REQUIRED' using errcode='42501';
  end if;

  insert into public.exercise_media_jobs(exercise_id,visual_spec,created_by)
  select
    e.id,
    jsonb_build_object(
      'schema','iberfit.exercise.visual.v1',
      'style','iberfit-premium-movement-pair-v1',
      'exerciseId',e.id,
      'exerciseName',e.name_es,
      'pattern',e.pattern,
      'equipment',e.equipment,
      'primaryMuscles',to_jsonb(e.primary_muscles),
      'secondaryMuscles',to_jsonb(e.secondary_muscles),
      'instructions',to_jsonb(e.instructions_es),
      'cues',to_jsonb(e.cues),
      'composition',jsonb_build_object(
        'type','movement_pair',
        'showStartAndEndTogether',true,
        'labelsOnImage',false,
        'anatomicalInset',true,
        'branding','one_small_real_iberfit_isotype_left_chest_only'
      )
    ),
    auth.uid()
  from public.exercise_catalog e
  where e.active=true
    and e.media_status='pendiente'
    and not exists(
      select 1 from public.exercise_media_jobs j
      where j.exercise_id=e.id and j.status in('queued','generating','qa')
    )
  order by e.name_es,e.id
  limit greatest(1,least(coalesce(p_limit,500),2000))
  on conflict do nothing;

  get diagnostics inserted_count=row_count;
  return inserted_count;
end
$$;

revoke all on function public.iberfit_queue_missing_exercise_media_v1(integer) from public,anon;
grant execute on function public.iberfit_queue_missing_exercise_media_v1(integer) to authenticated;

create or replace function public.iberfit_search_exercises_v2(
 p_query text default null,
 p_pattern text default null,
 p_equipment text default null,
 p_intent text default null,
 p_difficulty text default null,
 p_limit integer default 60,
 p_offset integer default 0
) returns table(
 id text,name_es text,name_source text,source text,source_id text,pattern text,intent text,equipment text,difficulty text,
 primary_muscles text[],secondary_muscles text[],cues text[],instructions_es text[],precautions text[],units text[],tags text[],aliases text[],
 media_status text,media jsonb,review_status text,active boolean,revision bigint,total_count bigint
) language sql stable security invoker set search_path='' as $$
 with filtered as(
  select e.*,
   case when nullif(trim(p_query),'') is null then 1.0 else greatest(
    extensions.similarity(e.name_es,trim(p_query)),
    extensions.similarity(coalesce(e.name_source,''),trim(p_query)),
    case when e.name_es ilike '%'||trim(p_query)||'%' then 0.95 else 0 end,
    case when exists(select 1 from unnest(e.aliases||e.tags||e.primary_muscles)x where x ilike '%'||trim(p_query)||'%') then 0.85 else 0 end
   ) end as rank_score
  from public.exercise_catalog e
  where e.active=true
   and(nullif(trim(p_pattern),'') is null or e.pattern=p_pattern)
   and(nullif(trim(p_equipment),'') is null or e.equipment=p_equipment)
   and(nullif(trim(p_intent),'') is null or e.intent=p_intent)
   and(nullif(trim(p_difficulty),'') is null or e.difficulty=p_difficulty)
   and(nullif(trim(p_query),'') is null or e.name_es ilike '%'||trim(p_query)||'%' or coalesce(e.name_source,'') ilike '%'||trim(p_query)||'%' or exists(select 1 from unnest(e.aliases||e.tags||e.primary_muscles)x where x ilike '%'||trim(p_query)||'%'))
 )
 select f.id,f.name_es,f.name_source,f.source,f.source_id,f.pattern,f.intent,f.equipment,f.difficulty,
  f.primary_muscles,f.secondary_muscles,f.cues,f.instructions_es,f.precautions,f.units,f.tags,f.aliases,
  f.media_status,f.media,f.review_status,f.active,f.revision,count(*) over()
 from filtered f
 order by f.rank_score desc,f.name_es
 limit greatest(1,least(coalesce(p_limit,60),200)) offset greatest(coalesce(p_offset,0),0)
$$;

revoke all on function public.iberfit_search_exercises_v2(text,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.iberfit_search_exercises_v2(text,text,text,text,text,integer,integer) to authenticated;
