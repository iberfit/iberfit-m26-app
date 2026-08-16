create or replace function public.iberfit_search_exercises(
 p_query text default null,
 p_pattern text default null,
 p_equipment text default null,
 p_intent text default null,
 p_difficulty text default null,
 p_limit integer default 60,
 p_offset integer default 0
) returns table(
 id text,name_es text,name_source text,source text,pattern text,intent text,equipment text,difficulty text,
 primary_muscles text[],secondary_muscles text[],cues text[],instructions_es text[],precautions text[],units text[],tags text[],aliases text[],
 media_status text,review_status text,active boolean,total_count bigint
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
 select f.id,f.name_es,f.name_source,f.source,f.pattern,f.intent,f.equipment,f.difficulty,f.primary_muscles,f.secondary_muscles,f.cues,f.instructions_es,f.precautions,f.units,f.tags,f.aliases,f.media_status,f.review_status,f.active,count(*) over()
 from filtered f order by f.rank_score desc,f.name_es
 limit greatest(1,least(coalesce(p_limit,60),200)) offset greatest(coalesce(p_offset,0),0)
$$;
revoke all on function public.iberfit_search_exercises(text,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.iberfit_search_exercises(text,text,text,text,text,integer,integer) to authenticated;
create or replace function public.iberfit_exercise_facets() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'total',(select count(*) from public.exercise_catalog where active=true),
  'canonical',(select count(*) from public.exercise_catalog where active=true and source='IBERFIT_CANONICAL'),
  'external',(select count(*) from public.exercise_catalog where active=true and source<>'IBERFIT_CANONICAL'),
  'pendingEnrichment',(select count(*) from public.exercise_catalog where active=true and review_status='external_reference' and(name_es=name_source or cardinality(instructions_es)=0)),
  'patterns',coalesce((select jsonb_agg(v order by v) from(select distinct pattern v from public.exercise_catalog where active=true)x),'[]'::jsonb),
  'equipment',coalesce((select jsonb_agg(v order by v) from(select distinct equipment v from public.exercise_catalog where active=true)x),'[]'::jsonb),
  'intents',coalesce((select jsonb_agg(v order by v) from(select distinct intent v from public.exercise_catalog where active=true)x),'[]'::jsonb),
  'difficulties',coalesce((select jsonb_agg(v order by v) from(select distinct difficulty v from public.exercise_catalog where active=true)x),'[]'::jsonb)
 )
$$;
revoke all on function public.iberfit_exercise_facets() from public,anon;
grant execute on function public.iberfit_exercise_facets() to authenticated;;
