-- IBERFIT · Exercise load-direction semantics v1
-- Adds explicit, nullable semantics for interpreting load-only changes.
-- No exercise is inferred or backfilled here: unknown remains NULL by design.

alter table public.exercise_catalog
  add column if not exists load_direction text;

alter table public.exercise_catalog
  drop constraint if exists exercise_catalog_load_direction_check;

alter table public.exercise_catalog
  add constraint exercise_catalog_load_direction_check
  check (
    load_direction is null
    or load_direction in ('higher-is-better','lower-is-better')
  );

comment on column public.exercise_catalog.load_direction is
  'Explicit interpretation of load-only progression: higher-is-better for external resistance, lower-is-better for assistance/counterweight. NULL means unknown and must remain indeterminate.';

-- PostgreSQL cannot change a RETURNS TABLE shape with CREATE OR REPLACE.
-- Recreate the public read contract while preserving the existing execution model.
drop function if exists public.iberfit_exercise_catalog_public_v1(integer,integer);

create function public.iberfit_exercise_catalog_public_v1(
  p_limit integer default 200,
  p_offset integer default 0
)
returns table(
  id text,
  name_es text,
  name_source text,
  source text,
  source_id text,
  pattern text,
  intent text,
  equipment text,
  difficulty text,

  primary_muscles text[],
  secondary_muscles text[],
  cues text[],
  instructions_es text[],
  precautions text[],
  units text[],
  tags text[],
  aliases text[],

  name_admin_override boolean,
  name_translations jsonb,
  "loadDirection" text,

  media_status text,
  media jsonb,
  review_status text,
  active boolean,
  revision bigint,
  total_count bigint
)
language sql
stable
security definer
set search_path=''
as $$
  select
    e.id,
    e.name_es,
    e.name_source,
    e.source,
    e.source_id,
    e.pattern,
    e.intent,
    e.equipment,
    e.difficulty,

    e.primary_muscles,
    e.secondary_muscles,
    e.cues,
    e.instructions_es,
    e.precautions,
    e.units,
    e.tags,
    e.aliases,

    e.name_admin_override,

    coalesce(
      (
        select jsonb_object_agg(
          t.language,
          t.name
          order by t.language
        )
        from public.exercise_name_translations t
        where t.exercise_id=e.id
          and t.source_revision=e.revision
      ),
      '{}'::jsonb
    ) as name_translations,

    e.load_direction as "loadDirection",

    e.media_status,
    e.media,
    e.review_status,
    e.active,
    e.revision,

    count(*) over()
  from public.exercise_catalog e
  where e.active=true
    and e.review_status<>'retirado'
  order by e.name_es,e.id
  limit greatest(
    1,
    least(
      coalesce(p_limit,200),
      200
    )
  )
  offset greatest(
    coalesce(p_offset,0),
    0
  );
$$;

revoke all
on function public.iberfit_exercise_catalog_public_v1(integer,integer)
from public;

grant execute
on function public.iberfit_exercise_catalog_public_v1(integer,integer)
to anon, authenticated;