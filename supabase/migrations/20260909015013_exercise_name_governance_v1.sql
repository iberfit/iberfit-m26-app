-- IBERFIT · Exercise Name Governance v1
-- Stable exercise_id
-- Admin canonical names
-- Atomic automatic translations
-- Audit history
-- Canonical public read model

alter table public.exercise_catalog
  add column if not exists name_admin_override boolean
  not null
  default false;


create table if not exists public.exercise_name_translations (
  exercise_id text not null
    references public.exercise_catalog(id)
    on delete cascade,

  language text not null,
  name text not null,
  source_revision bigint not null,

  provider text not null default 'Gemini',
  model text,

  updated_by uuid not null default auth.uid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (exercise_id, language),

  constraint exercise_name_translations_language_check
    check (language in ('en','fr','pt')),

  constraint exercise_name_translations_name_check
    check (char_length(trim(name)) between 2 and 160),

  constraint exercise_name_translations_revision_check
    check (source_revision >= 1)
);

alter table public.exercise_name_translations
  enable row level security;

revoke all
on table public.exercise_name_translations
from anon, authenticated;

grant select, insert, update, delete
on table public.exercise_name_translations
to authenticated;


drop policy if exists exercise_name_translations_admin_select
  on public.exercise_name_translations;

create policy exercise_name_translations_admin_select
on public.exercise_name_translations
for select
to authenticated
using (
  (select public.iberfit_role())::text='admin'
);


drop policy if exists exercise_name_translations_admin_insert
  on public.exercise_name_translations;

create policy exercise_name_translations_admin_insert
on public.exercise_name_translations
for insert
to authenticated
with check (
  (select public.iberfit_role())::text='admin'
  and updated_by=(select auth.uid())
);


drop policy if exists exercise_name_translations_admin_update
  on public.exercise_name_translations;

create policy exercise_name_translations_admin_update
on public.exercise_name_translations
for update
to authenticated
using (
  (select public.iberfit_role())::text='admin'
)
with check (
  (select public.iberfit_role())::text='admin'
  and updated_by=(select auth.uid())
);


drop policy if exists exercise_name_translations_admin_delete
  on public.exercise_name_translations;

create policy exercise_name_translations_admin_delete
on public.exercise_name_translations
for delete
to authenticated
using (
  (select public.iberfit_role())::text='admin'
);


create table if not exists public.exercise_name_history (
  id uuid primary key default gen_random_uuid(),

  exercise_id text not null
    references public.exercise_catalog(id)
    on delete cascade,

  previous_name_es text not null,
  new_name_es text not null,

  revision bigint not null,
  translations jsonb not null,

  provider text not null,
  model text,

  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now(),

  constraint exercise_name_history_previous_check
    check (
      char_length(trim(previous_name_es))
      between 2 and 160
    ),

  constraint exercise_name_history_new_check
    check (
      char_length(trim(new_name_es))
      between 2 and 160
    ),

  constraint exercise_name_history_revision_check
    check (revision >= 1),

  constraint exercise_name_history_translations_check
    check (jsonb_typeof(translations)='object')
);

create index if not exists exercise_name_history_exercise_idx
  on public.exercise_name_history(
    exercise_id,
    changed_at desc
  );

alter table public.exercise_name_history
  enable row level security;

revoke all
on table public.exercise_name_history
from anon, authenticated;

grant select, insert
on table public.exercise_name_history
to authenticated;


drop policy if exists exercise_name_history_admin_select
  on public.exercise_name_history;

create policy exercise_name_history_admin_select
on public.exercise_name_history
for select
to authenticated
using (
  (select public.iberfit_role())::text='admin'
);


drop policy if exists exercise_name_history_admin_insert
  on public.exercise_name_history;

create policy exercise_name_history_admin_insert
on public.exercise_name_history
for insert
to authenticated
with check (
  (select public.iberfit_role())::text='admin'
  and changed_by=(select auth.uid())
);


create or replace function public.iberfit_admin_rename_exercise_v1(
  p_exercise_id text,
  p_name_es text,
  p_expected_revision bigint,
  p_translations jsonb,
  p_provider text default 'Gemini',
  p_model text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_previous text;
  v_revision bigint;
  v_override boolean;

  v_name text;
  v_en text;
  v_fr text;
  v_pt text;

  v_provider text;
  v_model text;

  v_target_revision bigint;
  v_changed boolean;
  v_promote boolean;
begin
  if (select public.iberfit_role())::text <> 'admin' then
    raise exception 'IBERFIT_ADMIN_REQUIRED'
      using errcode='42501';
  end if;

  v_name :=
    regexp_replace(
      trim(coalesce(p_name_es,'')),
      '[[:space:]]+',
      ' ',
      'g'
    );

  if p_exercise_id is null
    or length(trim(p_exercise_id)) < 2
    or char_length(v_name) not between 2 and 160
    or p_expected_revision is null
    or p_expected_revision < 0
  then
    raise exception 'IBERFIT_EXERCISE_NAME_INVALID'
      using errcode='22023';
  end if;

  if p_translations is null
    or jsonb_typeof(p_translations) is distinct from 'object'
  then
    raise exception 'IBERFIT_EXERCISE_TRANSLATIONS_INVALID'
      using errcode='22023';
  end if;

  if (
    select count(*)
    from jsonb_object_keys(p_translations)
  ) <> 3
  or not (
    p_translations ? 'en'
    and p_translations ? 'fr'
    and p_translations ? 'pt'
  )
  or exists (
    select 1
    from jsonb_object_keys(p_translations) as language
    where language not in ('en','fr','pt')
  )
  then
    raise exception 'IBERFIT_EXERCISE_TRANSLATIONS_INVALID'
      using errcode='22023';
  end if;

  v_en :=
    regexp_replace(
      trim(coalesce(p_translations->>'en','')),
      '[[:space:]]+',
      ' ',
      'g'
    );

  v_fr :=
    regexp_replace(
      trim(coalesce(p_translations->>'fr','')),
      '[[:space:]]+',
      ' ',
      'g'
    );

  v_pt :=
    regexp_replace(
      trim(coalesce(p_translations->>'pt','')),
      '[[:space:]]+',
      ' ',
      'g'
    );

  if char_length(v_en) not between 2 and 160
    or char_length(v_fr) not between 2 and 160
    or char_length(v_pt) not between 2 and 160
  then
    raise exception 'IBERFIT_EXERCISE_TRANSLATIONS_INVALID'
      using errcode='22023';
  end if;

  v_provider :=
    left(
      trim(coalesce(nullif(p_provider,''),'Gemini')),
      80
    );

  v_model :=
    nullif(
      left(
        trim(coalesce(p_model,'')),
        120
      ),
      ''
    );

  select
    e.name_es,
    e.revision,
    e.name_admin_override
  into
    v_previous,
    v_revision,
    v_override
  from public.exercise_catalog e
  where e.id=p_exercise_id
    and e.active=true
  for update;

  if not found then
    raise exception 'IBERFIT_EXERCISE_NOT_FOUND'
      using errcode='P0002';
  end if;

  if p_expected_revision <> v_revision then
    raise exception 'IBERFIT_EXERCISE_REVISION_CONFLICT'
      using errcode='40001';
  end if;

  v_changed :=
    v_previous is distinct from v_name;

  v_promote :=
    v_changed
    or coalesce(v_override,false)=false;

  v_target_revision :=
    case
      when v_promote then v_revision+1
      else v_revision
    end;

  if v_changed then
    insert into public.exercise_name_history(
      exercise_id,
      previous_name_es,
      new_name_es,
      revision,
      translations,
      provider,
      model,
      changed_by
    )
    values(
      p_exercise_id,
      v_previous,
      v_name,
      v_target_revision,
      jsonb_build_object(
        'en',v_en,
        'fr',v_fr,
        'pt',v_pt
      ),
      v_provider,
      v_model,
      auth.uid()
    );
  end if;

  if v_promote then
    update public.exercise_catalog
    set
      name_es=v_name,
      name_admin_override=true,
      aliases=(
        select coalesce(
          array_agg(distinct value)
            filter (
              where length(trim(value))>0
            ),
          '{}'::text[]
        )
        from unnest(
          coalesce(aliases,'{}'::text[])
          || array[v_previous]
        ) as value
      ),
      revision=v_target_revision,
      updated_at=now()
    where id=p_exercise_id;
  end if;

  delete from public.exercise_name_translations
  where exercise_id=p_exercise_id;

  insert into public.exercise_name_translations(
    exercise_id,
    language,
    name,
    source_revision,
    provider,
    model,
    updated_by
  )
  values
    (
      p_exercise_id,
      'en',
      v_en,
      v_target_revision,
      v_provider,
      v_model,
      auth.uid()
    ),
    (
      p_exercise_id,
      'fr',
      v_fr,
      v_target_revision,
      v_provider,
      v_model,
      auth.uid()
    ),
    (
      p_exercise_id,
      'pt',
      v_pt,
      v_target_revision,
      v_provider,
      v_model,
      auth.uid()
    );

  return jsonb_build_object(
    'ok',true,
    'exerciseId',p_exercise_id,
    'previousNameEs',v_previous,
    'nameEs',v_name,
    'revision',v_target_revision,
    'nameAdminOverride',true,
    'unchangedName',not v_changed,
    'translationStatus','ready',
    'translations',jsonb_build_object(
      'en',v_en,
      'fr',v_fr,
      'pt',v_pt
    )
  );
end
$$;

revoke all
on function public.iberfit_admin_rename_exercise_v1(
  text,
  text,
  bigint,
  jsonb,
  text,
  text
)
from public, anon;

grant execute
on function public.iberfit_admin_rename_exercise_v1(
  text,
  text,
  bigint,
  jsonb,
  text,
  text
)
to authenticated;


drop function if exists
  public.iberfit_exercise_catalog_public_v1(
    integer,
    integer
  );

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
on function public.iberfit_exercise_catalog_public_v1(
  integer,
  integer
)
from public;

grant execute
on function public.iberfit_exercise_catalog_public_v1(
  integer,
  integer
)
to anon, authenticated;