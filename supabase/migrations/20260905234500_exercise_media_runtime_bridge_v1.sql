-- IBERFIT Exercise Media Runtime Bridge v1
-- Public read surfaces contain exercise/brand content only. Writes remain admin-only.

create or replace function public.iberfit_exercise_catalog_public_v1(
  p_limit integer default 200,
  p_offset integer default 0
) returns table(
  id text,name_es text,name_source text,source text,source_id text,pattern text,intent text,equipment text,difficulty text,
  primary_muscles text[],secondary_muscles text[],cues text[],instructions_es text[],precautions text[],units text[],tags text[],aliases text[],
  media_status text,media jsonb,review_status text,active boolean,revision bigint,total_count bigint
)
language sql
stable
security definer
set search_path=''
as $$
  select e.id,e.name_es,e.name_source,e.source,e.source_id,e.pattern,e.intent,e.equipment,e.difficulty,
    e.primary_muscles,e.secondary_muscles,e.cues,e.instructions_es,e.precautions,e.units,e.tags,e.aliases,
    e.media_status,e.media,e.review_status,e.active,e.revision,count(*) over()
  from public.exercise_catalog e
  where e.active=true and e.review_status<>'retirado'
  order by e.name_es,e.id
  limit greatest(1,least(coalesce(p_limit,200),200))
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.iberfit_exercise_catalog_public_v1(integer,integer) from public;
grant execute on function public.iberfit_exercise_catalog_public_v1(integer,integer) to anon,authenticated;

create or replace function public.iberfit_exercise_media_manifest_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'schemaVersion',1,
    'release','IBERFIT_EXERCISE_MEDIA_DYNAMIC_V1',
    'generatedAt',to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'source',jsonb_build_object(
      'provider','IBERFIT',
      'ownership','IBERFIT',
      'attributionRequired',false,
      'delivery','supabase_storage'
    ),
    'summary',jsonb_build_object('approved',count(*),'published',count(*),'pending',0),
    'items',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'exercise_id',e.id,
          'name_es',e.name_es,
          'review_status','approved',
          'published',true,
          'coach_visible',coalesce((e.media->>'coachVisible')::boolean,true),
          'client_visible',coalesce((e.media->>'clientVisible')::boolean,false),
          'image_mode','main',
          'storage_path',e.media->'movement'->>'path',
          'muscle_group',coalesce(e.primary_muscles[1],e.pattern),
          'revision',e.revision
        ) order by e.name_es,e.id
      ),
      '[]'::jsonb
    )
  )
  from public.exercise_catalog e
  where e.active=true
    and e.media_status='aprobado'
    and e.media->>'schema'='iberfit.exercise.visual.v1'
    and e.media->>'style'='iberfit-premium-movement-pair-v1'
    and e.media->>'bucket'='iberfit-exercise-media'
    and e.media->>'published'='true'
    and e.media->'qa'->>'biomechanics'='approved'
    and e.media->'qa'->>'visual'='approved'
    and (coalesce((e.media->>'coachVisible')::boolean,false)=true or coalesce((e.media->>'clientVisible')::boolean,false)=true)
    and length(e.media->'movement'->>'path') between 3 and 260
    and e.media->'movement'->>'path' like e.id||'/%'
    and position('..' in (e.media->'movement'->>'path'))=0
    and e.media->'movement'->>'mime' in ('image/webp','image/png','image/jpeg');
$$;

revoke all on function public.iberfit_exercise_media_manifest_v1() from public;
grant execute on function public.iberfit_exercise_media_manifest_v1() to anon,authenticated;

create or replace function public.iberfit_finalize_exercise_media_v1(
  p_exercise_id text,
  p_manifest jsonb
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_path text;
  v_mime text;
  v_updated integer:=0;
begin
  if (select public.iberfit_role())::text<>'admin' then
    raise exception 'IBERFIT_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_manifest is null or jsonb_typeof(p_manifest)<>'object' then
    raise exception 'IBERFIT_MEDIA_MANIFEST_INVALID' using errcode='22023';
  end if;
  v_path:=p_manifest->'movement'->>'path';
  v_mime:=p_manifest->'movement'->>'mime';
  if p_manifest->>'schema'<>'iberfit.exercise.visual.v1'
    or p_manifest->>'style'<>'iberfit-premium-movement-pair-v1'
    or p_manifest->>'bucket'<>'iberfit-exercise-media'
    or p_manifest->>'published'<>'true'
    or p_manifest->'qa'->>'biomechanics'<>'approved'
    or p_manifest->'qa'->>'visual'<>'approved'
    or not (coalesce((p_manifest->>'coachVisible')::boolean,false) or coalesce((p_manifest->>'clientVisible')::boolean,false))
    or v_path is null
    or length(v_path) not between 3 and 260
    or v_path not like p_exercise_id||'/%'
    or position('..' in v_path)>0
    or v_mime not in ('image/webp','image/png','image/jpeg') then
    raise exception 'IBERFIT_MEDIA_MANIFEST_NOT_APPROVED' using errcode='22023';
  end if;

  update public.exercise_catalog
     set media=p_manifest,
         media_status='aprobado',
         revision=revision+1,
         updated_at=now()
   where id=p_exercise_id and active=true;
  get diagnostics v_updated=row_count;
  if v_updated<>1 then
    raise exception 'IBERFIT_EXERCISE_NOT_FOUND' using errcode='P0002';
  end if;

  update public.exercise_media_jobs
     set status='ready',output_manifest=p_manifest,last_error=null,completed_at=now(),updated_at=now()
   where exercise_id=p_exercise_id and status in('queued','generating','qa');

  return jsonb_build_object('ok',true,'exerciseId',p_exercise_id,'mediaStatus','aprobado');
end
$$;

revoke all on function public.iberfit_finalize_exercise_media_v1(text,jsonb) from public,anon;
grant execute on function public.iberfit_finalize_exercise_media_v1(text,jsonb) to authenticated;
