-- IBERFIT · Custom Exercise Creation v1
-- Coach/Admin creation through a narrow SECURITY DEFINER RPC.
-- Direct exercise_catalog INSERT policies remain unchanged.
-- Custom exercises enter the existing canonical catalog and are reviewable.

create or replace function public.iberfit_create_custom_exercise_v1(
  p_name_es text,
  p_pattern text,
  p_intent text,
  p_equipment text,
  p_difficulty text,
  p_primary_muscles text[] default '{}'::text[],
  p_secondary_muscles text[] default '{}'::text[],
  p_cues text[] default '{}'::text[],
  p_instructions_es text[] default '{}'::text[],
  p_precautions text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce((select public.iberfit_role())::text, '');
  v_id text;
  v_name text;
  v_name_key text;
  v_pattern text;
  v_intent text;
  v_equipment text;
  v_difficulty text;
  v_primary text[];
  v_secondary text[];
  v_cues text[];
  v_instructions text[];
  v_precautions text[];
begin
  if v_actor is null then
    raise exception 'IBERFIT_AUTH_REQUIRED'
      using errcode='28000';
  end if;

  if v_role not in ('coach','admin') then
    raise exception 'IBERFIT_COACH_OR_ADMIN_REQUIRED'
      using errcode='42501';
  end if;

  v_name := regexp_replace(trim(coalesce(p_name_es,'')), '[[:space:]]+', ' ', 'g');
  v_pattern := regexp_replace(trim(coalesce(p_pattern,'')), '[[:space:]]+', ' ', 'g');
  v_intent := regexp_replace(trim(coalesce(p_intent,'')), '[[:space:]]+', ' ', 'g');
  v_equipment := regexp_replace(trim(coalesce(p_equipment,'')), '[[:space:]]+', ' ', 'g');
  v_difficulty := regexp_replace(trim(coalesce(p_difficulty,'')), '[[:space:]]+', ' ', 'g');

  if char_length(v_name) not between 2 and 160
    or char_length(v_pattern) not between 2 and 80
    or char_length(v_intent) not between 2 and 80
    or char_length(v_equipment) not between 2 and 80
    or char_length(v_difficulty) not between 2 and 40
  then
    raise exception 'IBERFIT_CUSTOM_EXERCISE_INVALID'
      using errcode='22023';
  end if;

  select coalesce(array_agg(value order by ordinal), '{}'::text[])
  into v_primary
  from (
    select ordinal,
      regexp_replace(trim(item), '[[:space:]]+', ' ', 'g') as value
    from unnest(coalesce(p_primary_muscles,'{}'::text[])) with ordinality as u(item, ordinal)
    where trim(coalesce(item,'')) <> ''
  ) normalized;

  select coalesce(array_agg(value order by ordinal), '{}'::text[])
  into v_secondary
  from (
    select ordinal,
      regexp_replace(trim(item), '[[:space:]]+', ' ', 'g') as value
    from unnest(coalesce(p_secondary_muscles,'{}'::text[])) with ordinality as u(item, ordinal)
    where trim(coalesce(item,'')) <> ''
  ) normalized;

  select coalesce(array_agg(value order by ordinal), '{}'::text[])
  into v_cues
  from (
    select ordinal,
      regexp_replace(trim(item), '[[:space:]]+', ' ', 'g') as value
    from unnest(coalesce(p_cues,'{}'::text[])) with ordinality as u(item, ordinal)
    where trim(coalesce(item,'')) <> ''
  ) normalized;

  select coalesce(array_agg(value order by ordinal), '{}'::text[])
  into v_instructions
  from (
    select ordinal,
      regexp_replace(trim(item), '[[:space:]]+', ' ', 'g') as value
    from unnest(coalesce(p_instructions_es,'{}'::text[])) with ordinality as u(item, ordinal)
    where trim(coalesce(item,'')) <> ''
  ) normalized;

  select coalesce(array_agg(value order by ordinal), '{}'::text[])
  into v_precautions
  from (
    select ordinal,
      regexp_replace(trim(item), '[[:space:]]+', ' ', 'g') as value
    from unnest(coalesce(p_precautions,'{}'::text[])) with ordinality as u(item, ordinal)
    where trim(coalesce(item,'')) <> ''
  ) normalized;

  if coalesce(array_length(v_primary,1),0) > 12
    or coalesce(array_length(v_secondary,1),0) > 12
    or coalesce(array_length(v_cues,1),0) > 12
    or coalesce(array_length(v_instructions,1),0) > 20
    or coalesce(array_length(v_precautions,1),0) > 12
    or exists (select 1 from unnest(v_primary || v_secondary) as x where char_length(x) > 80)
    or exists (select 1 from unnest(v_cues || v_instructions || v_precautions) as x where char_length(x) > 240)
  then
    raise exception 'IBERFIT_CUSTOM_EXERCISE_LIST_INVALID'
      using errcode='22023';
  end if;

  v_name_key := lower(v_name);

  -- Serialize equal-name creation attempts so concurrent requests cannot
  -- create duplicate visible exercises with the same canonical Spanish name.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('iberfit-custom-exercise:' || v_name_key, 0)
  );

  if exists (
    select 1
    from public.exercise_catalog e
    where e.active=true
      and e.review_status <> 'retirado'
      and lower(regexp_replace(trim(e.name_es), '[[:space:]]+', ' ', 'g'))=v_name_key
  ) then
    raise exception 'IBERFIT_EXERCISE_NAME_DUPLICATE'
      using errcode='23505';
  end if;

  v_id := 'IBF-CUSTOM-' || upper(replace(gen_random_uuid()::text, '-', ''));

  insert into public.exercise_catalog (
    id,
    name_es,
    name_source,
    source,
    source_id,
    pattern,
    intent,
    equipment,
    difficulty,
    primary_muscles,
    secondary_muscles,
    cues,
    instructions_es,
    precautions,
    units,
    tags,
    aliases,
    media_status,
    media,
    review_status,
    active,
    revision,
    name_admin_override
  ) values (
    v_id,
    v_name,
    v_name,
    'IBERFIT_COACH_CUSTOM',
    v_id,
    v_pattern,
    v_intent,
    v_equipment,
    v_difficulty,
    v_primary,
    v_secondary,
    v_cues,
    v_instructions,
    v_precautions,
    array['repeticiones','kg','segundos']::text[],
    array['personalizado']::text[],
    array[v_name]::text[],
    'sin_media',
    '{}'::jsonb,
    'pendiente',
    true,
    1,
    false
  );

  return jsonb_build_object(
    'ok', true,
    'exerciseId', v_id,
    'nameEs', v_name,
    'revision', 1,
    'source', 'IBERFIT_COACH_CUSTOM',
    'reviewStatus', 'pendiente',
    'active', true
  );
end;
$$;

revoke all
on function public.iberfit_create_custom_exercise_v1(
  text,text,text,text,text,text[],text[],text[],text[],text[]
)
from public;

revoke execute
on function public.iberfit_create_custom_exercise_v1(
  text,text,text,text,text,text[],text[],text[],text[],text[]
)
from anon;

grant execute
on function public.iberfit_create_custom_exercise_v1(
  text,text,text,text,text,text[],text[],text[],text[],text[]
)
to authenticated;

comment on function public.iberfit_create_custom_exercise_v1(
  text,text,text,text,text,text[],text[],text[],text[],text[]
) is 'Creates one active IBERFIT custom exercise for authenticated Coach/Admin actors without granting direct table INSERT to Coach.';
